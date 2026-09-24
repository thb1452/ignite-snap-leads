import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm,readdir} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {assertRelativeImportClosure,copiedFunctions,prepareStack} from '../scripts/tests/release-supabase/prepare.mjs';
import {startupFailureCategories} from '../scripts/tests/release-supabase/start-diagnostics.mjs';

const exec=promisify(execFile);
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'snap-copy-check-'));t.after(()=>rm(root,{recursive:true,force:true}));return root;}

test('candidate preparation includes checkout catalog and validates isolated transitive imports',async t=>{
  const target=join(await fixture(t),'snap-release-ci');await prepareStack(target);
  const functions=join(target,'supabase/functions');
  assert.deepEqual(await assertRelativeImportClosure(functions),[...copiedFunctions].sort());
  assert.match(await readFile(join(functions,'_shared/checkoutCatalog.ts'),'utf8'),/from "\.\/stripeMode\.ts"/);
  assert.deepEqual((await readdir(join(target,'supabase'))).sort(),['config.toml','functions']);
  await rm(join(functions,'_shared/checkoutCatalog.ts'));
  await assert.rejects(assertRelativeImportClosure(functions,['create-checkout-session/index.ts']),/Copied function dependency missing: _shared\/checkoutCatalog\.ts/);
});

test('copy completeness follows re-exports, type imports and literal dynamic imports without fetching URLs',async t=>{
  const root=await fixture(t);await mkdir(join(root,'nested'));
  await writeFile(join(root,'entry.ts'),`// import './ignored.ts';\nimport type Remote from 'https://example.invalid/never-fetch.ts';\nexport {x} from './nested/bridge.ts';\ntype T=import('./types.ts').T;\nconst load=()=>import('./dynamic.ts');`);
  await writeFile(join(root,'nested/bridge.ts'),`export {x} from '../leaf.ts';`);
  await writeFile(join(root,'types.ts'),'export type T=string;');await writeFile(join(root,'dynamic.ts'),'export {};');
  await assert.rejects(assertRelativeImportClosure(root,['entry.ts']),/Copied function dependency missing: leaf\.ts/);
  await writeFile(join(root,'leaf.ts'),'export const x=1;');
  assert.deepEqual(await assertRelativeImportClosure(root,['entry.ts']),['dynamic.ts','entry.ts','leaf.ts','nested/bridge.ts','types.ts']);
  await writeFile(join(root,'leaf.ts'),`export * from '../outside.ts';`);
  await assert.rejects(assertRelativeImportClosure(root,['entry.ts']),/inside copied functions/);
  await writeFile(join(root,'leaf.ts'),`const name='./unknown.ts'; import(name);`);
  await assert.rejects(assertRelativeImportClosure(root,['entry.ts']),/Computed imports require/);
});

test('startup diagnostics disclose fixed labels only, including unreadable logs',async t=>{
  assert.deepEqual(startupFailureCategories('Supabase stopped for an unknown reason'),['unclassified']);
  const root=await fixture(t),log=join(root,'start.log');
  await writeFile(log,'SECRET_PRIVATE_KEY=must-never-print\nError pulling image: too many requests\ncontainer unhealthy\nmodule not found\n');
  const script=new URL('../scripts/tests/release-supabase/start-diagnostics.mjs',import.meta.url);
  const {stdout,stderr}=await exec(process.execPath,[script.pathname,log]);
  assert.equal(stdout,'Supabase startup failure categories: missing_module, container_unhealthy, image_pull, rate_limit\n');assert.equal(stderr,'');
  const missing=await exec(process.execPath,[script.pathname,join(root,'PRIVATE_MISSING_LOG')]);
  assert.equal(missing.stdout,'Supabase startup failure categories: diagnostic_unavailable\n');assert.equal(missing.stderr,'');
});
