import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let blocked = false, fail = false, failTable = null, failSecurity = false, failRevocation = false;
let stallQueries = false, stallSecurity = false;
const waitForAbort = signal => new Promise(resolve => {
  if (signal.aborted) resolve();
  else signal.addEventListener("abort", resolve, { once: true });
});
let queries = [], limits = [], cookieValues = new Map();
let signedSession = null;
let rows = {
  profiles: [{ id: "staff", full_name: "Ana Prueba", phone: "+50500000000", pin: "1234" }],
  volunteers: [
    { id: "one", first_name: "Luis", last_name: "Prueba", phone: "00000000", pin: "1234", status: "active" },
    { id: "two", first_name: "María", last_name: "Prueba", phone: "00000000", pin: "5678", status: "active" },
    { id: "archived", first_name: "Archivado", phone: "00000000", pin: "1234", status: "archived" },
  ],
  passkeys: [{ user_id: "one", credential_id: "credential-one" }, { user_id: "two", credential_id: "credential-two" }],
};
const db = { from(table) {
  const calls = [["from", table]];
  queries.push(calls);
  const filters = [];
  let single = false;
  let querySignal;
  const query = {
    select(...args) { calls.push(["select", ...args]); return query; },
    abortSignal(signal) { querySignal = signal; calls.push(["abortSignal", signal]); return query; },
    retry(enabled) { calls.push(["retry", enabled]); return query; },
    update() { return query; },
    in(field, values) { calls.push(["in", field, values]); filters.push(row => values.includes(row[field])); return query; },
    eq(field, value) { calls.push(["eq", field, value]); filters.push(row => row[field] === value); return query; },
    neq(field, value) { filters.push(row => row[field] !== value); return query; },
    maybeSingle() { single = true; return query; },
    single() { single = true; return query; },
    then(resolve, reject) {
      if (stallQueries) return waitForAbort(querySignal).then(() => ({ data: null, error: { message: "aborted" } })).then(resolve, reject);
      const matches = (rows[table] || []).filter(row => filters.every(filter => filter(row)));
      return Promise.resolve({ data: single ? matches[0] || null : matches, error: fail || failTable === table ? { message: "test database unavailable" } : null }).then(resolve, reject);
    },
  };
  return query;
} };
const mocks = {
  "server-only": {},
  "@/lib/supabase/admin": { getAdminSupabase: async () => db },
  "@/lib/auth-rate-limit": {
    getServerActionClientIp: async () => "test-ip", getClientIp: () => "test-ip",
    rateLimitMinutes: seconds => Math.ceil(seconds / 60), clearAuthRateLimit: async () => {},
    consumeAuthRateLimit: async options => {
      limits.push(options);
      if (stallSecurity) { await waitForAbort(options.signal); throw Error("security timed out"); }
      if (failSecurity) throw Error("security unavailable");
      return { allowed: !blocked, retryAfterSeconds: 120 };
    },
  },
  "@/lib/whatsapp": { formatE164: phone => `+505${phone}` },
  "@/lib/auth": { SESSION_MAX_AGE_SECONDS: 3600, signSession: data => { signedSession = data; return "test-session"; } },
  "@/lib/push/device": { revokePushDevice: async () => { if (failRevocation) throw Error("revocation unavailable"); } },
  "next/headers": { cookies: async () => ({
    set: (key, value) => cookieValues.set(key, value),
    get: key => cookieValues.has(key) ? { value: cookieValues.get(key) } : undefined,
    delete: key => cookieValues.delete(key),
  }) },
  "next/server": { NextResponse: { json: (data, init) => Response.json(data, init) } },
  "@simplewebauthn/server": {
    generateAuthenticationOptions: async options => ({ ...options, challenge: "test-challenge" }),
    verifyAuthenticationResponse: async ({ response }) => ({ verified: response.testValid === true, authenticationInfo: { newCounter: 1 } }),
  },
};
function load(path, globals = {}) {
  const source = ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => {
    if (!(name in mocks)) throw new Error(`Unexpected import: ${name}`);
    return mocks[name];
  }, console, process: { env: { NODE_ENV: "test" } }, Buffer, FormData, performance, AbortSignal, ...globals });
  return exports;
}
let count = 0;
function check(value, message) { assert.ok(value, message); count++; }
const { getLoginProfiles } = load("app/actions/login-profiles.ts");
mocks["@/lib/auth-timing"] = load("lib/auth-timing.ts");
for (const phone of ["", "123", "000000000", "abcdefgh", null]) {
  const before = queries.length;
  check((await getLoginProfiles(phone)).error && before === queries.length, "Reject invalid phone before database lookup");
}
let result = await getLoginProfiles("00000000");
check(result.profiles.length === 3, "Return all active people even when PINs differ");
check(!JSON.stringify(result).includes('"pin"') && !JSON.stringify(result).includes('"phone"'), "Never return credentials or unnecessary phone data");
check(queries.every(query => !query.find(call => call[0] === "select")[1].includes("pin")), "Never query PINs for name lookup");
check(limits.some(item => item.scope === "login-lookup-ip") && limits.some(item => item.scope === "login-lookup-phone"), "Limit account enumeration by IP and phone");
blocked = true;
const before = queries.length;
check((await getLoginProfiles("00000000")).error && queries.length === before, "Blocked lookup must not read profiles");
blocked = false;
fail = true;
check(!(await getLoginProfiles("00000000")).profiles, "Database errors must not expose partial results");
fail = false;
check((await getLoginProfiles("11111111")).error, "Unknown phone returns recoverable error");

