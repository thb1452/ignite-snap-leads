// Execute actual TypeScript handlers with fake Auth, DB, timers and providers.
// No network, credentials, live account, paid request or real recipient is used.
// Run: node scripts/test-relaunch-security.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const ts = createRequire(import.meta.url)('typescript');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envBase = {
  SUPABASE_URL: 'https://fixture.invalid',
  SUPABASE_SERVICE_ROLE_KEY: 'synthetic-service-key-never-valid-outside-tests',
  SUPABASE_ANON_KEY: 'synthetic-public-key-never-valid-outside-tests',
  INTERNAL_FUNCTION_SECRET: 'synthetic-dedicated-scheduler-key-not-a-real-secret',
  SNAP_PROXY_SECRET: 'synthetic-proxy-secret', LOVABLE_API_KEY: 'synthetic-email-key',
  BATCHDATA_API_KEY: 'synthetic-provider-key', RESEND_API_KEY: 'synthetic-resend-key',
};
const checks = [];
function harness(name, options = {}) {
  let handler;
  const calls = [];
  const env = { ...envBase, ...options.env };
  const query = (table, clientKey) => {
    const methods = [];
    let proxy;
    proxy = new Proxy({}, { get(_, method) {
      if (method === 'then') return (resolve, reject) => {
        calls.push({ kind: 'db', table, methods, clientKey });
        let data = [];
        if (table === 'profiles') data = { org_id: 'private-fixture-org', ...options.profile };
        if (table === 'email_send_state') data = null;
        return Promise.resolve({ data, error: null, count: 0 }).then(resolve, reject);
      };
      return (...args) => { methods.push([method, ...args]); return proxy; };
    } });
    return proxy;
  };
  const createClient = (_url, key, clientOptions) => {
    calls.push({ kind: 'client', key, clientOptions });
    return {
      auth: { getUser: async () => {
        calls.push({ kind: 'auth', key });
        return { data: { user: options.invalidUser ? null : {
          id: 'fixture-customer', email: 'customer@example.invalid', email_confirmed_at: '2020-01-01T00:00:00Z',
          ...options.user,
        } }, error: null };
      } },
      from: (table) => query(table, key),
      rpc: async (rpc, args) => {
        calls.push({ kind: 'rpc', rpc, args, key });
        if (rpc === 'fn_customer_workspace_ready_v1') {
          return { data: options.workspaceReady ?? false, error: options.workspaceError ? { message: 'missing migration' } : null };
        }
        return { data: options.rpcData?.[rpc] ?? [], error: null };
      },
    };
  };
  const logs = [];
  const context = vm.createContext({
    Request, Response, Headers, URL, URLSearchParams, TextEncoder, TextDecoder,
    AbortController, crypto: crypto.webcrypto, atob, btoa, setTimeout, clearTimeout,
    console: { log: (...args) => logs.push(args), warn: (...args) => logs.push(args), error: (...args) => logs.push(args) },
    Deno: { env: { get: (key) => env[key] }, serve: (fn) => { handler = fn; } },
    fetch: async (url, init) => {
      calls.push({ kind: 'provider', url: String(url), init });
      if (options.fetchError) throw new Error('synthetic unknown outcome');
      return new Response(JSON.stringify({ ok: true }), { status: options.fetchStatus ?? 200 });
    },
    EdgeRuntime: { waitUntil: () => { throw new Error('Background work must be explicit in this fixture'); } },
  });
  const cache = new Map();
  function load(file) {
    if (cache.has(file)) return cache.get(file).exports;
    const mod = { exports: {} };
    cache.set(file, mod);
    const result = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
      reportDiagnostics: true,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
    });
    assert.equal(result.diagnostics?.filter(d => d.category === ts.DiagnosticCategory.Error).length, 0, `${file}: syntax diagnostics`);
    const localRequire = (specifier) => {
      if (specifier.startsWith('.')) return load(path.resolve(path.dirname(file), specifier));
      if (specifier.includes('supabase-js')) return { createClient, corsHeaders: {} };
      if (specifier.includes('deno.land')) return { serve: (fn) => { handler = fn; } };
      if (specifier.includes('edge-runtime')) return {};
      if (specifier === 'node:crypto') return crypto;
      if (specifier.includes('email-js')) return { sendLovableEmail: async () => { calls.push({ kind: 'provider-email' }); throw new Error('Unexpected email'); } };
      if (specifier.includes('resend@2.0.0')) return { Resend: class {
        emails = { send: async (payload) => {
          calls.push({ kind: 'resend-email', payload });
          if (options.resendThrows) throw new Error('Provider exception containing customer@example.invalid and private text');
          return options.resendResult ?? { data: { id: 'fixture-email-accepted-id' }, error: null };
        } };
      } };
      throw new Error(`Unstubbed dependency: ${specifier}`);
    };
    vm.runInContext(`(function(require,module,exports){${result.outputText}\n})`, context, { filename: file })(localRequire, mod, mod.exports);
    return mod.exports;
  }
  const exports = load(path.join(root, 'supabase/functions', name));
  return { calls, logs, env, exports, handler: () => handler };
}
function request(headers = {}, body = {}, method = 'POST') {
  return new Request('https://fixture.invalid/edge', {
    method, headers: { 'content-type': 'application/json', ...headers },
    ...(method === 'GET' || method === 'OPTIONS' ? {} : { body: JSON.stringify(body) }),
  });
}
function noEffects(h, label) {
  assert.deepEqual(h.calls.filter(c => c.kind !== 'client'), [], `${label}: denial performed work`);
}
async function check(label, fn) { await fn(); checks.push(label); }
const workers = [
  'test-pipeline', 'migrate-to-external', 'backfill-property-aggregates',
  'distress-event-fanout', 'drip-runner', 'signal-delta-worker',
  'watchlist-fanout-worker', 'weekly-digest', 'process-email-queue',
  'snap-mcp-keepwarm', 'integration-revalidate',
];
const forgedRole = `fake.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.fake`;
const denials = [
  ['missing', {}], ['invalid', { authorization: 'Bearer invalid' }],
  ['ordinary-user', { authorization: 'Bearer ordinary-user-jwt-fixture' }],
  ['forged-role', { authorization: `Bearer ${forgedRole}` }],
  ['public-bearer', { authorization: `Bearer ${envBase.SUPABASE_ANON_KEY}` }],
  ['public-apikey', { apikey: envBase.SUPABASE_ANON_KEY }],
  ['public-internal-header', { 'x-internal-secret': envBase.SUPABASE_ANON_KEY }],
  ['cron-hint', { 'x-cron': 'true', 'x-internal-secret': 'old-static-cron-fixture' }],
];
for (const name of workers) {
  for (const [kind, headers] of denials) await check(`${name}/${kind}`, async () => {
    const h = harness(`${name}/index.ts`);
    const result = await h.handler()(request(headers, { force: true, action: 'migrate-table' }));
    assert.equal(result.status, 401, `${name}/${kind}`);
    noEffects(h, name);
  });
  await check(`${name}/get-denied`, async () => {
    const h = harness(`${name}/index.ts`);
    assert.equal((await h.handler()(request({ authorization: `Bearer ${envBase.SUPABASE_SERVICE_ROLE_KEY}` }, {}, 'GET'))).status, 405);
    noEffects(h, name);
  });
  await check(`${name}/missing-config`, async () => {
    const h = harness(`${name}/index.ts`, { env: { SUPABASE_SERVICE_ROLE_KEY: undefined, INTERNAL_FUNCTION_SECRET: undefined } });
    assert.equal((await h.handler()(request())).status, 503);
    noEffects(h, name);
  });
}
const held = [
  ['enrich-property-contact', 'enrichment'], ['integration-skip-trace', 'enrichment'],
  ['integration-send-sms', 'communications'], ['send-sms-threaded', 'communications'], ['drip-enroll', 'communications'],
  ['drip-runner', 'communications'], ['weekly-digest', 'digest'],
];
for (const [name, kind] of held) {
  for (const fixture of ['own-property', 'foreign-property', 'nonexistent-property', 'force']) await check(`${name}/held-${fixture}`, async () => {
    const h = harness(`${name}/index.ts`, { env: { ENABLE_SENDS: 'true', ENABLE_TRACING: 'true' } });
    const result = await h.handler()(request({ authorization: `Bearer ${envBase.SUPABASE_SERVICE_ROLE_KEY}` }, {
      property_id: fixture, lead_id: 'foreign-lead', drip_enrollment_id: 'foreign-enrollment', force: true, release: true,
    }));
    assert.equal(result.status, 503);
    assert.equal((await result.json()).error, `${kind}_held`);
    noEffects(h, name);
  });
}
for (const name of ['test-pipeline', 'migrate-to-external']) await check(`${name}/retired`, async () => {
  const h = harness(`${name}/index.ts`);
  assert.equal((await h.handler()(request({ 'x-internal-secret': envBase.INTERNAL_FUNCTION_SECRET }, { action: 'migrate-table' }))).status, 410);
  noEffects(h, name);
});
for (const headers of [
  { authorization: `Bearer ${envBase.SUPABASE_SERVICE_ROLE_KEY}` },
  { apikey: envBase.SUPABASE_SERVICE_ROLE_KEY },
  { 'x-internal-secret': envBase.SUPABASE_SERVICE_ROLE_KEY },
  { 'x-internal-secret': envBase.INTERNAL_FUNCTION_SECRET },
]) await check(`scheduler-auth/${Object.keys(headers)[0]}/${checks.length}`, async () => {
  const h = harness('signal-delta-worker/index.ts');
  assert.equal((await h.handler()(request(headers))).status, 200);
  assert.equal(h.calls.filter(c => c.kind === 'rpc' && c.rpc === 'read_signal_delta_batch').length, 1);
  assert.equal(h.calls.filter(c => c.kind.startsWith('provider')).length, 0);
});
for (const name of ['distress-event-fanout', 'watchlist-fanout-worker', 'integration-revalidate', 'process-email-queue']) await check(`${name}/authorized-empty-work`, async () => {
  const h = harness(`${name}/index.ts`);
  const result = await h.handler()(request({ 'x-internal-secret': envBase.INTERNAL_FUNCTION_SECRET }));
  assert.equal(result.status, 200);
  assert.ok(h.calls.some(c => ['db', 'rpc'].includes(c.kind)));
  assert.equal(h.calls.filter(c => c.kind.startsWith('provider')).length, 0);
});
await check('keepwarm/authorized-fixture-ping', async () => {
  const h = harness('snap-mcp-keepwarm/index.ts');
  assert.equal((await h.handler()(request({ 'x-internal-secret': envBase.INTERNAL_FUNCTION_SECRET }))).status, 200);
  const providerCalls = h.calls.filter(c => c.kind === 'provider');
  assert.equal(providerCalls.length, 1);
  assert.equal(JSON.parse(providerCalls[0].init.body).operation, 'ping');
  assert.ok(providerCalls[0].init.headers['X-SI-Signature']);
});
for (const config of [
  { SUPABASE_SERVICE_ROLE_KEY: envBase.SUPABASE_ANON_KEY, INTERNAL_FUNCTION_SECRET: undefined },
  { SUPABASE_SERVICE_ROLE_KEY: 'short', INTERNAL_FUNCTION_SECRET: undefined },
  { SUPABASE_SERVICE_ROLE_KEY: undefined, INTERNAL_FUNCTION_SECRET: 'weak' },
  { SUPABASE_ANON_KEY: undefined, INTERNAL_FUNCTION_SECRET: undefined },
]) await check(`worker-auth/unsafe-config-${checks.length}`, async () => {
  const h = harness('_shared/internalWorkerAuth.ts', { env: config });
  const result = h.exports.internalWorkerDenial(request({ authorization: `Bearer ${h.env.SUPABASE_SERVICE_ROLE_KEY}` }));
  assert.equal(result.status, 503);
  noEffects(h, 'unsafe config');
});
await check('worker-auth/aborted-request', async () => {
  const h = harness('_shared/internalWorkerAuth.ts');
  const controller = new AbortController(); controller.abort();
  const req = new Request('https://fixture.invalid', { method: 'POST', signal: controller.signal });
  assert.equal(h.exports.internalWorkerDenial(req).status, 503);
  noEffects(h, 'aborted');
});
for (const fields of [
  { concurrency: 500 }, { concurrency: 1.5 }, { batchSize: 0 }, { batchSize: 501 },
  { maxCycles: 11 }, { maxCycles: 0 }, { autoResume: 'true' },
]) await check(`backfill-bounds/${JSON.stringify(fields)}`, async () => {
  const h = harness('backfill-property-aggregates/index.ts');
  assert.equal((await h.handler()(request({ authorization: `Bearer ${envBase.SUPABASE_SERVICE_ROLE_KEY}` }, fields))).status, 400);
  noEffects(h, 'bounded backfill');
});
await check('backfill/single-authorized-batch-no-unbounded-continuation', async () => {
  const h = harness('backfill-property-aggregates/index.ts', {
    rpcData: { backfill_property_aggregates_batch: [{ processed: 10, updated: 10, remaining: 100 }] },
  });
  const result = await h.handler()(request({ authorization: `Bearer ${envBase.SUPABASE_SERVICE_ROLE_KEY}` }, { concurrency: 1, batchSize: 10, autoResume: true }));
  assert.equal(result.status, 200);
  assert.equal((await result.json()).autoResuming, false);
  assert.equal(h.calls.filter(c => c.kind === 'rpc').length, 1);
  assert.equal(h.calls.filter(c => c.kind === 'provider').length, 0);
});
for (const options of [
  { workspaceReady: false }, { workspaceError: true }, { invalidUser: true },
  { user: { is_anonymous: true } }, { user: { deleted_at: '2025-01-01' } },
  { user: { banned_until: '2099-01-01' } }, { user: { email_confirmed_at: null } },
]) await check(`integration-validation/denied-${checks.length}`, async () => {
  const h = harness('integration-validate/index.ts', options);
  const result = await h.handler()(request({ authorization: 'Bearer valid-user-fixture' }, { service_name: 'twilio', credentials: {} }));
  assert.ok([401, 403, 503].includes(result.status));
  assert.equal(h.calls.filter(c => c.kind.startsWith('provider') || c.kind === 'db' ||
    (c.kind === 'rpc' && c.rpc !== 'fn_customer_workspace_ready_v1')).length, 0);
});
await check('byoa/workspace-check-uses-user-jwt', async () => {
  const h = harness('_shared/byoa/auth.ts', { workspaceReady: true });
  const result = await h.exports.getAuthContext(request({ authorization: 'Bearer valid-user-fixture' }));
  assert.equal(result.ok, true);
  assert.equal(result.ctx.orgId, 'private-fixture-org');
  assert.equal(h.calls.find(c => c.kind === 'rpc').key, envBase.SUPABASE_ANON_KEY);
  assert.equal(h.calls.find(c => c.kind === 'db').clientKey, envBase.SUPABASE_ANON_KEY);
  assert.equal(h.calls.find(c => c.kind === 'client' && c.key === envBase.SUPABASE_ANON_KEY).clientOptions.global.headers.Authorization, 'Bearer valid-user-fixture');
});
console.log(`PASS: ${checks.length} relaunch security checks (actual handlers; isolated Auth/DB/provider stubs).`);
console.log('Includes unauthorized zero-effect checks, held authorized callers, retired routes, valid scheduler credentials, bounded maintenance and customer workspace preflight.');

