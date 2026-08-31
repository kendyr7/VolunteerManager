import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

// Exercise the actual client effect without accounts, browser permissions or APIs.
const source = await readFile(new URL('../components/BrowserThemeColor.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const feedbackSource = await readFile(new URL('../lib/status-bar-feedback.ts', import.meta.url), 'utf8');
const compiledFeedback = ts.transpileModule(feedbackSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
let color = '#050505';
let writes = 0;
let content = '#4d7cfe';
let metas = [{ get content() { return content; }, set content(value) { writes++; content = value; } }];
const root = {};
const head = { querySelectorAll: () => metas };
const observers = [];
const documentListeners = new Map();
const windowListeners = new Map();
const timeouts = new Map();
let now = 1000;
let nextTimer = 0;
const document = {
  documentElement: root, head, hidden: false,
  addEventListener: (name, callback) => documentListeners.set(name, callback),
  removeEventListener: name => documentListeners.delete(name),
};
function advance(milliseconds) {
  const target = now + milliseconds;
  while (true) {
    const next = [...timeouts.entries()].filter(([, timer]) => timer.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
    if (!next) break;
    now = next[1].at;
    timeouts.delete(next[0]);
    next[1].callback();
  }
  now = target;
}
let cleanup;
const exports = {};
const feedback = {};
const context = vm.createContext({
  exports: feedback,
  require: name => {
    if (name === '@/lib/status-bar-feedback') return feedback;
    assert.equal(name, 'react');
    return { useEffect: effect => { cleanup = effect(); } };
  },
  document,
  window: {
    addEventListener: (name, callback) => windowListeners.set(name, callback),
    removeEventListener: name => windowListeners.delete(name),
  },
  Date: { now: () => now },
  setTimeout: (callback, delay) => { const id = ++nextTimer; timeouts.set(id, { at: now + delay, callback }); return id; },
  clearTimeout: id => timeouts.delete(id),
  getComputedStyle: () => ({ getPropertyValue: name => { assert.equal(name, '--dark'); return color; } }),
  MutationObserver: class {
    constructor(callback) { this.callback = callback; observers.push(this); }
    observe(target, options) { this.target = target; this.options = options; }
    disconnect() { this.disconnected = true; }
  },
});
vm.runInContext(compiledFeedback, context);
context.exports = exports;
vm.runInContext(compiled, context);
exports.BrowserThemeColor();
assert.equal(content, '#050505', 'Initial chrome matches actual dark background');
assert.equal(observers.length, 2);
const themeObserver = observers.find(observer => observer.target === root);
const headObserver = observers.find(observer => observer.target === head);
assert.ok(themeObserver.options.attributeFilter.includes('class'));
assert.ok(headObserver.options.childList && headObserver.options.subtree);
color = ' #f8fafb ';
themeObserver.callback();
assert.equal(content, '#f8fafb', 'Manual, system and login theme changes use the CSS surface');
const previousWrites = writes;
headObserver.callback();
assert.equal(writes, previousWrites, 'Own metadata mutations do not cause an observer loop');
content = '#050505';
headObserver.callback();
assert.equal(content, '#f8fafb', 'Next navigation metadata resets do not override app theme');
metas = [{ content: '#050505' }];
headObserver.callback();
assert.equal(metas[0].content, '#f8fafb', 'Replacement viewport nodes are synchronized');
metas = [];
assert.doesNotThrow(() => headObserver.callback(), 'Temporarily absent metadata is safe');
metas = [{ content: '#f8fafb' }];
color = '';
themeObserver.callback();
assert.equal(metas[0].content, '#f8fafb', 'Unloaded CSS does not erase the fallback color');
color = '#050505';
themeObserver.callback();
assert.equal(metas[0].content, '#050505', 'Switching back to dark updates chrome');

for (const [type, expectedColor, duration] of [
  ['success', '#047857', 2000], ['error', '#be123c', 3000], ['info', '#315ee0', 2000],
]) {
  const release = feedback.startStatusBarFeedback(type);
  assert.equal(metas[0].content, expectedColor, `${type} uses its semantic color`);
  advance(duration - 1);
  assert.equal(metas[0].content, expectedColor, `${type} remains active until its deadline`);
  advance(1);
  assert.equal(metas[0].content, '#050505', `${type} automatically restores the theme`);
  release();
  assert.equal(timeouts.size, 0, 'Expired feedback leaves no timers');
}

const closeEarly = feedback.startStatusBarFeedback('success');
closeEarly();
assert.equal(metas[0].content, '#050505', 'Early toast dismissal restores chrome');
assert.equal(timeouts.size, 0);
const oldRelease = feedback.startStatusBarFeedback('success');
const oldTimerCallback = [...timeouts.values()][0].callback;
advance(1000);
const newRelease = feedback.startStatusBarFeedback('error');
oldRelease();
oldTimerCallback();
assert.equal(metas[0].content, '#be123c', 'Stale toast cleanup and timer cannot clear a newer error');
assert.equal(timeouts.size, 1, 'Consecutive messages keep only one color timer');
advance(1000);
assert.equal(metas[0].content, '#be123c');
color = '#f8fafb';
themeObserver.callback();
assert.equal(metas[0].content, '#be123c', 'Theme changes do not prematurely end the feedback');
metas = [{ content: '#050505' }];
headObserver.callback();
assert.equal(metas[0].content, '#be123c', 'Navigation metadata replacements preserve active feedback');
advance(2000);
assert.equal(metas[0].content, '#f8fafb', 'Expiry restores the CURRENT theme, not an old captured theme');
newRelease();

feedback.startStatusBarFeedback('info');
document.hidden = true;
documentListeners.get('visibilitychange')();
assert.equal(metas[0].content, '#f8fafb', 'Hiding the app clears transient feedback');
feedback.startStatusBarFeedback('error');
assert.equal(timeouts.size, 0, 'Background notifications do not replay stale feedback');
document.hidden = false;
documentListeners.get('visibilitychange')();
feedback.startStatusBarFeedback('success');
now += 3000; // Simulate suspended browser timers / back-forward cache.
windowListeners.get('pageshow')();
assert.equal(metas[0].content, '#f8fafb', 'Returning after expiry never shows stale success');

cleanup();
assert.ok(observers.every(observer => observer.disconnected), 'Unmount disconnects both observers');
assert.equal(timeouts.size, 0);
assert.equal(documentListeners.size + windowListeners.size, 0, 'Unmount removes event listeners');

// A child toast can mount before the root effect subscribes (also in Strict Mode).
const beforeMountRelease = feedback.startStatusBarFeedback('info');
exports.BrowserThemeColor();
assert.equal(metas[0].content, '#315ee0', 'Already visible toasts are picked up on subscription');
beforeMountRelease();
assert.equal(metas[0].content, '#f8fafb');
cleanup();
context.window = undefined;
assert.doesNotThrow(() => feedback.startStatusBarFeedback('success')(), 'Server execution remains inert');
assert.equal(feedback.getStatusBarFeedbackColor(), null);
const manifest = JSON.parse(await readFile(new URL('../public/manifest.json', import.meta.url), 'utf8'));
assert.equal(manifest.theme_color, '#050505');
assert.equal(manifest.background_color, '#050505');
console.log('Browser theme color: all checks passed (CSS theme, timed toast feedback, overlap, navigation, visibility, cleanup and manifest).');