const { loginWithPin } = load("app/actions/auth.ts");
async function login(phone, id, pin = "1234", type = "volunteer") {
  const data = new FormData();
  Object.entries({ phone, pin, ...(id ? { selectedUserId: id, selectedUserType: type } : {}) }).forEach(([key, value]) => data.set(key, value));
  return loginWithPin({}, data);
}
check((await login("00000000", "one")).force_pin_change, "Selected account accepts its own phone and PIN");
check((await login("11111111", "one")).error, "A selected ID cannot bypass phone ownership");
check((await login("00000000", "two")).error, "A relative's PIN cannot authenticate the selected person");
check((await login("00000000", "archived")).error, "Archived volunteers cannot authenticate by selected ID");
check((await login("11111111", "staff", "1234", "profile")).error, "Staff selections also require matching phone");

let queryStart = queries.length;
let limitStart = limits.length;
check((await login("00000000", null, "abcd")).error && queries.length === queryStart && limits.length === limitStart, "Invalid PIN format does not consume remote requests");
check((await login("00000000", "one", "1234", "invalid")).error && queries.length === queryStart, "Invalid selected type cannot choose a different account class");
blocked = true;
check((await login("00000000", null, "5678")).error && queries.length === queryStart, "Rate limiting remains a gate before any credential query");
blocked = false; failSecurity = true;
check((await login("00000000", null, "5678")).error && queries.length === queryStart, "Unavailable rate limiter fails closed without credential reads");
failSecurity = false; failTable = "profiles"; cookieValues.clear();
result = await login("00000000", null, "5678");
check(result.error?.includes("conexión") && !cookieValues.has("session"), "Partial query failure neither reports wrong PIN nor authenticates from the other table");
failTable = null;
queryStart = queries.length;
result = await login("00000000", null, "5678");
const successfulQueries = queries.slice(queryStart);
check(result.success && successfulQueries.length === 2, "Successful unselected login reuses verified data instead of a third query");
check(successfulQueries.every(query => query.some(call => call[0] === "eq" && call[1] === "pin") && !query.find(call => call[0] === "select")[1].includes("pin")), "PIN is checked in database and is not downloaded with candidate records");
check(successfulQueries.every(query => query.some(call => call[0] === "retry" && call[1] === false)), "Interactive PIN reads disable silent exponential retries");
check(successfulQueries.every(query => query.some(call => call[0] === "abortSignal" && call[1] === limits.at(-1).signal)), "Credential reads and security checks share the same timeout budget");
queryStart = queries.length;
await login("00000000", "two", "5678");
check(queries.length === queryStart + 1, "Selected volunteer login makes only one credential query");
failRevocation = true; cookieValues.clear();
result = await login("00000000", "two", "5678");
check(result.error && !cookieValues.has("session"), "A failed push-device revocation cannot issue a new session");
failRevocation = false;

const deadlineBudgets = [];
const { loginWithPin: deadlineLogin } = load("app/actions/auth.ts", { AbortSignal: {
  timeout(ms) {
    deadlineBudgets.push(ms);
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);
    return controller.signal;
  },
} });
const deadlineForm = new FormData();
deadlineForm.set("phone", "00000000"); deadlineForm.set("pin", "5678");
cookieValues.clear(); stallQueries = true;
result = await deadlineLogin({}, deadlineForm);
check(result.error?.includes("conexión") && !result.error.includes("incorrecto") && !cookieValues.has("session"), "Lookup timeout aborts safely and is not reported as a wrong PIN");
stallQueries = false; stallSecurity = true;
queryStart = queries.length;
result = await deadlineLogin({}, deadlineForm);
check(result.error?.includes("conexión") && queries.length === queryStart && !cookieValues.has("session"), "Security timeout stops before credential reads and cannot authenticate");
stallSecurity = false;
check(deadlineBudgets.length === 2 && deadlineBudgets.every(ms => ms === 4000), "Each verification uses a single four-second budget, not four seconds per request");

