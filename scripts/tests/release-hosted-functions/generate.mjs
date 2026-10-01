import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Local, read-only Git inspection and optional source export. No deployment,
// environment inspection, credentials, provider calls, or network operations.
const ts = createRequire(import.meta.url)('typescript');
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const candidate = '68850520cc3570bfcc9c0b8e23c8d1ab5e0c430d';
const baseline = '16c1397507026d1eb03bebec7c7aec08d45ec2ee';
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
const read = (file) => git('show', `${candidate}:${file}`);
const tracked = new Set(git('ls-tree', '-r', '--name-only', candidate, 'supabase/functions').trim().split('\n'));
const groups = {
  private_worker: ['backfill-property-aggregates', 'distress-event-fanout', 'drip-runner', 'integration-revalidate', 'migrate-to-external', 'process-email-queue', 'signal-delta-worker', 'snap-mcp-keepwarm', 'test-pipeline', 'watchlist-fanout-worker', 'weekly-digest'],
  billing: ['create-checkout-session', 'create-portal-session', 'delete-user-account', 'verify-subscription', 'verify-bulk-credits', 'stripe-webhook'],
  customer_provider_export_support: ['drip-enroll', 'enrich-property-contact', 'export-user-data', 'integration-send-sms', 'integration-skip-trace', 'send-sms-threaded', 'send-support-message'],
};
const names = Object.values(groups).flat().sort();
assert.equal(names.length, 24);
assert.equal(new Set(names).size, 24);
const changedEntrypoints = git('diff', '--name-only', baseline, candidate, '--', 'supabase/functions').trim().split('\n')
  .filter(f => /^supabase\/functions\/[^_/][^/]*\/index\.ts$/.test(f)).map(f => f.split('/')[2]).sort();
assert.deepEqual(changedEntrypoints, names, 'The exact changed function scope must be 24 entrypoints');

const config = read('supabase/config.toml');
const gateway = new Map();
for (const match of config.matchAll(/\[functions\.([^\]]+)\]\s*\nverify_jwt\s*=\s*(true|false)/g)) gateway.set(match[1], match[2] === 'true');
const cache = new Map();
function analyze(file) {
  if (cache.has(file)) return cache.get(file);
  assert(tracked.has(file), `Missing tracked dependency: ${file}`);
  const source = read(file);
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = new Set();
  const env = new Set();
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.add(node.moduleSpecifier.text);
    if (ts.isCallExpression(node)) {
      const callee = node.expression.getText(sf);
      if (callee === 'import') {
        assert(node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0]), `Unresolved dynamic import in ${file}`);
        imports.add(node.arguments[0].text);
      }
      // internalWorkerAuth receives this exact environment-reader callback.
      if (callee === 'Deno.env.get' || (file.endsWith('/internalWorkerAuth.ts') && callee === 'env')) {
        if (node.arguments.length && ts.isStringLiteral(node.arguments[0])) env.add(node.arguments[0].text);
        else assert(file.endsWith('/internalWorkerAuth.ts') && callee === 'Deno.env.get', `Unresolved environment name in ${file}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  const local = [...imports].filter(x => x.startsWith('.')).map(x => path.posix.normalize(path.posix.join(path.posix.dirname(file), x)));
  for (const dependency of local) assert(dependency.startsWith('supabase/functions/'), 'Dependency escapes function root');
  const item = { file, source, local, external: [...imports].filter(x => !x.startsWith('.')).sort(), env: [...env].sort() };
  cache.set(file, item);
  for (const dependency of local) analyze(dependency);
  return item;
}
function closure(file, seen = new Set()) {
  if (seen.has(file)) return seen;
  seen.add(file);
  for (const dependency of analyze(file).local) closure(dependency, seen);
  return seen;
}
const metadata = (file) => {
  const source = cache.get(file)?.source ?? read(file);
  return { path: file, bytes: Buffer.byteLength(source), sha256: createHash('sha256').update(source).digest('hex') };
};
const functions = names.map(name => {
  const group = Object.entries(groups).find(([, entries]) => entries.includes(name))[0];
  const entrypoint = `supabase/functions/${name}/index.ts`;
  const sources = [...closure(entrypoint)].sort();
  const artifacts = ['supabase/functions/deno.json', 'supabase/functions/deno.lock', `supabase/functions/${name}/deno.json`, `supabase/functions/${name}/deno.lock`].filter(file => tracked.has(file));
  const verify_jwt = gateway.get(name) ?? true;
  assert.equal(verify_jwt, group !== 'private_worker' && name !== 'stripe-webhook');
  if (group === 'private_worker') assert(sources.includes('supabase/functions/_shared/internalWorkerAuth.ts'));
  return {
    name, group, entrypoint_path: entrypoint, verify_jwt,
    jwt_source: gateway.has(name) ? 'explicit_candidate_config' : 'documented_default_made_explicit_in_fragment',
    handler_auth: group === 'private_worker' ? 'Exact configured service key or dedicated internal secret; POST only' : name === 'stripe-webhook' ? 'Stripe signature plus explicit environment and retrieved-object mode checks' : 'Gateway JWT plus handler Supabase Auth getUser; preserve ownership/workspace checks',
    source_files: sources.map(metadata),
    dependency_configuration_files: artifacts.map(metadata),
    external_imports: [...new Set(sources.flatMap(file => analyze(file).external))].sort(),
    environment_names: [...new Set(sources.flatMap(file => analyze(file).env))].sort(),
  };
});
const manifest = {
  schema_version: 1, candidate_commit: candidate, diff_baseline_commit: baseline,
  function_count: 24, verify_jwt_true_count: 12, verify_jwt_false_count: 12,
  deployment_executed: false,
  generated_from: 'Immutable Git objects, parsed TypeScript imports and environment reads; no secret values',
  shared_source_files: [...cache.keys()].filter(file => file.includes('/_shared/')).sort().map(metadata),
  environment_names: [...new Set(functions.flatMap(fn => fn.environment_names))].sort(),
  functions,
};
writeFileSync(path.join(here, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const fragment = '# Exact candidate function gateway settings only. No project binding or deploy command.\n' + functions.map(fn => `\n[functions.${fn.name}]\nverify_jwt = ${fn.verify_jwt}\n`).join('');
writeFileSync(path.join(here, 'functions-config.toml'), fragment);

// Explicit optional export; keep raw source outside public evidence because legacy
// files already contain account-specific constants. Refuse to overwrite a folder.
const args = process.argv.slice(2);
assert(args.length === 0 || (args.length === 2 && args[0] === '--export-directory'), 'Usage: node generate.mjs [--export-directory NEW_ABSOLUTE_DIRECTORY]');
if (args.length) {
  const destination = args[1];
  assert(path.isAbsolute(destination) && !existsSync(destination), 'Export directory must be a new absolute path');
  const files = [...new Set(functions.flatMap(fn => [...fn.source_files, ...fn.dependency_configuration_files].map(file => file.path)))].sort();
  mkdirSync(destination, { recursive: true, mode: 0o700 });
  for (const file of files) {
    const target = path.join(destination, file);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    writeFileSync(target, read(file), { mode: 0o600 });
  }
  writeFileSync(path.join(destination, 'functions-config.toml'), fragment, { mode: 0o600 });
  writeFileSync(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
}
console.log(JSON.stringify({ candidate_commit: candidate, functions: functions.length, shared_source_files: manifest.shared_source_files.length, source_integrity: 'PASS', deployment_executed: false }));
