import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react-swc';
import {chromium} from '@playwright/test';
import path from 'node:path';
let server,browser,base;
const root=path.resolve(import.meta.dirname,'..');
before(async()=>{
 const fixture=path.join(root,'tests/checkout-return-fixture.tsx');
 const mocked=['@/hooks/use-auth','@/hooks/use-toast','@/integrations/supabase/externalClient',
  ...['PlanUsageSection','NotificationsSection','AccountDetailsSection','PrivacySection','HelpSection','MarketRequestSection'].map(n=>'@/components/settings/'+n)];
 server=await createServer({configFile:false,root,plugins:[react()],optimizeDeps:{entries:['tests/checkout-return-harness.html']},resolve:{alias:[
  ...mocked.map(find=>({find,replacement:fixture})),{find:'@',replacement:path.join(root,'src')},
 ]},server:{host:'127.0.0.1',port:0}});
 await server.listen();base='http://127.0.0.1:'+server.httpServer.address().port;
 browser=await chromium.launch({headless:true,channel:process.env.SNAP_PAYMENT_BROWSER_CHANNEL||'chrome'});
});
after(async()=>{await browser?.close();await server?.close();});
async function page(query='',pending=null){
 const context=await browser.newContext();
 await context.route('**/*',r=>new URL(r.request().url()).origin===base?r.continue():r.abort());
 await context.addInitScript(({pending})=>{localStorage.clear();if(pending!==null)localStorage.setItem('snap_pending_checkout',typeof pending==='string'?pending:JSON.stringify({...pending,at:Date.now()}));},{pending});
 const p=await context.newPage();await p.goto(base+'/tests/checkout-return-harness.html'+query);
 await p.getByRole('heading',{name:'Account Settings',exact:true}).waitFor();return [p,context];
}
async function noClaimsOrInvocations(p){
 assert.deepEqual(await p.evaluate(()=>window.checkoutFixture.calls.filter(x=>['invoke','toast'].includes(x[0]))),[]);
 assert.doesNotMatch(await p.locator('body').innerText(),/credits added to your account|Subscription activated|Your plan is now active/i);
}
test('forged URL credit amount produces pending status without success, amount echo or fulfillment',async()=>{
 const[p,c]=await page('?credits_added=987654321');try{
  await p.getByRole('heading',{name:'Payment confirmation pending'}).waitFor();
  assert.doesNotMatch(await p.locator('body').innerText(),/987654321|987,654,321/);await noClaimsOrInvocations(p);
 }finally{await c.close();}
});
test('malformed and session-only return hints cannot become verified payments',async()=>{
 for(const q of ['?credits_added=%3Cscript%3ESECRET%3C%2Fscript%3E','?credits_added=NaN','?session_id=cs_forged']){
  const[p,c]=await page(q);try{await p.getByRole('status').waitFor();assert.doesNotMatch(await p.locator('body').innerText(),/SECRET|cs_forged|NaN/);await noClaimsOrInvocations(p);}finally{await c.close();}
 }
});
test('existing balance and matching plan never confirm a pending checkout on focus',async()=>{
 for(const type of ['bulk_credits','subscription']){
  const[p,c]=await page('',{type,expectedBalance:1,expectedTier:'professional'});try{
   await p.getByRole('status').waitFor();await p.evaluate(()=>{for(let i=0;i<4;i++)window.dispatchEvent(new Event('focus'));});
   await noClaimsOrInvocations(p);
   assert.ok(await p.evaluate(()=>localStorage.getItem('snap_pending_checkout')));
  }finally{await c.close();}
 }
});
test('sign-out hides the notice and switching users never carries purchase details',async()=>{
 const[p,c]=await page('?credits_added=5000');try{
  await p.getByRole('status').waitFor();await p.evaluate(()=>window.checkoutFixture.signOut());
  await p.getByRole('status').waitFor({state:'detached'});
  await p.evaluate(()=>window.checkoutFixture.switchUser());await p.getByRole('status').waitFor();
  assert.doesNotMatch(await p.getByRole('status').innerText(),/5000|5,000|professional/);await noClaimsOrInvocations(p);
 }finally{await c.close();}
});
test('ordinary Settings visit and malformed stored hints do not show a checkout notice',async()=>{
 for(const pending of [null,'{invalid',JSON.stringify({type:'subscription',at:0})]){
  const[p,c]=await page('',pending);try{assert.equal(await p.getByRole('status').count(),0);await noClaimsOrInvocations(p);}finally{await c.close();}
 }
});
test('fresh storage hint after focus is pending and remains available for later reconciliation',async()=>{
 const[p,c]=await page();try{
  await p.evaluate(()=>{localStorage.setItem('snap_pending_checkout',JSON.stringify({type:'bulk_credits',at:Date.now(),expectedBalance:8888}));window.dispatchEvent(new Event('focus'));});
  await p.getByRole('status').waitFor();assert.ok(await p.evaluate(()=>localStorage.getItem('snap_pending_checkout')));
  await noClaimsOrInvocations(p);
 }finally{await c.close();}
});
