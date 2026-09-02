import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Deterministic component tests: fake clock/storage/services, real component
// code and event handlers. No production account or database is touched.
let now = 1_800_000_000_000;
const storage = new Map();
let storageBlocked = false;
const localStorage = {
  getItem(key) { if (storageBlocked) throw Error("Storage blocked"); return storage.get(key) ?? null; },
  setItem(key, value) { if (storageBlocked) throw Error("Storage blocked"); storage.set(key, String(value)); },
  removeItem(key) { if (storageBlocked) throw Error("Storage blocked"); storage.delete(key); },
};
const intervals = new Map(), listeners = new Map();
const timeouts = new Map();
let nextTimer = 1;
const scheduleTimeout = (fn, ms) => { const id = nextTimer++; timeouts.set(id, { fn, at: now + ms }); return id; };
const cancelTimeout = id => timeouts.delete(id);
const advanceTimeouts = ms => {
  now += ms;
  for (const [id, timer] of timeouts) {
    if (timer.at <= now) { timeouts.delete(id); timer.fn(); }
  }
};
const on = (name, fn) => { const group = listeners.get(name) ?? new Set(); group.add(fn); listeners.set(name, group); };
const off = (name, fn) => listeners.get(name)?.delete(fn);
const windowMock = {
  localStorage, location: { search: "", href: "" }, innerWidth: 390,
  matchMedia: () => ({ matches: windowMock.innerWidth <= 767 }),
  addEventListener: on, removeEventListener: off,
  setInterval(fn, ms) { const id = nextTimer++; intervals.set(id, { fn, ms }); return id; },
  clearInterval: id => intervals.delete(id),
};
const documentMock = { hidden: false, addEventListener: on, removeEventListener: off, querySelectorAll: () => [] };
const emit = (name, event) => [...(listeners.get(name) ?? [])].forEach(fn => fn(event));
const tick = ms => [...intervals.values()].filter(timer => timer.ms === ms).forEach(timer => timer.fn());
const settle = () => new Promise(resolve => setImmediate(resolve));

