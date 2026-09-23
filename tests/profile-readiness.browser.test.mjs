import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import path from 'node:path';
let server,browser,base;
const root=path.resolve(import.meta.dirname,'..');
before(async()=>{
 server=await createServer({configFile:false,root,plugins:[react()],optimizeDeps:{entries:['tests/profile-harness.html']},resolve:{alias:[
  {find:'@/hooks/use-auth',replacement:path.join(root,'tests/profile-fixture.tsx')},
  {find:'@/integrations/supabase/externalClient',replacement:path.join(root,'tests/profile-fixture.tsx')},
  {find:'@',replacement:path.join(root,'src')},
 ]},server:{host:'127.0.0.1',port:4287,strictPort:true}});
 await server.listen();base='http://127.0.0.1:4287';
 browser=await chromium.launch({headless:true,channel:process.env.SNAP_PROFILE_BROWSER_CHANNEL||'chrome'});
});
after(async()=>{await browser?.close();await server?.close();});
async function page(scenario){
 const context=await browser.newContext({viewport:{width:1000,height:700}});
 await context.route('**/*',route=>{const u=new URL(route.request().url());return u.origin===base?route.continue():route.abort();});
 const p=await context.newPage();await p.goto(base+'/tests/profile-harness.html?scenario='+scenario);
 return [p,context];
}
test('missing profile shows a real setup blocker and offers no edit or password action',async()=>{
 const [p,c]=await page('missing');try{
  await p.getByText('Your account setup needs attention.',{exact:false}).waitFor();
  assert.equal(await p.getByRole('button',{name:'Edit',exact:true}).count(),0);
  assert.equal(await p.getByRole('button',{name:'Change Password'}).count(),0);
  assert.equal(await p.getByText('Synthetic Alpha',{exact:true}).count(),0);
 }finally{await c.close();}
});
test('ambiguous profile and missing organization do not become ready accounts',async()=>{
 for(const scenario of ['duplicate','organization_missing']){
  const [p,c]=await page(scenario);try{await p.getByText('Your account setup needs attention.',{exact:false}).waitFor();assert.equal(await p.getByRole('button',{name:'Edit',exact:true}).count(),0);}finally{await c.close();}
 }
});
test('verified account edits only the exact profile name and uses native Auth reset',async()=>{
 const [p,c]=await page('ready');try{
  await p.getByText('Synthetic Alpha',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Edit',exact:true}).click();
  await p.getByPlaceholder('Enter your name').fill('Renamed Alpha');
  await p.getByRole('button',{name:'Save',exact:true}).click();
  await p.getByText('Renamed Alpha',{exact:true}).waitFor();
  const writes=await p.evaluate(()=>window.profileFixture.calls.filter(x=>x[0]==='update'));
  assert.equal(writes.length,1);assert.deepEqual(writes[0][4],{full_name:'Renamed Alpha'});
  assert.equal(writes[0][2].id,'00000000-0000-4000-8000-000000000003');
  assert.equal(writes[0][2].user_id,'00000000-0000-4000-8000-000000000001');
  await p.getByRole('button',{name:'Change Password'}).click();
  await p.waitForFunction(()=>window.profileFixture.calls.some(x=>x[0]==='reset'));
  const reset=await p.evaluate(()=>window.profileFixture.calls.find(x=>x[0]==='reset'));
  assert.equal(reset[1],'a@example.invalid');assert.equal(reset[2].redirectTo,base+'/reset-password');
 }finally{await c.close();}
});
test('switching accounts cannot display or edit the prior cached profile',async()=>{
 const [p,c]=await page('ready');try{
  await p.getByText('Synthetic Alpha',{exact:true}).waitFor();
  await p.evaluate(()=>window.profileFixture.switchUser());
  await p.getByText('Synthetic Beta',{exact:true}).waitFor();
  assert.equal(await p.getByText('Synthetic Alpha',{exact:true}).count(),0);
  assert.equal(await p.getByText('a@example.invalid',{exact:true}).count(),0);
 }finally{await c.close();}
});
test('unverified account has verification action but no invented profile',async()=>{
 const [p,c]=await page('unverified');try{
  await p.getByText('Verify your email to finish setting up your account.').waitFor();
  await p.getByRole('button',{name:'Resend verification'}).click();
  assert.equal((await p.evaluate(()=>window.profileFixture.calls.filter(x=>x[0]==='resend'))).length,1);
  assert.equal((await p.evaluate(()=>window.profileFixture.calls.filter(x=>x[0]==='read'))).length,0);
 }finally{await c.close();}
});
test('switching accounts discards an unfinished name edit without a write',async()=>{
 const [p,c]=await page('ready');try{
  await p.getByText('Synthetic Alpha',{exact:true}).waitFor();
  await p.getByRole('button',{name:'Edit',exact:true}).click();
  await p.getByPlaceholder('Enter your name').fill('Unfinished Alpha draft');
  await p.evaluate(()=>window.profileFixture.switchUser());
  await p.getByText('Synthetic Beta',{exact:true}).waitFor();
  assert.equal(await p.getByPlaceholder('Enter your name').count(),0);
  await p.getByRole('button',{name:'Edit',exact:true}).click();
  assert.equal(await p.getByPlaceholder('Enter your name').inputValue(),'Synthetic Beta');
  assert.equal((await p.evaluate(()=>window.profileFixture.calls.filter(x=>x[0]==='update'))).length,0);
 }finally{await c.close();}
});
