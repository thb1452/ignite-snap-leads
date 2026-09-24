import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {randomBytes} from 'node:crypto';

// Copy only selected unchanged handlers and non-secret configuration. Never copy
// repository .env, hosted project links, migrations, seeds or provider credentials.
const target=resolve(process.argv[2]??'');
assert.ok(process.argv[2]&&target.endsWith('/snap-release-ci'),'Dedicated target directory required');
assert.ok(target.startsWith('/tmp/')||target.startsWith(`${process.env.RUNNER_TEMP}/`),'Temporary CI target required');
await assert.rejects(access(join(target,'supabase')),'Refusing to reuse an initialized stack');
await mkdir(join(target,'supabase/functions/_shared'),{recursive:true});
const source=new URL('../../../',import.meta.url);
const original=await readFile(new URL('supabase/config.toml',source),'utf8');
for(const [name,expected] of [['create-checkout-session','true'],['test-pipeline','false']]){
  const section=original.match(new RegExp(`\\[functions\\.${name}\\]([^\\[]*)`))?.[1];
  assert.match(section??'',new RegExp(`verify_jwt\\s*=\\s*${expected}\\b`),'Candidate gateway configuration changed; review CI mapping');
}
await copyFile(new URL('./config.toml',import.meta.url),join(target,'supabase/config.toml'));
for(const path of ['create-checkout-session/index.ts','test-pipeline/index.ts','_shared/internalWorkerAuth.ts','_shared/stripeMode.ts','_shared/stripeSubscriptionPlan.ts']){
  const destination=join(target,'supabase/functions',path);
  await mkdir(resolve(destination,'..'),{recursive:true});
  await copyFile(new URL(`supabase/functions/${path}`,source),destination);
}
await writeFile(join(target,'functions.env'),[
  'STRIPE_EXPECTED_LIVEMODE=false',
  'STRIPE_SECRET_KEY=sk_test_synthetic_local_only_not_a_credential',
  `INTERNAL_FUNCTION_SECRET=${randomBytes(32).toString('hex')}`,
  'APP_URL=http://127.0.0.1:3000','',
].join('\n'),{mode:0o600});
console.log('Prepared dedicated synthetic Supabase stack; no hosted configuration copied.');