let active;
const react = {
  useCallback: callback => callback,
  useState(initial) {
    const host = active, index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = typeof initial === "function" ? initial() : initial;
    return [host.slots[index], value => { host.slots[index] = typeof value === "function" ? value(host.slots[index]) : value; }];
  },
  useRef(initial) {
    const host = active, index = host.cursor++;
    if (!(index in host.slots)) host.slots[index] = { current: initial };
    return host.slots[index];
  },
  useEffect(fn, deps) {
    const host = active, index = host.cursor++;
    const previous = host.slots[index];
    if (!previous || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      host.pending.push(() => {
        previous?.cleanup?.();
        host.slots[index] = { deps, cleanup: fn() };
      });
    }
  },
};
function mount(component, props) {
  const host = { slots: [], pending: [], cursor: 0 };
  return {
    render() {
      host.cursor = 0;
      active = host;
      const tree = component(props);
      host.pending.splice(0).forEach(effect => effect());
      return tree;
    },
    cleanup() { host.slots.forEach(slot => slot?.cleanup?.()); },
  };
}
const jsx = (type, props, key) => ({ type, props, key });
const mocks = {
  react,
  "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
  "next/image": { default: "Image" },
  "next/navigation": { useRouter: () => ({}) },
  "@/components/ui/mesh-gradient": { MeshGradientBackground: "Mesh" },
  "@/components/ui/animated-logo": { AnimatedLogo: "Logo" },
  "./mobile-login.module.css": { default: new Proxy({}, { get: (_, key) => key }) },
  "./MobilePinLogin": { MobilePinLogin: "MobilePinLogin" },
  "@/components/ui/label": { Label: "Label" },
  "lucide-react": { Square: "Square", Asterisk: "Asterisk", Triangle: "Triangle", Circle: "Circle" },
  "framer-motion": { AnimatePresence: "Presence", motion: {} },
  "react-dom": { createPortal: child => child },
  "@simplewebauthn/browser": { startAuthentication: async () => ({}) },
  "@/app/actions/update-pin": { updateInitialPin: async () => ({}) },
  "@/app/actions/dashboard": { getDashboardOperationalDataAction: async () => ({}) },
  "@/lib/dashboard-session-cache": {
    DASHBOARD_SIMULATION_STORAGE_KEY: "dashboard-simulation-test",
    clearPreparedDashboardSession: () => {},
    writePreparedDashboardSession: () => {},
  },
};
function load(path) {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports = {};
  vm.runInNewContext(output, {
    exports, require: name => { if (!(name in mocks)) throw Error(`Unexpected import: ${name}`); return mocks[name]; },
    window: windowMock, document: documentMock, navigator: { userAgent: "iPhone", maxTouchPoints: 1 },
    localStorage, Date: class extends Date { static now() { return now; } },
    console, FormData, URLSearchParams, setTimeout: scheduleTimeout, clearTimeout: cancelTimeout,
  });
  return exports;
}
function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return null;
  if (predicate(tree)) return tree;
  for (const child of [tree.props?.children].flat(Infinity)) {
    const match = find(child, predicate);
    if (match) return match;
  }
  return null;
}
let count = 0;
function check(value, message) { assert.ok(value, message); count++; }
const experience = load("lib/login-experience.ts");
mocks["@/lib/login-experience"] = experience;
const { LOGIN_ACTIVITY_KEY, LOGIN_INTRO_IDLE_MS, shouldShowTemple, recordLoginActivity, rememberLoginPhone, normalizeLoginPhone } = experience;
for (const value of ["00000000", "0000 0000", "50500000000", "+505 0000-0000", "(+505) 0000 0000", "00505 0000 0000"]) {
  check(normalizeLoginPhone(value) === "00000000", "Complete Nicaragua phone formats normalize to the same local number");
}
check(normalizeLoginPhone("50501234") === "50501234", "A local eight-digit number starting with 505 is not shortened");
check(normalizeLoginPhone("+1 202 555 0100") === "12025550100", "Unknown international prefixes are not guessed or truncated");
rememberLoginPhone("+505 0000 0000", true, "Ana Prueba");
check(storage.get("volunteer_phone") === "00000000" && storage.get("remember_me") === "true", "Saving an international phone preserves the remember preference and stores only eight digits");
for (const invalid of [null, NaN, Infinity, -1, 0, now + 1000]) check(shouldShowTemple(invalid, now), "Unknown/invalid activity shows temple");
check(!shouldShowTemple(now - LOGIN_INTRO_IDLE_MS + 1, now), "Recent visit skips temple");
check(shouldShowTemple(now - LOGIN_INTRO_IDLE_MS, now), "Thirty minute boundary shows temple");
rememberLoginPhone("00000000", true);
check(storage.get("volunteer_phone") === "00000000" && storage.get("remember_me") === "true", "Phone can be remembered before authentication, without a stored name");
recordLoginActivity(now);
rememberLoginPhone("00000000", false);
check(!storage.has("volunteer_phone") && storage.get(LOGIN_ACTIVITY_KEY) === String(now), "Not remembering phone does not erase recent activity");
const { MobileLoginShell } = load("app/(auth)/login/MobileLoginShell.tsx");
const currentPage = tree => find(tree, node => node.props?.className === "swipeTrack").props["data-page"];
const shell = () => mount(MobileLoginShell, { isDark: true, hero: "Temple quote", children: "Login" });
let view = shell();
check(currentPage(view.render()) === null, "Hydration does not flash the temple");
await settle();
let tree = view.render();
check(currentPage(tree) === 1, "Recent visit starts at login without remembering number");
check(!find(tree, node => node.props?.className === "swipeTrack").props["data-animate"], "Direct return has no slide-in animation");
view.cleanup();
storage.set(LOGIN_ACTIVITY_KEY, String(now - LOGIN_INTRO_IDLE_MS));
view = shell(); view.render(); await settle();
check(currentPage(view.render()) === 0, "Long absence starts at temple");
for (let i = 0; i < 10; i++) tick(1000);
check(currentPage(view.render()) === 1, "Temple still advances automatically after ten seconds");
now += LOGIN_INTRO_IDLE_MS;
tick(15000);
check(currentPage(view.render()) === 0, "Foreground inactivity returns to temple");
for (let i = 0; i < 10; i++) tick(1000);
view.render(); tick(15000);
check(currentPage(view.render()) === 1, "An idle period does not repeatedly loop between temple and login");
documentMock.hidden = true;
now += LOGIN_INTRO_IDLE_MS;
documentMock.hidden = false; emit("visibilitychange");
check(currentPage(view.render()) === 0, "Returning from a long background absence shows temple");
tree = view.render();
find(tree, node => node.props?.className === "heroContinue").props.onClick();
check(currentPage(view.render()) === 1, "Manual continue still opens login");
tree = view.render();
tree.props.onPointerDown({ isPrimary: true, pointerType: "touch", pointerId: 1, clientX: 80, clientY: 200, timeStamp: 0, target: { closest: () => null }, currentTarget: { setPointerCapture() {} } });
tree.props.onPointerUp({ pointerId: 1, clientX: 240, clientY: 205, timeStamp: 200 });
check(currentPage(view.render()) === 0, "Swipe right still opens temple");
view.cleanup();
const { LoginActivityTracker } = load("components/LoginActivityTracker.tsx");
view = mount(LoginActivityTracker, {}); view.render();
const before = storage.get(LOGIN_ACTIVITY_KEY);
now += 5000;
emit("visibilitychange");
check(storage.get(LOGIN_ACTIVITY_KEY) === before, "Passive visibility events do not overwrite inactivity");
emit("pointerdown");
check(storage.get(LOGIN_ACTIVITY_KEY) === String(now), "Interaction elsewhere in the app counts toward recent activity");
view.cleanup();
storageBlocked = true;
check(!shouldShowTemple(experience.readLoginActivity(), now), "Blocked storage has an in-memory fallback");
rememberLoginPhone("00000000", true); recordLoginActivity(now);
check(true, "Storage restrictions do not throw during login");
storageBlocked = false;

