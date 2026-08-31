import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

// Default: deterministic simulated latency. --live explicitly measures Supabase
// with an unassigned fictitious phone and isolated temporary rate-limit buckets.
// Pass the pre-change source on stdin with --baseline-stdin for an A/B comparison.
const live = process.argv.includes("--live");
const baseline = process.argv.includes("--baseline-stdin") ? readFileSync(0, "utf8") : null;
const delayMs = 60;
const pause = () => new Promise(resolve => setTimeout(resolve, delayMs));
const nonce = randomUUID();
const buckets = new Set();
let scenario = "optimized", active = 0, peak = 0, reads = 0;
let db;
const timings = [];
const safeConsole = {
  info(label, payload) { if (label === "[AUTH_TIMING]") timings.push(JSON.parse(payload)); },
  error() {},
};
const mocks = {
  "server-only": {},
  "node:crypto": { createHmac },
  "@/lib/whatsapp": { formatE164: () => "+50500000000" },
  "@/lib/auth": { signSession() { throw Error("Benchmark must never sign a session"); } },
  "@/lib/push/device": { revokePushDevice() { throw Error("Benchmark must never revoke a real device"); } },
  "next/headers": {
    headers: async () => new Headers({ "x-forwarded-for": "127.0.0.1" }),
    cookies: async () => { throw Error("Benchmark must never read or write session cookies"); },
  },
};
function load(source) {
  const exports = {};
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(code, {
    exports, require: name => {
      if (!(name in mocks)) throw Error(`Unexpected import: ${name}`);
      return mocks[name];
    }, process: { env: { ...process.env, NODE_ENV: "development" } },
    console: safeConsole, performance, AbortSignal, FormData, Buffer,
  });
  return exports;
}

if (live) {
  const { default: nextEnv } = await import("@next/env");
  nextEnv.loadEnvConfig(process.cwd());
  const { createClient } = await import("@supabase/supabase-js");
  db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } });
  // Refuse to run if the fictitious number has unexpectedly been assigned.
  for (const table of ["profiles", "volunteers"]) {
    const result = await db.from(table).select("id")
      .in("phone", ["00000000", "50500000000", "+50500000000"])
      .abortSignal(AbortSignal.timeout(5000)).retry(false);
    if (result.error) throw Error("Benchmark preflight cannot reach Supabase; no accounts were tested.");
    assert.equal(result.data.length, 0, "Fictitious benchmark phone must be unassigned");
  }
  mocks["@/lib/supabase/admin"] = { getAdminSupabase: async () => db };
  const actualLimits = load(readFileSync("lib/auth-rate-limit.ts", "utf8"));
  mocks["@/lib/auth-rate-limit"] = {
    ...actualLimits,
    consumeAuthRateLimit(options) {
      const scope = `pin-benchmark-${nonce}-${scenario}-${options.scope}`;
      const key = createHmac("sha256", process.env.JWT_SECRET)
        .update(`${scope}:${options.identifier.trim().toLowerCase()}`).digest("hex");
      buckets.add(key);
      // Same RPC and limits, but never consume a real person's login allowance.
      return actualLimits.consumeAuthRateLimit({ ...options, scope });
    },
    clearAuthRateLimit() { throw Error("Benchmark must not clear real login limits"); },
  };
} else {
  db = { from() {
    const query = {
      select() { return query; }, in() { return query; }, eq() { return query; },
      neq() { return query; }, abortSignal() { return query; }, retry() { return query; },
      async then(resolve, reject) {
        reads++; active++; peak = Math.max(peak, active);
        try { await pause(); return resolve({ data: [], error: null }); }
        catch (error) { return reject(error); }
        finally { active--; }
      },
    };
    return query;
  } };
  mocks["@/lib/supabase/admin"] = { getAdminSupabase: async () => db };
  mocks["@/lib/auth-rate-limit"] = {
    getServerActionClientIp: async () => "benchmark-ip",
    consumeAuthRateLimit: async () => { await pause(); return { allowed: true, retryAfterSeconds: 1 }; },
    rateLimitMinutes: () => 1,
    clearAuthRateLimit() { throw Error("Invalid PIN must not clear rate limits"); },
  };
}
mocks["@/lib/auth-timing"] = load(readFileSync("lib/auth-timing.ts", "utf8"));

try {
  const results = [];
  for (const [name, source] of [
    ...(baseline ? [["before", baseline]] : []),
    ["optimized", readFileSync("app/actions/auth.ts", "utf8")],
  ]) {
    scenario = name;
    const { loginWithPin } = load(source);
    const samplesMs = [];
    for (let sample = 0; sample < 3; sample++) {
      const form = new FormData();
      form.set("phone", "00000000"); form.set("pin", "9876");
      active = 0; peak = 0; reads = 0;
      const start = performance.now();
      const result = await loginWithPin({}, form);
      samplesMs.push(Math.round(performance.now() - start));
      assert.equal(result.error, "El teléfono o PIN es incorrecto.", "Benchmark must only exercise rejected credentials");
      if (!live) {
        assert.equal(reads, 2, "Phone-based lookup should use exactly two reads");
        assert.equal(peak, name === "before" ? 1 : 2, "Only optimized lookups should overlap");
      }
    }
    results.push({ scenario: name, samplesMs, medianMs: [...samplesMs].sort((a, b) => a - b)[1] });
  }
  console.log(JSON.stringify({ mode: live ? "live_supabase_isolated_test" : "simulated_60ms_per_request", results, phases: timings }, null, 2));
} finally {
  if (live && buckets.size) {
    // Delete only the exact HMAC keys created by this benchmark's random namespace.
    const { error } = await db.from("auth_rate_limits").delete().in("bucket_key", [...buckets])
      .abortSignal(AbortSignal.timeout(5000));
    if (error) {
      console.error("Temporary benchmark rate-limit buckets could not be removed; real login buckets were not touched.");
      process.exitCode = 1;
    } else {
      console.log("Temporary benchmark rate-limit buckets removed; no real account or session was changed.");
    }
  }
}
