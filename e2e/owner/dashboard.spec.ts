import { test, expect, type Page } from '@playwright/test';

const id = '00000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const user = { id, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: now, created_at: now, app_metadata: {}, user_metadata: {} };
async function mock(page: Page, options: { owner?: boolean; failed?: boolean; empty?: boolean; auth?: boolean; missingCost?: boolean; collection?: 'loaded' | 'processing_unavailable' | 'partial_locations'; backup?: 'verified' | 'pending' | 'stale' | 'unavailable' | 'partial'; backupVerifiedAt?: string; mailReview?: 'recent' | 'overdue' | 'error' | 'empty' | 'unavailable';readiness?:'missing'|'configured'|'unavailable'|'partial';publicDownload?:{status:string;error?:string|null} } = {}) {
  const session = { access_token: 'test-only', refresh_token: 'test-only', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user };
  if (options.auth !== false) await page.addInitScript(({ session, id }) => {
    localStorage.setItem('snap-owner-auth', JSON.stringify(session));
    localStorage.setItem('snap_user_roles_cache', JSON.stringify({ userId: id, roles: ['admin'], timestamp: Date.now() }));
  }, { session, id });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const path = url.pathname;
    if (path.endsWith('/owner-operations')) {
      if (options.owner === false) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'Owner access required' }) });
      if (url.searchParams.get('access') === '1') return route.fulfill({ status: 200, contentType: 'application/json', body: '{"authorized":true,"source":"worker"}' });
      const feed = (data: unknown, total = Array.isArray(data) ? data.length : undefined) => options.failed
        ? { data: null, error: 'This feed is unavailable.', checkedAt: now }
        : { data, error: null, checkedAt: now, ...(total === undefined ? {} : { total }) };
      const requests = options.empty ? [] : [
        { id: 'code-1', request_type: 'code_violation', status: 'sent', jurisdiction: 'Code County', state: 'FL', updated_at: now, sent_at: now, response_due_at: null, retry_count: 0 },
        { id: 'water-1', request_type: 'water_shutoff', status: 'pending', jurisdiction: 'Water City', state: 'TX', updated_at: now, sent_at: null, response_due_at: null, retry_count: 1 },
        { id: 'other-1', request_type: 'tax_records', status: 'needs_review', jurisdiction: 'Other County', state: 'GA', updated_at: now, sent_at: null, response_due_at: null, retry_count: 0 },
      ];
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
        source: 'worker', checkedAt: now, windowStart: now.slice(0,10)+'T00:00:00.000Z', windowEnd: now,
        requests: feed(requests), sentToday: feed(options.empty ? 0 : 1), repliesToday: feed(options.empty ? 0 : 2),
        agents: feed(options.empty ? [] : [{ id: 1, agent_name: 'Collection agent', status: 'completed', created_at: now, duration_ms: 1000, cost_usd: options.missingCost ? null : 0.12 }]),
        outlets: feed(options.empty ? [] : [{ id: 'press-1', name: 'Test News Outlet', domain: 'news.example.test', email: 'press@news.example.test', is_active: true, daily_send_limit: 50, emails_sent_today: null, last_send_reset_date: null, last_health_check_at: null }]),
        uploads: feed([]), reviews: feed(options.empty ? [] : [{ domain: 'foia', job_id: 'review-1', job_subtype: 'fee_quote', jurisdiction: 'Review County', state: 'FL', updated_at: now, created_at: now }]),
        registry: feed([{id:'agent-1', name:'Registered agent', role:'collector', status:'active', last_heartbeat:null}]), research: feed([]), tasks: feed([]), taskReviews: feed([]),
        ...(options.readiness ? {
          acquisitionControls: feed({atlas_live_enabled:false,foia_paused:false,blocked_states:['SC']}),
          acquisitionPolicy: options.readiness==='unavailable' ? {data:null,error:'Runtime rules unavailable',checkedAt:now} : feed(options.readiness==='configured' ? [{revision:'test-policy',approved:false,global_paused:true}] : []),
          acquisitionAssignments: options.readiness==='unavailable' ? {data:null,error:'Assignments unavailable',checkedAt:now} : feed(options.readiness==='configured' ? [
            {state:'FL',outlet_id:'press-1',revision:'test-assignment',approved:false,starts_on:'2026-01-01',ends_on:null},
            {state:'NY',outlet_id:'press-1',revision:'test-assignment',approved:true,starts_on:'2020-01-01',ends_on:'2021-01-01'},
            {state:'TX',outlet_id:'press-1',revision:'test-assignment',approved:true,starts_on:'2099-01-01',ends_on:null},
            {state:'CA',outlet_id:'press-1',revision:'test-assignment',approved:true,starts_on:'2020-01-01',ends_on:null},
          ] : [],options.readiness==='partial'?200:options.readiness==='configured'?4:0),
          acquisitionHistory: feed(options.readiness==='configured' ? [{revision:'test-history',complete:true,reviewed_at:'2020-01-01T00:00:00Z',valid_until:'2021-01-01T00:00:00Z'}] : []),
          acquisitionCapacity: feed(options.readiness==='configured' ? [{revision:'test-capacity',checked_at:'2020-01-01T00:00:00Z',window_start:'2020-01-01T00:00:00Z',window_end:'2020-02-01T00:00:00Z',utc_day:'2020-01-01',submission_slots_available:100,outbound_messages_available:50}] : []),
          acquisitionHealth: feed(options.readiness==='configured' ? [{kind:'outbound',checked_at:'2020-01-01T00:00:00Z',available:true}] : []),
          publicDownloadHealth: feed(options.readiness==='configured' ? [{worker_name:'harvester_syracuse',version:'test-only',last_success_at:now,last_error_code:null,status:'staged'}] : []),
        } : {}),
        ...(options.publicDownload ? {publicDownloadHealth:feed([{worker_name:'harvester_syracuse',version:'test-only',last_success_at:now,last_error_code:options.publicDownload.error??null,status:options.publicDownload.status}])} : {}),
        ...(options.collection ? {
          collectionDeliveries: feed([
            {id:'delivery-fresh',source_name:'Synthetic source collection',jurisdiction:'Test City',state:'FL',record_type:'code_violations',collected_at:now,freshness:'fresh_verified',source_rows:20,customer_accepted:false,usable_records:false,registered_at:now},
            {id:'delivery-old',source_name:'Synthetic historical file',jurisdiction:'Old City',state:'TX',record_type:'water_shutoff',collected_at:'2026-01-01T00:00:00Z',freshness:'historical_preserved',source_rows:5,customer_accepted:false,usable_records:false,registered_at:now},
          ]),
          collectionProcessing: options.collection === 'processing_unavailable' ? {data:null,error:'Processing feed unavailable.',checkedAt:now} : feed([
            {id:'run-old',delivery_id:'delivery-fresh',processor_version:'synthetic-v1',staged_at:'2026-01-01T00:00:00Z',input_rows:20,candidate_rows:10,duplicate_rows:5,held_rows:5,source_case_count:15,candidate_case_count:8,review_state:'pending_review',customer_accepted:false,usable_records:false,registered_at:now},
            {id:'run-latest',delivery_id:'delivery-fresh',processor_version:'synthetic-v2',staged_at:now,input_rows:20,candidate_rows:12,duplicate_rows:3,held_rows:5,source_case_count:15,candidate_case_count:9,review_state:'pending_review',customer_accepted:false,usable_records:false,registered_at:now},
            {id:'run-history',delivery_id:'delivery-old',processor_version:'synthetic-v1',staged_at:now,input_rows:5,candidate_rows:0,duplicate_rows:0,held_rows:5,source_case_count:null,candidate_case_count:null,review_state:'held',customer_accepted:false,usable_records:false,registered_at:now},
          ]),
          collectionOriginals: feed([{delivery_id:'delivery-fresh',role:'government_raw_response',storage_kind:'local'},
            {delivery_id:'delivery-old',role:'preserved_original',storage_kind:'local'},
            {delivery_id:'delivery-old',role:'preserved_original',storage_kind:'supabase_private'},
            ...(options.backup ? [{delivery_id:'delivery-fresh',role:'government_raw_response',storage_kind:'supabase_private'}] : [])],options.collection==='partial_locations'?2000:options.backup?4:3),
          collectionEditorial: feed([{id:'draft-one',delivery_id:'delivery-fresh',processing_run_id:'run-latest',outlet_name:'Synthetic Regional News',title:'Synthetic sourced story awaiting review',review_state:'pending_review',published:false,registered_at:now}]),
          freshCollectionCount: feed(1),customerAcceptedCollections: feed(0),
        } : {}),
        ...(options.backup ? {
          archivePlans: feed([{id:'archive-plan',delivery_id:'delivery-fresh',artifact_count:2,registered_at:'2026-01-01T00:00:00Z'}]),
          archiveVerifications: options.backup==='unavailable' ? {data:null,error:'Backup proof feed unavailable.',checkedAt:now} : feed(options.backup==='pending' ? [] : [
            {id:'proof-new',plan_id:'archive-plan',delivery_id:'delivery-fresh',artifact_count:2,verified_at:options.backupVerifiedAt??(options.backup==='stale'?'2026-01-02T00:00:00Z':now),registered_at:now},
            {id:'proof-repeated',plan_id:'archive-plan',delivery_id:'delivery-fresh',artifact_count:2,verified_at:options.backupVerifiedAt??(options.backup==='stale'?'2026-01-02T00:00:00Z':now),registered_at:now},
          ]),
          archiveCopies: feed([{id:'cloud-one',delivery_id:'delivery-fresh',storage_kind:'supabase_private'},
            {id:'cloud-two',delivery_id:'delivery-fresh',storage_kind:'supabase_private'}],options.backup==='partial'?5000:2),
        } : {}),
        ...(options.mailReview ? {
          mailReviewHealth: feed(options.mailReview === 'empty' ? [] : [{worker_name:'hermes-intake',version:'hermes-intake-v1',last_success_at:options.mailReview === 'overdue' ? new Date(Date.parse(now)-3600000).toISOString() : now,last_error_code:options.mailReview === 'error' ? 'database_error' : null}]),
          mailboxReview: feed([{inbox_id:'records@news.example.test',message_id:'mail-1',received_at:now,stored_at:now,sender:'records@agency.example.test',subject:'Your request has a fee quote',review_state:'needs_review'}]),
          mailboxSuggestions: options.mailReview === 'unavailable' ? {data:null,error:'This feed is unavailable.',checkedAt:now} : feed([{inbox_id:'records@news.example.test',message_id:'mail-1',processor_version:'hermes-intake-v1',request_job_id:null,match_state:'ambiguous',processed_at:now,next_action:'review_request_match',signals:['fee_quote'],review_state:'pending_review',usable_records:false}]),
        } : {}),
        publishing: [{name:'Test News Outlet',domain:'news.example.test',checkedAt:now,siteStatus:200,error:null,articles:{total:1,rows:[{id:'story-1',title:'Test published story',url:'https://news.example.test/article/test',publishedAt:now}]}}]
      }) });
    }
    const body = path.startsWith('/auth/v1/user') ? user : [];
    const total = 0;
    await route.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'content-range': '0-99/' + total, 'access-control-expose-headers': 'content-range' },
      body: route.request().method() === 'HEAD' ? '' : JSON.stringify(body) });
  });
}
test('signed-out visitors cannot load the dashboard', async ({ page }) => {
  await mock(page, { auth: false });
  await page.goto('/admin/operations');
  await expect(page.getByRole('heading', { name: 'Sign in to your owner dashboard' })).toBeVisible();
  await expect(page.getByText('Requests sent today')).toHaveCount(0);
});
test('private backup counts use verified collections once and remain separate from candidates', async ({ page }) => {
  await mock(page, {collection:'loaded',backup:'verified'});
  await page.goto('/admin/operations');await page.getByRole('button',{name:'Data quality',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Private backups',exact:true})).toBeVisible();
  await page.getByRole('heading',{name:'Private backups',exact:true}).scrollIntoViewIfNeeded();
  await page.screenshot({path:'test-results/owner/private-backup-desktop.png',fullPage:true});
  const recent=page.getByText('Collections verified in 24 hours',{exact:true}).locator('..');
  await expect(recent.getByText('1',{exact:true})).toBeVisible();
  await expect(page.getByText('Verified within 24 hours',{exact:true})).toBeVisible();
  await expect(page.getByText('Candidate rows in view',{exact:true}).locator('..').getByText('12',{exact:true})).toBeVisible();
  await expect(page.getByText('Refreshing this dashboard does not recheck file hashes.',{exact:false})).toBeVisible();
  await expect(page.getByRole('button',{name:/backup|upload|accept|publish|verify files/i})).toHaveCount(0);
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/owner/private-backup-mobile.png',fullPage:true});
});
test('old private backup verification stays stale after dashboard refresh', async ({ page }) => {
  await mock(page, {collection:'loaded',backup:'stale'});
  await page.goto('/admin/operations');await page.getByRole('button',{name:'Data quality',exact:true}).click();
  await expect(page.getByText('Recheck due',{exact:true})).toBeVisible();
  await expect(page.getByText('Collections verified in 24 hours',{exact:true}).locator('..').getByText('0',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(page.getByText('Recheck due',{exact:true})).toBeVisible();
});
test('backup verification expires while automatic refresh is paused', async ({ page }) => {
  await page.clock.install({time:new Date(now)});
  await mock(page,{collection:'loaded',backup:'verified',backupVerifiedAt:new Date(Date.parse(now)-24*60*60*1000+5_000).toISOString()});
  let reads=0;
  page.on('request',request=>{if(request.url().includes('/owner-operations')&&!request.url().includes('access=1'))reads++;});
  await page.goto('/admin/operations');
  await page.getByRole('checkbox',{name:'Auto refresh',exact:true}).uncheck();
  await page.getByRole('button',{name:'Data quality',exact:true}).click();
  await expect(page.getByText('Verified within 24 hours',{exact:true})).toBeVisible();
  const previousReads=reads;
  await page.clock.fastForward(10_000);
  await expect(page.getByText('Recheck due',{exact:true})).toBeVisible();
  await expect(page.getByText('Collections verified in 24 hours',{exact:true}).locator('..').getByText('0',{exact:true})).toBeVisible();
  expect(reads).toBe(previousReads);
});
for(const state of ['pending','unavailable','partial'] as const){
  test(`private backup ${state} does not claim verified originals`,async({page})=>{
    await mock(page,{collection:'loaded',backup:state});
    await page.goto('/admin/operations');await page.getByRole('button',{name:'Data quality',exact:true}).click();
    await expect(page.getByText('Verified within 24 hours',{exact:true})).toHaveCount(0);
    if(state==='pending')await expect(page.getByText('Saved plan is awaiting file verification.',{exact:true})).toBeVisible();
    else await expect(page.getByText('Collections verified in 24 hours',{exact:true}).locator('..').getByText('Unavailable',{exact:true})).toBeVisible();
  });
}
test('cached admin roles do not bypass server authorization', async ({ page }) => {
  await mock(page, { owner: false });
  let reads = 0;
  page.on('request', req => { if (req.url().includes('/functions/v1/owner-operations') && !req.url().includes('access=1')) reads++; });
  await page.goto('/admin/operations');
  await expect(page.getByRole('heading', { name: 'Owner access required' })).toBeVisible();
  expect(reads).toBe(0);
});
test('owner navigation, type filters, outlets and decisions work', async ({ page }) => {
  await mock(page);
  await page.goto('/admin/operations');
  await expect(page.getByText('Code County, FL')).toBeVisible();
  await page.getByRole('button', { name: 'Collection', exact: true }).click();
  await page.getByRole('button', { name: 'Water shutoffs', exact: true }).click();
  await expect(page.getByText('Water City, TX')).toBeVisible();
  await expect(page.getByText('Code County, FL')).toHaveCount(0);
  await page.getByRole('button', { name: 'Other / unclassified' }).click();
  await expect(page.getByText('Other County, GA')).toBeVisible();
  await page.getByRole('button', { name: 'News outlets', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Test News Outlet', exact: true })).toBeVisible();
  await expect(page.getByText('Test published story')).toBeVisible();
  await page.getByRole('button', { name: 'Your decisions', exact: true }).click();
  await page.locator('summary').filter({hasText:'Review County'}).click();
  await expect(page.getByText('No approval is submitted from this screen.', { exact: false })).toBeVisible();
});
test('failed feeds are unavailable, never empty or healthy', async ({ page }) => {
  await mock(page, { failed: true });
  await page.goto('/admin/operations');
  await expect(page.getByText('11 feeds are unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByText('No new collection requests are recorded', { exact: false })).toHaveCount(0);
  await expect(page.getByText('All jurisdictions fresh.')).toHaveCount(0);
});
test('unknown costs remain unknown and successful empty feeds stay explicit', async ({ page }) => {
  await mock(page, { empty: true });
  await page.goto('/admin/operations');
  await expect(page.getByText('Not fully recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('No new collection requests are recorded', { exact: false })).toBeVisible();
  await expect(page.getByText('0', { exact: true }).first()).toBeVisible();
});
test('desktop and mobile layouts fit, refresh works, and partial costs remain unknown', async ({ page }) => {
  await mock(page, { missingCost: true });
  await page.setViewportSize({ width: 1440, height: 1050 });
  await page.goto('/admin/operations');
  await expect(page.getByText('Not fully recorded', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Refresh', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Refresh', exact: true })).toBeEnabled();
  await page.screenshot({ path: 'test-results/owner/desktop-fixture.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Your operation, in one place.' })).toBeVisible();
  await page.screenshot({ path: 'test-results/owner/mobile-fixture.png', fullPage: true });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/owner/mobile-fixture.png', fullPage: true });
});
test('mail review success stays scoped and suggestions remain pending review', async ({ page }) => {
  await mock(page, { mailReview: 'recent' });
  await page.goto('/admin/operations');
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await expect(page.getByText('Recent successful run', { exact: true })).toBeVisible();
  await expect(page.getByText('Scope: incoming mail review', { exact: false })).toBeVisible();
  await expect(page.getByText('No heartbeat evidence; not confirmed running.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'News outlets', exact: true }).click();
  await expect(page.getByText('Your request has a fee quote', { exact: true })).toBeVisible();
  await expect(page.getByText('Suggestion · Pending review', { exact: true })).toBeVisible();
  await expect(page.getByText('Multiple request matches need review', { exact: false })).toBeVisible();
  await expect(page.getByText('Suggested next step: Review which request this message belongs to', { exact: true })).toBeVisible();
  await expect(page.getByText('Possible fee quote', { exact: false })).toBeVisible();
  await expect(page.getByText('Record quality approval remains separate.', { exact: true })).toBeVisible();
});
for (const [state, label] of [['overdue', 'Run overdue'], ['error', 'Check needed'], ['empty', 'No completed mail review run is recorded yet.']] as const) {
  test(`mail review ${state} does not appear recently successful`, async ({ page }) => {
    await mock(page, { mailReview: state });
    await page.goto('/admin/operations');
    await page.getByRole('button', { name: 'Agents', exact: true }).click();
    await expect(page.getByText(label, { exact: true })).toBeVisible();
    await expect(page.getByText('Recent successful run', { exact: true })).toHaveCount(0);
  });
}
test('incoming messages stay visible when review suggestions are unavailable', async ({ page }) => {
  await mock(page, { mailReview: 'unavailable' });
  await page.goto('/admin/operations');
  await page.getByRole('button', { name: 'News outlets', exact: true }).click();
  await expect(page.getByText('Mail review suggestions are unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByText('Your request has a fee quote', { exact: true })).toBeVisible();
  await expect(page.getByText('Suggestion · Pending review', { exact: true })).toHaveCount(0);
});
test('source collections and latest candidate rows remain separate from customer acceptance', async ({ page }) => {
  await mock(page,{collection:'loaded'});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Data quality',exact:true}).click();
  const metric=(label:string)=>page.getByText(label,{exact:true}).locator('..');
  await expect(metric('Fresh source collections').getByText('1',{exact:true})).toBeVisible();
  await expect(metric('Candidate rows in view').getByText('12',{exact:true})).toBeVisible();
  await expect(metric('Candidate rows in view').getByText('22',{exact:true})).toHaveCount(0);
  await expect(metric('Accepted for customers').getByText('0',{exact:true})).toBeVisible();
  await expect(page.getByText('Historical file',{exact:true})).toBeVisible();
  await expect(page.getByText('Original locations: Local files only; no durable copy registered',{exact:true})).toBeVisible();
  await expect(page.getByText('Original locations: Local files and private storage copies recorded',{exact:true})).toBeVisible();
  await expect(page.getByText('Customer acceptance: not approved.',{exact:true})).toHaveCount(2);
  await page.getByRole('button',{name:'News outlets',exact:true}).click();
  await expect(page.getByText('Synthetic sourced story awaiting review',{exact:true})).toBeVisible();
  await expect(page.getByText('Pending editorial review',{exact:true})).toBeVisible();
  await expect(page.getByText('Synthetic Regional News · Not published',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/publish|approve|accept/i})).toHaveCount(0);
});
test('unavailable processing cannot hide sources or display zero candidate rows', async ({ page }) => {
  await mock(page,{collection:'processing_unavailable'});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Data quality',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Synthetic source collection',exact:true})).toBeVisible();
  await expect(page.getByText('Candidate rows in view',{exact:true}).locator('..').getByText('Unavailable',{exact:true})).toBeVisible();
  await expect(page.getByText('Processing results are unavailable. Source collections remain visible.',{exact:true})).toBeVisible();
});
test('incomplete original-location list does not claim that durable copies are absent', async ({ page }) => {
  await mock(page,{collection:'partial_locations'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Data quality',exact:true}).click();
  await expect(page.getByText('Original locations: Local files recorded; other locations may be outside this view',{exact:true})).toBeVisible();
  await expect(page.getByText('Original locations: Local files only; no durable copy registered',{exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/owner/collection-register-mobile-fixture.png',fullPage:true});
});
test('missing acquisition controls stay distinct from working incoming mail and state coverage is collapsed',async({page})=>{
  await mock(page,{readiness:'missing',mailReview:'recent'});
  await page.goto('/admin/operations');
  await expect(page.getByText('New request submissions: Disabled',{exact:true})).toBeVisible();
  await expect(page.getByText('Operating policy missing or ambiguous.',{exact:true})).toBeVisible();
  await expect(page.getByText('Provider capacity snapshot missing or ambiguous.',{exact:true})).toBeVisible();
  await expect(page.getByText('Agency history review missing.',{exact:true})).toBeVisible();
  await expect(page.getByText('No state assignments recorded.',{exact:true})).toBeVisible();
  await expect(page.getByText('Alabama (AL)',{exact:true})).not.toBeVisible();
  await page.getByText('State assignment coverage · Expand to view',{exact:true}).click();
  await expect(page.getByText('Alabama (AL)',{exact:true}).locator('..').getByText('Unassigned',{exact:true})).toBeVisible();
  await expect(page.getByText('South Carolina (SC)',{exact:true}).locator('..').getByText('Blocked by operations',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  await expect(page.getByText('Recent successful run',{exact:true})).toBeVisible();
  await expect(page.getByText('No public-download run is recorded yet.',{exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/start|send|approve|publish/i})).toHaveCount(0);
});
test('assignment approvals, dates and stale provider evidence remain explicit',async({page})=>{
  await mock(page,{readiness:'configured'});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Collection',exact:true}).click();
  await expect(page.getByText('Policy awaiting approval',{exact:true})).toBeVisible();
  await expect(page.getByText('Collection pause: On',{exact:true})).toBeVisible();
  await expect(page.getByText('Capacity snapshot expired or out of date',{exact:true})).toBeVisible();
  await expect(page.getByText('Recorded submission slots: 100 · Recorded outbound messages: 50',{exact:true})).toBeVisible();
  await expect(page.getByText('1 review records shown · 0 marked complete within their review window',{exact:true})).toBeVisible();
  await page.getByText('State assignment coverage · Expand to view',{exact:true}).click();
  for(const [state,label] of [['Florida (FL)','Awaiting approval'],['New York (NY)','Assignment expired'],['Texas (TX)','Approved · Starts later'],['California (CA)','Assignment approval recorded']]){
    await expect(page.getByText(state,{exact:true}).locator('..').getByText(label,{exact:true})).toBeVisible();
  }
  await expect(page.getByText('Records staged for review',{exact:true})).toBeVisible();
  await expect(page.getByText('New request submissions: Disabled',{exact:true})).toBeVisible();
  await expect(page.getByText('Ready to send',{exact:true})).toHaveCount(0);
});
test('unavailable or incomplete assignment feeds never report unassigned or zero ready states',async({page})=>{
  await mock(page,{readiness:'partial'});
  await page.goto('/admin/operations');
  await page.getByText('State assignment coverage · Expand to view',{exact:true}).click();
  await expect(page.getByText('The assignment list is unavailable or incomplete. Absent rows remain unknown.',{exact:true})).toBeVisible();
  await expect(page.getByText('Alabama (AL)',{exact:true}).locator('..').getByText('Assignment unknown',{exact:true})).toBeVisible();
  await expect(page.getByText('Unassigned',{exact:true})).toHaveCount(0);
  await expect(page.getByText('0 ready',{exact:false})).toHaveCount(0);
});
test('runtime feed failure preserves recorded disabled controls and fits a small screen',async({page})=>{
  await mock(page,{readiness:'unavailable'});
  await page.setViewportSize({width:390,height:844});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Collection',exact:true}).click();
  await expect(page.getByText('New request submissions: Disabled',{exact:true})).toBeVisible();
  await expect(page.getByText('Status unavailable. This check has not been connected or could not be read.',{exact:true}).first()).toBeVisible();
  await expect(page.getByText('Operating policy missing or ambiguous.',{exact:true})).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:'test-results/owner/acquisition-readiness-mobile-fixture.png',fullPage:true});
});
test('zero-record public-download success is explicit and stays separate from a collection delivery',async({page})=>{
  await mock(page,{publicDownload:{status:'empty'}});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  await expect(page.getByText('Check completed · No records found in the checked period',{exact:true})).toBeVisible();
  await expect(page.getByText('Collector status needs verification',{exact:true})).toHaveCount(0);
  await expect(page.getByText('Collection registered',{exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/start|send|approve|publish/i})).toHaveCount(0);
});
for(const [error,reason] of [['harvester_paused','The collector control is off.'],['control_missing','The collector control is missing.'],['control_invalid','The collector control needs review.']]){
  test(`public collector pause ${error} stays explicit despite a previous successful run`,async({page})=>{
    await mock(page,{publicDownload:{status:'paused',error}});
    await page.goto('/admin/operations');
    await page.getByRole('button',{name:'Agents',exact:true}).click();
    await expect(page.getByText('Collector paused',{exact:true})).toBeVisible();
    await expect(page.getByText(reason,{exact:true})).toBeVisible();
    await expect(page.getByText('Collector status needs verification',{exact:true})).toHaveCount(0);
    await expect(page.getByText('Collector check needed',{exact:true})).toHaveCount(0);
  });
}
test('failed public-download wrapper status is never interpreted as successful',async({page})=>{
  await mock(page,{publicDownload:{status:'failed',error:'database_unavailable'}});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  await expect(page.getByText('Collector check needed',{exact:true})).toBeVisible();
  await expect(page.getByText('Check completed · No records found in the checked period',{exact:true})).toHaveCount(0);
});
test('an error attached to an empty status requires a check rather than claiming successful zero records',async({page})=>{
  await mock(page,{publicDownload:{status:'empty',error:'health_write_failed'}});
  await page.goto('/admin/operations');
  await page.getByRole('button',{name:'Agents',exact:true}).click();
  await expect(page.getByText('Collector check needed',{exact:true})).toBeVisible();
  await expect(page.getByText('Check completed · No records found in the checked period',{exact:true})).toHaveCount(0);
});