const staff = { id: "staff", firstName: "Ana", lastName: "Prueba", committee: "", userType: "profile" };
const volunteer = { id: "one", firstName: "Ana", lastName: "Prueba", committee: "", userType: "volunteer" };
check(experience.loginDisplayName([staff, volunteer]) === "Ana Prueba", "Same person's coordinator and volunteer accounts keep their name");
check(experience.loginDisplayName([staff, { ...volunteer, firstName: "Luis" }]) === "", "Do not guess whose name to show for two different people");
let available = [staff, volunteer], loginResult = {}, submitted = [];
mocks["@/app/actions/login-profiles"] = { getLoginProfiles: async () => ({ profiles: available }) };
mocks["@/app/actions/auth"] = { loginWithPin: async (_, data) => { submitted.push(Object.fromEntries(data)); return loginResult; } };
const { LoginForm } = load("app/(auth)/login/LoginForm.tsx");
for (const value of ["50500000000", "+505 0000 0000", "00505 0000 0000", "50501234"]) {
  storage.set("remember_me", "true"); storage.set("volunteer_phone", value); storage.set("volunteer_name", "Ana Prueba");
  const restored = mount(LoginForm, { mobile: true }); restored.render();
  const props = find(restored.render(), node => node.type === "MobilePinLogin").props;
  check(props.phone === normalizeLoginPhone(value) && props.rememberMe && props.name === "Ana Prueba", "Legacy stored number restores as eight digits and retains the saved identity");
  check(storage.get("volunteer_phone") === props.phone, "Legacy storage is migrated to local format for subsequent visits");
  props.onSubmitPin("9876"); await settle();
  check(submitted.at(-1).phone === props.phone && submitted.at(-1).phone.length === 8, "Remembered phone is submitted without the country prefix");
  restored.cleanup();
}
storage.set("remember_me", "true"); storage.set("volunteer_phone", "+1 202 555 0100");
const invalidSavedPhone = mount(LoginForm, { mobile: true }); invalidSavedPhone.render();
const invalidSavedProps = find(invalidSavedPhone.render(), node => node.type === "MobilePinLogin").props;
check(invalidSavedProps.phone === "" && !invalidSavedProps.rememberMe && !storage.has("volunteer_phone"), "An unsupported saved number is not silently turned into a different person's number");
invalidSavedPhone.cleanup();
rememberLoginPhone("00000000", false);
view = mount(LoginForm, { mobile: true }); view.render();
const mobileProps = () => find(view.render(), node => node.type === "MobilePinLogin").props;
mobileProps().onPhoneChange("00000000");
mobileProps().onRememberChange(true);
check(await mobileProps().onContinuePhone(), "Mixed coordinator/volunteer lookup succeeds");
check(mobileProps().profiles.length === 0 && mobileProps().name === "Ana Prueba", "Mixed accounts open PIN entry, not the chooser");
mobileProps().onPinChange("4321");
mobileProps().onSubmitPin("4321"); await settle();
check(submitted.at(-1).pin === "4321" && !submitted.at(-1).selectedUserId, "Mixed accounts submit phone and PIN without locking into volunteer identity");
check(storage.get("volunteer_phone") === "00000000", "Remembered phone persists after lookup without completing login");
const secondVolunteer = { ...volunteer, id: "two", firstName: "Luis" };
loginResult = { require_profile_selection: true, profiles: [volunteer, secondVolunteer] };
mobileProps().onPinChange("5678"); mobileProps().onSubmitPin("5678"); await settle();
check(mobileProps().profiles.length === 2, "Shared volunteer PIN displays the server-confirmed candidates");
check(!mobileProps().pinAccepted && timeouts.size === 0, "Profile selection never shows green or starts a success delay");
loginResult = {};
mobileProps().onSelectProfile(secondVolunteer); await settle();
check(submitted.at(-1).selectedUserId === "two" && submitted.at(-1).pin === "5678", "Choosing a volunteer submits the existing PIN without asking twice");
loginResult = { error: "PIN incorrecto" };
mobileProps().onSubmitPin("0000"); await settle();
check(mobileProps().pinRejected && !mobileProps().pinAccepted && !mobileProps().busy && timeouts.size === 0, "Wrong PIN feedback is immediate, red only, with no animation delay");
let resolveLogin;
loginResult = new Promise(resolve => { resolveLogin = resolve; });
mobileProps().onPinChange("5678"); mobileProps().onSubmitPin("5678"); await settle();
check(mobileProps().busy && !mobileProps().pinAccepted && !windowMock.location.href, "Four digits and a pending server response never imply success");
resolveLogin({ success: true, name: "Luis Prueba", redirectTo: "/calendar" }); await settle();
check(mobileProps().pinAccepted && mobileProps().busy && !mobileProps().pinRejected, "Verified PIN shows success while controls remain locked");
check(!find(view.render(), node => node.props?.["aria-label"] === "Cargando tu espacio") && !windowMock.location.href, "Green confirmation precedes both loading overlay and navigation");
const submittedBeforeSuccess = submitted.length;
mobileProps().onSubmitPin("5678"); await settle();
check(submitted.length === submittedBeforeSuccess, "Success animation cannot trigger duplicate authentication");
advanceTimeouts(419); await settle();
check(!windowMock.location.href, "Confirmation remains visible for its short presentation window");
advanceTimeouts(1); await settle();
check(windowMock.location.href === "/calendar" && find(view.render(), node => node.props?.["aria-label"] === "Cargando tu espacio"), "After 420ms the existing loading screen and navigation proceed");
view.cleanup();

