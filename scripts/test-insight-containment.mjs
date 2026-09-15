// Run with Node 20+ from a checkout with the existing dev dependencies installed:
// node scripts/test-insight-containment.mjs
// Executes actual handlers in an isolated VM. All Auth, database, fetch and timers are fake;
// no network access, business records, provider calls or production credentials are used.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const proofs = [];
const changed = ['scheduled-rescore', 'backfill-scores', 'job-monitor', 'bulk-regenerate-briefs', 'ai-search', 'generate-city-summaries', 'generate-investor-brief', 'fix-insight-labels'];
const held = new Set(changed.slice(3, 7));
const envBase = {
  SUPABASE_URL: 'https://backend.invalid', SUPABASE_SERVICE_ROLE_KEY: 'private-service-fixture', SUPABASE_ANON_KEY: 'public-anon-fixture',
  AZURE_OPENAI_API_KEY: 'fake-azure', AZURE_OPENAI_ENDPOINT: 'https://azure.invalid', AZURE_OPENAI_DEPLOYMENT: 'fake-model',
  GROQ_API_KEY: 'fake-groq', LOVABLE_API_KEY: 'fake-lovable',
};
function harness(name, options = {}) {
  const calls = []; const timers = new Map(); let timerId = 0; let handler;
  const env = { ...envBase, ...options.env };
  const user = options.user === false ? null : { id: '11111111-1111-4111-8111-111111111111', is_anonymous: options.anonymous === true, email_confirmed_at: '2020-01-01T00:00:00Z', ...options.userFields };
  const property = { id: '22222222-2222-4222-8222-222222222222', address: '1 Fixture St', city: 'Fixture', state: 'NY', zip: '12345', snap_score: 80, open_violations: 1, total_violations: 1, enforcement_type: 'code_violation', distress_signals: [], violation_types: ['fixture'], avg_days_open: 30 };
  function query(table) {
    const state = { table, methods: [] };
    let proxy;
    const result = () => {
      const single = state.methods.some(([m]) => ['single', 'maybeSingle'].includes(m));
      if (table === 'user_roles') {
        calls.push({ kind: 'role', methods: state.methods });
        if (options.stallRole) return new Promise(() => {});
        return { data: options.role === false ? null : { role: 'admin' }, error: options.roleError ? { message: 'unavailable' } : null };
      }
      calls.push({ kind: 'data', table, methods: state.methods });
      let rows = [];
      if (options.rows) {
        if (table === 'properties') rows = [property];
        if (table === 'jurisdictions') rows = [{ id: property.id, city: 'Fixture', state: 'NY', county: 'Fixture', enforcement_profile: {} }];
        if (table === 'property_contacts') rows = [{ name: 'Synthetic foreign owner', phone: '000-000-0000', email: 'fixture@example.invalid', source: 'synthetic' }];
      }
      const writing = state.methods.some(([m]) => ['insert', 'update', 'upsert', 'delete'].includes(m));
      return { data: single ? rows[0] ?? null : rows, error: null, count: writing ? 0 : table === 'system_logs' ? 0 : rows.length };
    };
    proxy = new Proxy({}, { get(_, method) {
      if (method === 'then') return (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
      return (...args) => { state.methods.push([method, ...args]); return proxy; };
    }});
    return proxy;
  }
  const createClient = (url, key, clientOptions) => {
    calls.push({ kind: 'client', key, url });
    return {
      auth: { admin: { async getUserById(id) {
        calls.push({ kind: 'current-auth', id });
        if (options.stallCurrentAuth) return new Promise(() => {});
        return { data: { user: options.deletedCurrent ? null : { ...user, ...options.currentFields } }, error: null };
      } }, async getUser(token) {
        calls.push({ kind: 'auth', token });
        if (options.stallAuth) return new Promise(() => {});
        if (options.throwAuth) throw new Error('auth unavailable');
        return { data: { user: token && !['invalid', 'expired', 'revoked', env.SUPABASE_ANON_KEY].includes(token) ? user : null }, error: null };
      } },
      from: query,
      rpc: async (name, args) => { calls.push({ kind: 'rpc', name, args }); return { data: [], error: null }; },
      functions: { invoke: async (name, args) => { calls.push({ kind: 'invoke', name, args }); return { data: {}, error: null }; } },
    };
  };
  const fetcher = async (url, init = {}) => {
    calls.push({ kind: 'fetch', url: String(url), init });
    if (String(url).includes('backend.invalid')) return new Response(JSON.stringify(options.upstreamBody ?? { error: 'held-fixture' }), { status: options.upstreamStatus ?? 503 });
    return new Response(JSON.stringify({ choices: [{ message: { content: 'Fixture summary. Synthetic record only.', tool_calls: [] } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200 });
  };
  const context = vm.createContext({ Request, Response, Headers, AbortController, URL, TextEncoder, TextDecoder, fetch: fetcher,
    console: { log() {}, error() {}, warn() {} },
    Deno: { env: { get: key => { calls.push({ kind: 'env', key }); return env[key]; } }, serve: fn => { handler = fn; } },
    EdgeRuntime: { waitUntil: promise => { calls.push({ kind: 'background' }); Promise.resolve(promise).catch(() => {}); } },
    setTimeout: (fn, ms) => { const id = ++timerId; timers.set(id, { fn, ms }); return id; }, clearTimeout: id => timers.delete(id),
  });
  const loaded = new Map();
  function load(file) {
    if (loaded.has(file)) return loaded.get(file);
    const module = { exports: {} }; loaded.set(file, module.exports);
    const source = fs.readFileSync(file, 'utf8');
    const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const localRequire = target => {
      if (target.startsWith('https://deno.land/')) return { serve: fn => { handler = fn; } };
      if (target.startsWith('https://esm.sh/@supabase/supabase-js@')) return { createClient };
      if (!target.startsWith('.')) throw new Error(`Unapproved test module ${target}`);
      return load(path.resolve(path.dirname(file), target));
    };
    vm.runInContext(`(function(require,module,exports){${compiled}\n})`, context, { filename: file })(localRequire, module, module.exports);
    loaded.set(file, module.exports); return module.exports;
  }
  load(path.join(root, 'supabase/functions', name, 'index.ts'));
  return { calls, timers, request: (headers = {}, body = {}, signal, method = 'POST') => handler(new Request('https://function.invalid', { method, headers: { 'Content-Type': 'application/json', ...headers }, ...(method === 'GET' ? {} : { body: JSON.stringify(body) }), signal })) };
}
const business = h => h.calls.filter(c => ['data', 'fetch', 'rpc', 'invoke', 'background'].includes(c.kind));
async function check(name, run) { await run(); proofs.push(name); }

const denied = [
  ['no auth', {}, {}, 401], ['public anon Bearer', { Authorization: 'Bearer public-anon-fixture' }, {}, 401],
  ['public anon internal header', { 'x-internal-secret': 'public-anon-fixture' }, {}, 401],
  ['claimed cron', { 'x-cron': 'true', 'x-internal-secret': 'wrong' }, {}, 401],
  ['invalid token', { Authorization: 'Bearer invalid' }, {}, 401], ['expired token', { Authorization: 'Bearer expired' }, {}, 401],
  ['revoked user', { Authorization: 'Bearer revoked' }, {}, 401], ['anonymous user', { Authorization: 'Bearer anon-user' }, { anonymous: true }, 401],
  ['ordinary/expired-subscription customer', { Authorization: 'Bearer customer' }, { role: false }, 403],
  ['revoked admin role', { Authorization: 'Bearer prior-admin' }, { role: false }, 403],
  ['unconfirmed account', { Authorization: 'Bearer admin' }, { userFields: { email_confirmed_at: null } }, 401],
  ['deleted account returned by Auth', { Authorization: 'Bearer admin' }, { userFields: { deleted_at: '2026-01-01T00:00:00Z' } }, 401],
  ['banned account returned by Auth', { Authorization: 'Bearer admin' }, { userFields: { banned_until: '2099-01-01T00:00:00Z' } }, 401],
  ['fresh Auth account deleted', { Authorization: 'Bearer admin' }, { deletedCurrent: true }, 401],
  ['fresh Auth account banned', { Authorization: 'Bearer admin' }, { currentFields: { banned_until: '2099-01-01T00:00:00Z' } }, 401],
  ['fresh Auth wrong account', { Authorization: 'Bearer admin' }, { currentFields: { id: 'foreign-user' } }, 401],
  ['role query error', { Authorization: 'Bearer admin' }, { roleError: true }, 503],
  ['missing private credential', { 'x-internal-secret': 'undefined' }, { env: { SUPABASE_SERVICE_ROLE_KEY: undefined } }, 503],
  ['anon/private misconfiguration', { Authorization: 'Bearer public-anon-fixture' }, { env: { SUPABASE_SERVICE_ROLE_KEY: 'public-anon-fixture' } }, 503],
];
for (const name of changed) {
  for (const [label, headers, options, status] of denied) await check(`${name}: ${label} denied before business data/provider`, async () => {
    const h = harness(name, options); const response = await h.request(headers, { autoResume: false, query: 'synthetic', offset: 0 });
    assert.equal(response.status, status, `${name}: ${label}`); assert.deepEqual(business(h), []);
    assert(!h.calls.some(c => c.kind === 'env' && /AZURE|GROQ|LOVABLE/.test(c.key)));
  });
  for (const [label, headers] of [['current admin', { Authorization: 'Bearer admin' }], ['exact internal header', { 'x-internal-secret': 'private-service-fixture' }], ['exact private Bearer', { Authorization: 'Bearer private-service-fixture' }]]) await check(`${name}: ${label} ${held.has(name) ? 'remains held' : 'authorized empty maintenance path'}`, async () => {
    const h = harness(name); const response = await h.request(headers, { autoResume: false });
    assert.equal(response.status, held.has(name) ? 503 : 200);
    if (held.has(name)) { assert.equal((await response.json()).error, 'insights_held'); assert.deepEqual(business(h), []); }
    if (label !== 'current admin') assert(!h.calls.some(c => c.kind === 'auth'));
    else assert(h.calls.some(c => c.kind === 'role' && c.methods.some(m => m[0] === 'eq' && m[1] === 'user_id' && m[2] === '11111111-1111-4111-8111-111111111111')));
  });
  await check(`${name}: GET rejected`, async () => { const h = harness(name); assert.equal((await h.request({}, {}, undefined, 'GET')).status, 405); assert.deepEqual(business(h), []); });
}
for (const name of ['scheduled-rescore', 'backfill-scores']) await check(`${name}: held downstream stops continuation and does not claim success`, async () => {
  const h = harness(name, { rows: true }); const response = await h.request({ 'x-internal-secret': 'private-service-fixture' }, { autoResume: true });
  assert.equal(response.status, 503); const body = await response.json(); assert.equal(body.success, false); assert.equal(body.auto_continuing, false);
  assert.equal(h.calls.filter(c => c.kind === 'fetch').length, 1); assert(!h.calls.some(c => c.kind === 'background'));
});
for (const name of ['scheduled-rescore', 'backfill-scores']) {
  for (const upstreamBody of [{}, { success: false, processed: 1 }, { error: 'failed', processed: 1 }, { processed: -1 }, { processed: 0 }, { processed: 2 }, { processed: 0.5 }, { processed: '1' }]) await check(`${name}: rejects malformed/incomplete 200 result ${JSON.stringify(upstreamBody)}`, async () => {
    const h = harness(name, { rows: true, upstreamStatus: 200, upstreamBody }); const response = await h.request({ 'x-internal-secret': 'private-service-fixture' }, { autoResume: true });
    assert.equal(response.status, 502); const body = await response.json(); assert.equal(body.success, false); assert.equal(body.auto_continuing, false);
    assert.equal(h.calls.filter(c => c.kind === 'fetch').length, 1); assert(!h.calls.some(c => c.kind === 'background'));
  });
  await check(`${name}: preserves valid full-batch response`, async () => {
    const h = harness(name, { rows: true, upstreamStatus: 200, upstreamBody: { processed: 1 } }); const response = await h.request({ 'x-internal-secret': 'private-service-fixture' }, { autoResume: false });
    assert.equal(response.status, 200); assert.equal((await response.json()).processed, 1);
  });
}
for (const type of ['Auth', 'CurrentAuth', 'Role']) await check(`bounded stalled ${type} returns unavailable without business work`, async () => {
  const h = harness('ai-search', { ['stall' + type]: true }); const waiting = h.request({ Authorization: 'Bearer admin' }, { query: 'fixture' });
  await new Promise(resolve => setImmediate(resolve));
  const timeout = [...h.timers.values()].find(v => v.ms === 10000); assert(timeout); timeout.fn();
  assert.equal((await waiting).status, 503); assert.deepEqual(business(h), []);
});
await check('request cancellation stops pending authorization', async () => {
  const h = harness('job-monitor', { stallAuth: true }); const controller = new AbortController();
  const pending = h.request({ Authorization: 'Bearer admin' }, {}, controller.signal); controller.abort();
  assert.equal((await pending).status, 503); assert.deepEqual(business(h), []);
});
for (const name of ['bulk-rescore', 'refresh-outdated-insights', 'backfill-insights']) await check(`unchanged ${name} missing credentials already denied`, async () => {
  const h = harness(name); assert.equal((await h.request()).status, 401); assert.deepEqual(business(h), []);
});
for (const name of ['generate-insights', 'bulk-generate-missing-insights']) await check(`unchanged ${name} already unconditional hold`, async () => {
  const h = harness(name); assert.equal((await h.request({ Authorization: 'Bearer private-service-fixture' })).status, 503); assert.deepEqual(business(h), []);
});
const result = { passed: proofs.length, failed: 0, scope: 'Actual transpiled handlers; injected fake backend/provider only; no network, endpoint invocation, records or production writes', checks: proofs };
console.log(JSON.stringify({ passed: result.passed, failed: result.failed }));