const originalRows = structuredClone(rows);
rows.profiles[0].pin = "4321";
rows.profiles[0].role = "Coordinador";
rows.volunteers = [rows.volunteers[0]];
rows.volunteers[0].pin = "5678";
result = await login("00000000", null, "4321");
check(result.success && result.redirectTo === "/dashboard" && !result.require_profile_selection, "Coordinator PIN bypasses chooser on a shared coordinator/volunteer number");
result = await login("00000000", null, "5678");
check(result.success && result.redirectTo === "/calendar" && !result.require_profile_selection, "Volunteer PIN bypasses chooser on a shared coordinator/volunteer number");
check((await login("00000000", null, "9999")).error, "Incorrect PIN never exposes a chooser");
rows.volunteers.push({ ...originalRows.volunteers[1], pin: "5678" });
result = await login("00000000", null, "5678");
check(result.require_profile_selection && result.profiles.length === 2 && result.profiles.every(person => person.userType === "volunteer"), "Only volunteers with shared credentials appear in the chooser");
check(!JSON.stringify(result).includes('"pin"'), "Chooser does not disclose the validated PIN");
check((await login("00000000", null, "4321")).success, "Coordinator remains accessible when several volunteers also share the number");
check((await login("00000000", "two", "5678")).success, "Revalidate the chosen volunteer with the already-entered PIN");
rows.profiles[0].pin = "5678";
cookieValues.clear();
result = await login("00000000", null, "5678");
check(result.error && !result.require_profile_selection && !cookieValues.has("session"), "An accidental staff/volunteer PIN collision never guesses a privileged account");
rows = originalRows;

const { POST } = load("app/api/webauthn/authenticate/generate-options/route.ts");
async function biometric(id, type = "volunteer") {
  return POST(new Request("https://test.invalid/api/webauthn/authenticate/generate-options", {
    method: "POST", body: JSON.stringify({ phone: "00000000", ...(id ? { selectedUserId: id, selectedUserType: type } : {}) }),
  }));
}
result = await biometric("two");
const options = await result.json();
check(result.status === 200 && options.allowCredentials.length === 1 && options.allowCredentials[0].id === "credential-two", "Offer only selected person's passkeys");
check(JSON.parse(cookieValues.get("webauthn_auth_user")).userId === "two", "Bind biometric challenge to selected person");
check((await biometric("unknown")).status === 404, "Reject a selected profile not associated with the phone");
check((await biometric("two", "invalid")).status === 400, "Validate selected account type");

rows.passkeys.forEach(passkey => { passkey.public_key = "00"; passkey.counter = 0; });
rows.passkeys.unshift({ user_id: "staff", credential_id: "credential-staff", public_key: "00", counter: 0 });
const { POST: verifyBiometric } = load("app/api/webauthn/authenticate/verify/route.ts");
async function verify(id, testValid = true) {
  return verifyBiometric(new Request("https://test.invalid/api/webauthn/authenticate/verify", {
    method: "POST", body: JSON.stringify({ id, testValid }),
  }));
}
await biometric();
check(JSON.parse(cookieValues.get("webauthn_auth_user")).candidates.length === 3, "Unselected shared phone challenge includes all eligible credential owners");
result = await verify("credential-two");
check(result.status === 200 && signedSession.userId === "two" && signedSession.userType === "volunteer", "A volunteer's credential resolves its actual owner even when coordinator is first");
await biometric();
result = await verify("credential-staff");
check(result.status === 200 && signedSession.userId === "staff" && signedSession.userType === "profile", "A coordinator's credential resolves to coordinator on same phone");
await biometric("two");
cookieValues.delete("session");
check((await verify("credential-staff")).status === 400 && !cookieValues.has("session"), "Selected profile challenge rejects a different person's credential");
check((await verify("credential-two", false)).status === 400 && !cookieValues.has("session"), "Unverified signature cannot authenticate even when credential owner matches");
check((await verify("credential-two")).status === 200, "Existing single-account challenge remains supported");
check((await verify("credential-two")).status === 400, "Consumed challenge cannot be reused");
console.log(`${count} login/profile checks passed (mocked services; no real accounts or database writes).`);