windowMock.location.href = "";
view = mount(LoginForm, { mobile: true }); view.render();
loginResult = { success: true };
mobileProps().onSubmitPin("5678"); await settle();
check(mobileProps().pinAccepted && timeouts.size === 1, "A fresh verified attempt schedules only one confirmation");
view.cleanup(); await settle(); advanceTimeouts(420); await settle();
check(timeouts.size === 0 && !windowMock.location.href, "Leaving during success cancels the timer and prevents late navigation");

view = mount(LoginForm, { mobile: true }); view.render();
loginResult = new Promise(resolve => { resolveLogin = resolve; });
mobileProps().onSubmitPin("5678"); view.cleanup();
resolveLogin({ success: true }); await settle();
check(timeouts.size === 0 && !windowMock.location.href, "A server response after unmount cannot start an animation or navigate");

view = mount(LoginForm, { mobile: true }); view.render();
loginResult = { force_pin_change: true, user_id: "one", user_type: "volunteer" };
mobileProps().onSubmitPin("1234"); await settle();
check(!find(view.render(), node => node.type === "MobilePinLogin") && !windowMock.location.href && timeouts.size === 0, "Initial PIN change remains a separate flow without an incorrect redirect");
view.cleanup();

const { MobilePinLogin } = load("app/(auth)/login/MobilePinLogin.tsx");
let lookedUp = 0;
const pinProps = { phone: "00000000", pin: "", name: "", rememberMe: true, busy: false, pinAccepted: false, profiles: [], onContinuePhone: async () => { lookedUp++; return true; } };
view = mount(MobilePinLogin, pinProps);
tree = view.render(); await settle();
check(lookedUp === 1 && find(tree, node => node.props?.className === "pinForm"), "Remembered number opens PIN immediately even without a saved name");
view.render();
check(lookedUp === 1, "Restoring remembered number only performs one lookup");
view.cleanup();
view = mount(MobilePinLogin, { ...pinProps, rememberMe: false, phone: "" });
check(find(view.render(), node => node.props?.className === "phoneForm"), "Unremembered number opens phone form");
view.cleanup();
let editedPhone = "";
view = mount(MobilePinLogin, { ...pinProps, rememberMe: false, phone: "", onPhoneChange: value => { editedPhone = value; } });
const phoneField = find(view.render(), node => node.props?.id === "mobile-phone");
check(phoneField.props.maxLength >= 16 && phoneField.props.autoComplete === "tel-national", "Browser autofill can deliver the entire international number before normalization");
for (const value of ["+505 0000 0000", "50500000000", "00505 0000 0000"]) {
  phoneField.props.onChange({ target: { value } });
  check(editedPhone === "00000000", "Mobile autofill and paste remove the complete 505 prefix before applying the eight-digit limit");
}
view.cleanup();