const securityChecks = checks.length;
for (const [outcome, options, status] of [
  ['rejected', { resendResult: { data: null, error: { message: 'private customer@example.invalid body' } } }, 'rejected'],
  ['id-and-error', { resendResult: { data: { id: 'unexpected-id' }, error: { message: 'failed' } } }, 'rejected'],
  ['missing-id', { resendResult: { data: {}, error: null } }, 'unknown'],
  ['empty-id', { resendResult: { data: { id: '  ' }, error: null } }, 'unknown'],
  ['timeout', { resendThrows: true }, 'unknown'],
]) await check(`support/${outcome}`, async () => {
  const h = harness('send-support-message/index.ts', options);
  const result = await h.handler()(request({ authorization: 'Bearer valid-user-fixture' }, { type: 'support', message: 'Private message body.' }));
  assert.equal(result.status, 502);
  const body = await result.json();
  assert.equal(body.status, status);
  assert.notEqual(body.success, true);
  assert.equal(h.calls.filter(c => c.kind === 'resend-email').length, 1, 'must not retry uncertain send');
  assert.ok(!JSON.stringify(h.logs).includes('customer@example.invalid'));
  assert.ok(!JSON.stringify(h.logs).includes('Private message body'));
});
await check('support/accepted-is-not-delivered-and-fields-escaped', async () => {
  const h = harness('send-support-message/index.ts', {
    profile: { full_name: '<img src=x onerror=alert(1)>\r\nBcc: fake', email: 'attacker\r\nBcc:other@example.invalid' },
    rpcData: { fn_get_user_subscription: [{ display_name: '<script>plan</script> & "paid"' }] },
  });
  const result = await h.handler()(request({ authorization: 'Bearer valid-user-fixture' }, { type: 'feature', message: '<script>message</script> & "quoted"' }));
  assert.equal(result.status, 202);
  const body = await result.json();
  assert.equal(body.status, 'accepted');
  assert.equal(body.message_id, 'fixture-email-accepted-id');
  assert.ok(!('delivered' in body));
  const sent = h.calls.find(c => c.kind === 'resend-email').payload;
  assert.equal(sent.reply_to, 'customer@example.invalid', 'must use verified account email and SDK v2 field');
  assert.ok(!('replyTo' in sent));
  assert.ok(!sent.subject.includes('\r') && !sent.subject.includes('\n'));
  assert.ok(!sent.html.includes('<script>') && !sent.html.includes('<img '));
  assert.ok(sent.html.includes('&lt;script&gt;plan&lt;/script&gt; &amp; &quot;paid&quot;'));
  assert.ok(sent.html.includes('&lt;script&gt;message&lt;/script&gt; &amp; &quot;quoted&quot;'));
  assert.ok(!sent.html.includes('attacker'));
  assert.ok(!JSON.stringify(h.logs).includes('customer@example.invalid'));
});
for (const [name, options, payload, status] of [
  ['invalid-user', { invalidUser: true }, { type: 'support', message: 'test' }, 401],
  ['anonymous-user', { user: { is_anonymous: true } }, { type: 'support', message: 'test' }, 401],
  ['unverified-email', { user: { email_confirmed_at: null } }, { type: 'support', message: 'test' }, 401],
  ['email-header-injection', { user: { email: 'fixture@example.invalid\r\nBcc:fake@example.invalid' } }, { type: 'support', message: 'test' }, 422],
  ['empty-message', {}, { type: 'support', message: ' ' }, 400],
  ['long-message', {}, { type: 'support', message: 'x'.repeat(5001) }, 400],
  ['invalid-type', {}, { type: 'campaign', message: 'test' }, 400],
  ['missing-provider-config', { env: { RESEND_API_KEY: undefined } }, { type: 'support', message: 'test' }, 503],
]) await check(`support/${name}`, async () => {
  const h = harness('send-support-message/index.ts', options);
  assert.equal((await h.handler()(request({ authorization: 'Bearer valid-user-fixture' }, payload))).status, status);
  assert.equal(h.calls.filter(c => c.kind === 'resend-email').length, 0);
});
console.log(`PASS: ${checks.length - securityChecks} additional support acceptance, rejection, unknown-outcome, injection and no-send checks.`);
