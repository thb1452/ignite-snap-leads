import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, loadConfigFromFile } from 'vite';

const root = fileURLToPath(new URL('../', import.meta.url));
const configFile = path.join(root, 'vite.config.ts');
const projectA = 'aaaaaaaaaaaaaaaaaaaa', projectB = 'bbbbbbbbbbbbbbbbbbbb';
const urlA = `https://${projectA}.supabase.co`, urlB = `https://${projectB}.supabase.co`;
const publicA = 'sb_publishable_synthetic_key_a', publicB = 'sb_publishable_synthetic_key_b';
const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'VITE_SUPABASE_PROJECT_ID', 'VERCEL_ENV'];
const jwt = (ref, role = 'anon') => [
  Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
  Buffer.from(JSON.stringify({ ref, role })).toString('base64url'), 'synthetic_signature',
].join('.');

async function environment(env, files, run) {
  const originalCwd = process.cwd();
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const directory = await mkdtemp(path.join(os.tmpdir(), 'snap-vite-env-'));
  try {
    for (const name of names) delete process.env[name];
    Object.assign(process.env, env);
    for (const [name, contents] of Object.entries(files)) await writeFile(path.join(directory, name), contents);
    process.chdir(directory);
    return await run(directory);
  } finally {
    process.chdir(originalCwd);
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name];
      else process.env[name] = previous[name];
    }
    await rm(directory, { recursive: true, force: true });
  }
}
async function config(mode = 'production') {
  const result = await loadConfigFromFile({ command: 'build', mode }, configFile, process.cwd(), 'silent');
  assert.ok(result);
  return result.config;
}
const defined = (config, name) => JSON.parse(config.define[`import.meta.env.${name}`]);
const envFile = (url, key) => `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_PUBLISHABLE_KEY=${key}\n`;

test('deployment pair wins over dotenv and reaches the real client and legacy URL shim in a Vite bundle', async () => {
  await environment({ VITE_SUPABASE_URL: urlA, VITE_SUPABASE_PUBLISHABLE_KEY: publicA, VERCEL_ENV: 'preview' }, {
    '.env': envFile(urlB, publicB) + `VITE_SUPABASE_PROJECT_ID=${projectB}\n`,
    '.env.production': envFile(urlB, publicB),
  }, async directory => {
    const resolved = await config();
    assert.equal(defined(resolved, 'VITE_SUPABASE_URL'), urlA);
    assert.equal(defined(resolved, 'VITE_SUPABASE_PUBLISHABLE_KEY'), publicA);
    assert.equal(defined(resolved, 'VITE_SUPABASE_PROJECT_ID'), projectA);
    const entry = path.join(directory, 'entry.ts'), stub = path.join(directory, 'supabase-stub.ts');
    await writeFile(entry, `export {supabase, supabaseUrl} from ${JSON.stringify(path.join(root, 'src/integrations/supabase/externalClient.ts'))};\nexport const projectId=import.meta.env.VITE_SUPABASE_PROJECT_ID;`);
    // Observe constructor arguments without creating a network/Auth client.
    await writeFile(stub, 'export function createClient(url,key){return {url,key}}');
    const result = await build({ ...resolved, configFile: false, root: directory, plugins: [], logLevel: 'silent',
      resolve: { alias: { '@supabase/supabase-js': stub } },
      build: { write: false, minify: 'esbuild', rollupOptions: { input: entry, preserveEntrySignatures: 'strict' } },
    });
    assert.ok(!Array.isArray(result) && 'output' in result);
    const chunk = result.output.find(item => item.type === 'chunk' && item.isEntry);
    assert.ok(chunk);
    const compiled = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
    assert.deepEqual(compiled.supabase, { url: urlA, key: publicA });
    assert.equal(compiled.supabaseUrl, urlA);
    assert.equal(compiled.projectId, projectA);
    assert.ok(!chunk.code.includes(urlB), 'lower-priority backend must not survive into the client');
  });
});

test('mode dotenv values are honored when there is no deployment override', async () => {
  await environment({}, { '.env': envFile(urlA, publicA), '.env.staging': envFile(urlB, jwt(projectB)) }, async () => {
    const resolved = await config('staging');
    assert.equal(defined(resolved, 'VITE_SUPABASE_URL'), urlB);
    assert.equal(defined(resolved, 'VITE_SUPABASE_PUBLISHABLE_KEY'), jwt(projectB));
    assert.equal(defined(resolved, 'VITE_SUPABASE_PROJECT_ID'), projectB);
  });
});

test('missing configuration keeps production compatibility but preview cannot silently fall back', async () => {
  await environment({}, {}, async () => {
    const resolved = await config();
    const url = defined(resolved, 'VITE_SUPABASE_URL');
    const key = defined(resolved, 'VITE_SUPABASE_PUBLISHABLE_KEY');
    const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
    assert.equal(new URL(url).hostname, `${claims.ref}.supabase.co`);
    assert.equal(claims.role, 'anon');
    process.env.VERCEL_ENV = 'preview';
    await assert.rejects(config(), /Preview builds require/);
  });
});

test('rejects partial deployment pairs even when dotenv offers the missing value', async () => {
  for (const partial of [{ VITE_SUPABASE_URL: urlA }, { VITE_SUPABASE_PUBLISHABLE_KEY: publicA }]) {
    await environment(partial, { '.env': envFile(urlB, publicB) }, async () => {
      await assert.rejects(config(), /Set both/);
    });
  }
});

test('rejects mismatched projects, private keys, malformed pairs and unsafe endpoint forms', async () => {
  const invalid = [
    { VITE_SUPABASE_PROJECT_ID: projectB },
    { VITE_SUPABASE_PUBLISHABLE_KEY: jwt(projectB) },
    { VITE_SUPABASE_PUBLISHABLE_KEY: jwt(projectA, 'service_role') },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_synthetic_secret' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: 'not_a_public_key' },
    { VITE_SUPABASE_PUBLISHABLE_KEY: '' },
    { VITE_SUPABASE_URL: `http://${projectA}.supabase.co` },
    { VITE_SUPABASE_URL: `${urlA}/rest/v1` },
    { VITE_SUPABASE_URL: `${urlA}?token=synthetic` },
    { VITE_SUPABASE_URL: `https://name:password@${projectA}.supabase.co` },
  ];
  for (const override of invalid) {
    await environment({ VITE_SUPABASE_URL: urlA, VITE_SUPABASE_PUBLISHABLE_KEY: publicA, ...override }, {}, async () => {
      await assert.rejects(config());
    });
  }
});

test('local development origin and anon JWT remain supported', async () => {
  await environment({ VITE_SUPABASE_URL: 'http://127.0.0.1:54321', VITE_SUPABASE_PUBLISHABLE_KEY: jwt('local') }, {}, async () => {
    const resolved = await config('development');
    assert.equal(defined(resolved, 'VITE_SUPABASE_URL'), 'http://127.0.0.1:54321');
    assert.equal(defined(resolved, 'VITE_SUPABASE_PROJECT_ID'), 'local');
  });
});