// Hardware keyboard support in the responsive/mobile presentation.
const bodyTarget = { closest: () => null };
documentMock.body = bodyTarget;
documentMock.documentElement = { closest: () => null };
let hiddenPin = false, openDialog = false;
const pinPanel = { contains: target => target?.inPinPanel === true };
const pinInput = {
  getClientRects: () => [{}],
  closest: selector => selector.includes("inert") ? (hiddenPin ? {} : null) : pinPanel,
};
documentMock.querySelectorAll = () => openDialog ? [{ getClientRects: () => [{}] }] : [];
const hardwareSubmissions = [];
const hardwareProps = {
  ...pinProps, pin: "", name: "Ana", rememberMe: true,
  onPinChange: value => { hardwareProps.pin = value; },
  onSubmitPin: value => { hardwareSubmissions.push(value); },
};
view = mount(MobilePinLogin, hardwareProps);
function renderPin() {
  const output = view.render();
  const input = find(output, node => node.props?.id === "mobile-pin");
  if (input) input.props.ref.current = pinInput;
  return output;
}
function key(value, options = {}) {
  const event = { key: value, target: bodyTarget, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...options };
  emit("keydown", event);
  return event;
}
renderPin(); await settle();
key("1"); tree = renderPin();
check(hardwareProps.pin === "1", "Physical digits work without focusing the invisible PIN input");
check(find(tree, node => node.props?.className === "pinSlots").props.children.filter(slot => slot.props["data-current"]).length === 1, "Only one PIN pill receives the discreet focus indicator");
check(find(tree, node => node.props?.className === "pinSlots").props.children[1].props["data-current"], "Focus indicator follows the next PIN digit");
const firstRevision = find(tree, node => node.type === "Square").key;
key("2", { target: { inPinPanel: true, closest: () => null } }); tree = renderPin();
check(hardwareProps.pin === "12", "Physical digits still work after focusing an on-screen keypad button");
check(find(tree, node => node.type === "Square").key === firstRevision, "Typing the next digit does not restart earlier shape animations");
key("3"); renderPin(); key("4"); renderPin(); key("5"); renderPin();
check(hardwareProps.pin === "1234" && hardwareSubmissions.length === 1, "Fourth digit submits exactly once and extra digits are ignored");
key("Backspace"); renderPin();
check(hardwareProps.pin === "123", "Physical Backspace removes one digit");
key("Delete"); renderPin();
check(hardwareProps.pin === "12", "Physical Delete removes one digit");
key("9", { repeat: true }); renderPin();
check(hardwareProps.pin === "12", "Holding a number does not flood the PIN with repeats");
for (const options of [{ ctrlKey: true }, { metaKey: true }, { altKey: true }, { isComposing: true }, { defaultPrevented: true }]) key("9", options);
key("a"); renderPin();
check(hardwareProps.pin === "12", "Shortcuts, IME composition and non-digits remain untouched");
const inputTarget = { closest: () => ({}) };
check(!key("9", { target: inputTarget }).defaultPrevented, "Native editing in a focused input is not captured twice");
tree = renderPin();
find(tree, node => node.props?.id === "mobile-pin").props.onChange({ target: { value: "92" } });
tree = renderPin();
check(hardwareProps.pin === "92" && find(tree, node => node.type === "Square").key !== firstRevision, "Replacing an existing digit retriggers only its shape animation");
hiddenPin = true; key("3"); renderPin();
check(hardwareProps.pin === "92", "Temple/inert panel does not capture keyboard input");
hiddenPin = false; openDialog = true; key("3"); renderPin();
check(hardwareProps.pin === "92", "Legal dialogs suspend PIN shortcuts");
openDialog = false; windowMock.innerWidth = 1024; key("3"); renderPin();
check(hardwareProps.pin === "92", "Hidden mobile login cannot capture typing in desktop layout");
windowMock.innerWidth = 390;
key("3", { target: { closest: () => null } }); renderPin();
check(hardwareProps.pin === "92", "Controls outside login panel retain their own keyboard behavior");
hardwareProps.busy = true; renderPin(); key("3"); renderPin();
check(hardwareProps.pin === "92", "No edits are allowed while authentication is running");
hardwareProps.busy = false; hardwareProps.profiles = [volunteer]; renderPin(); key("3"); renderPin();
check(hardwareProps.pin === "92", "Profile chooser does not capture PIN digits");
hardwareProps.profiles = []; renderPin();
const paste = { target: bodyTarget, clipboardData: { getData: () => "5678" }, preventDefault() { this.defaultPrevented = true; } };
emit("paste", paste); renderPin();
check(paste.defaultPrevented && hardwareProps.pin === "5678" && hardwareSubmissions.at(-1) === "5678", "Pasting a four-digit PIN works without focusing the hidden input");
hardwareProps.pinAccepted = true; hardwareProps.busy = true;
tree = renderPin();
check(find(tree, node => node.props?.className === "pinControl").props["data-valid"] === true, "Success styling is driven by confirmed authentication");
check(find(tree, node => node.props?.className === "pinSlots").props.children.every(slot => slot.props["data-filled"]), "Success fills all four PIN shapes");
check(find(tree, node => node.props?.className === "pinSlots").props.children.every(slot => !slot.props["data-current"]), "Successful verification hides the editing focus indicator");
check(find(tree, node => node.props?.id === "mobile-pin-status").props.children === "PIN correcto", "Success is announced in words, not only color");
key("Backspace"); renderPin();
check(hardwareProps.pin === "5678", "Keyboard cannot edit during the green confirmation");
view.cleanup();
check((listeners.get("keydown")?.size ?? 0) === 0 && (listeners.get("paste")?.size ?? 0) === 0, "Keyboard listeners are removed when leaving login");
console.log(`${count} login experience checks passed (component handlers, simulated clock/storage/services).`);
