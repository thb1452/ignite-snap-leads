import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { reviewPage } from './source-review-fixture.mjs';

const artifactRoot=process.env.SNAP_REVIEW_TEST_ARTIFACT_DIR || new URL('../test-results/source-review',import.meta.url).pathname;
await mkdir(artifactRoot,{recursive:true,mode:0o700});
const browser=await chromium.launch({headless:true,...(process.platform==='darwin'?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{})});
const results=[];
const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.test',role:'authenticated',aud:'authenticated',email_confirmed_at:'2026-09-01T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-09-01T00:00:00Z'};
const session={access_token:'test-only-owner-session',refresh_token:'test-only-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user};
let reviewAccess=true, hold=false, releaseHeld, holdLogout=false, releaseLogout;
const context=await browser.newContext({viewport:{width:1280,height:900}});
const externalWrites=[];
const recoveryRequests=[];
await context.route('**/*',async route=>{
  const request=route.request(),u=new URL(request.url());
  if(u.hostname==='127.0.0.1')return route.continue();
  if(u.pathname==='/rest/v1/rpc/fn_owner_source_review_batches_v1') {
    const batch=reviewPage().batch;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:'owner-source-review-batches-v1',checked_at:new Date().toISOString(),
      batches:reviewAccess?[{preparation_sha256:batch.preparation_sha256,collected_at:batch.collected_at,event_count:63,property_count:29,review_status:'pending_review'}]:[],total_count:reviewAccess?1:0,truncated:false})});
  }
  if(u.pathname==='/rest/v1/rpc/fn_owner_source_review_v1') {
    if(hold) await new Promise(resolve=>{releaseHeld=resolve;});
    const offset=request.postDataJSON().p_offset;
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(reviewAccess?reviewPage(offset):{version:'owner-source-review-v1',status:'unavailable',batch:null,events:[],next_offset:null})});
  }
  if(u.pathname==='/auth/v1/logout') {
    if (holdLogout) {await new Promise(resolve=>{releaseLogout=resolve;});return route.fulfill({status:400,contentType:'application/json',body:'{"msg":"Synthetic logout failure"}'});}
    return route.fulfill({status:204});
  }
  if(u.pathname==='/auth/v1/recover') {
    recoveryRequests.push({url:request.url(),body:request.postDataJSON()});
    return route.fulfill({status:200,contentType:'application/json',body:'{}'});
  }
  if(u.pathname.startsWith('/auth/v1/'))return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(user)});
  if(u.hostname.endsWith('.supabase.co') && request.method()==='GET')return route.fulfill({status:200,contentType:'application/json',body:'[]'});
  if(u.hostname.endsWith('.supabase.co') && request.method()!=='GET')externalWrites.push(u.pathname);
  return route.abort();
});
const page=await context.newPage();
try {
  await page.goto('http://127.0.0.1:4198/owner/source-review');
  await expect(page.getByRole('heading',{name:'Sign in to review'})).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  await page.screenshot({path:artifactRoot+'/signed-out.png',fullPage:true});
  results.push('Signed-out browser receives no review rows.');
  await page.getByRole('button',{name:'Forgot password?',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Reset your password'})).toBeVisible();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.getByLabel('Email',{exact:true}).fill('owner@example.test');
  await page.getByRole('button',{name:'Send reset link',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('a reset link is on its way');
  await expect(page.getByRole('button',{name:'Send reset link',exact:true})).toBeDisabled();
  if(recoveryRequests.length!==1 || recoveryRequests[0].body.email!=='owner@example.test' ||
    new URL(recoveryRequests[0].url).hostname!=='ojyxblegxpdgaqiscxpz.supabase.co' ||
    new URL(recoveryRequests[0].url).searchParams.get('redirect_to')!=='https://ignite-snap-leads.lovable.app/reset-password')throw new Error('Recovery request target mismatch');
  await page.getByRole('button',{name:'Back to sign in',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sign in to review'})).toBeVisible();
  results.push('Forgot password requests one email on the customer backend with the published recovery destination and no password requirement.');
  await page.evaluate(value=>localStorage.setItem('sb-ojyxblegxpdgaqiscxpz-auth-token',JSON.stringify(value)),session);
  await page.reload();
  await expect(page.getByText('Showing 1–25 of 63 violations')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(25);
  await page.locator('article').first().locator('summary').click();
  await expect(page.getByText('May be effective year built, not construction year.').first()).toBeVisible();
  await expect(page.locator('article img')).toHaveCount(0);
  await page.screenshot({path:artifactRoot+'/review-desktop.png',fullPage:false});
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('Showing 26–50 of 63 violations')).toBeVisible();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  await expect(page.getByText('Showing 51–63 of 63 violations')).toBeVisible();
  await expect(page.locator('article')).toHaveCount(13);
  await expect(page.getByRole('button',{name:'Next',exact:true})).toBeDisabled();
  results.push('Pagination preserves all 63 distinct violations and shows dated source caveats; markup stays text.');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:artifactRoot+'/review-mobile.png',fullPage:false});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw new Error('Mobile review overflows viewport');
  results.push('Mobile review fits a 390px viewport.');
  reviewAccess=false;
  await page.getByRole('button',{name:'Refresh records'}).click();
  await expect(page.getByRole('alert')).toContainText('does not have review access');
  await expect(page.locator('article')).toHaveCount(0);
  results.push('A revoked response clears previously displayed records.');
  reviewAccess=true; hold=true;
  await page.getByRole('button',{name:'Try again'}).click();
  await expect.poll(()=>Boolean(releaseHeld)).toBeTruthy();
  holdLogout=true;
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect.poll(()=>Boolean(releaseLogout)).toBeTruthy();
  releaseHeld();
  await page.waitForTimeout(250);
  await expect(page.locator('article')).toHaveCount(0);
  releaseLogout();
  await expect(page.getByRole('alert')).toContainText('Records are hidden');
  await expect(page.locator('article')).toHaveCount(0);
  holdLogout=false;
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Sign in to review'})).toBeVisible();
  results.push('Delayed and failed logout keep late review responses hidden; a successful retry returns to sign-in.');
  const unexpected=externalWrites.filter(path=>path!=='/rest/v1/user_activity_log');
  if(unexpected.length)throw new Error('Unexpected write requests: '+unexpected.join(','));
  results.push('No CRM, collection, billing or customer-release writes were requested.');
  await writeFile(artifactRoot+'/results.json',JSON.stringify({checked_at:new Date().toISOString(),passed:true,kind:'isolated-browser-with-intercepted-synthetic-responses',production_network_used:false,existing_route_analytics_attempts_intercepted:externalWrites.length,results},null,2)+'\n',{mode:0o600});
  console.log(JSON.stringify({passed:true,checks:results.length,artifactRoot}));
} finally {await browser.close();}
