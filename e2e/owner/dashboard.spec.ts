import { test, expect, type Page } from '@playwright/test';

const id = '00000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const user = { id, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: now, created_at: now, app_metadata: {}, user_metadata: {} };
async function mock(page: Page, options: { owner?: boolean; failed?: boolean; empty?: boolean; auth?: boolean; missingCost?: boolean } = {}) {
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
  await page.locator('summary').click();
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
