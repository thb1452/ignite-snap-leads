import { test, expect, type Page } from '@playwright/test';

const id = '00000000-0000-4000-8000-000000000001';
const now = new Date().toISOString();
const user = { id, email: 'owner@example.test', aud: 'authenticated', role: 'authenticated', email_confirmed_at: now, created_at: now, app_metadata: {}, user_metadata: {} };
async function mock(page: Page, options: { owner?: boolean; failed?: boolean; empty?: boolean; auth?: boolean; missingCost?: boolean } = {}) {
  const session = { access_token: 'test-only', refresh_token: 'test-only', expires_at: Math.floor(Date.now()/1000)+3600, expires_in: 3600, token_type: 'bearer', user };
  if (options.auth !== false) await page.addInitScript(({ session, id }) => {
    localStorage.setItem('sb-ojyxblegxpdgaqiscxpz-auth-token', JSON.stringify(session));
    localStorage.setItem('snap_user_roles_cache', JSON.stringify({ userId: id, roles: ['admin'], timestamp: Date.now() }));
  }, { session, id });
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === '127.0.0.1' || url.hostname === 'localhost') return route.continue();
    if (!url.hostname.endsWith('.supabase.co')) return route.abort();
    const path = url.pathname;
    const table = path.split('/').pop();
    let body: unknown = [];
    let total = 0;
    if (path.startsWith('/auth/v1/user')) body = user;
    else if (table === 'has_role') body = options.owner !== false;
    else if (table === 'user_roles') body = [{ role: 'admin' }];
    else if (options.failed && ['foia_request_jobs', 'agent_runs', 'press_accounts', 'foia_responses', 'upload_jobs', 'v_needs_human_review_queue'].includes(table!)) {
      return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ message: 'permission denied' }) });
    } else if (table === 'foia_request_jobs' && !options.empty) {
      body = [
        { id: 'code-1', request_type: 'code_violation', status: 'sent', jurisdiction: 'Code County', state: 'FL', updated_at: now, sent_at: now, response_due_at: null, retry_count: 0 },
        { id: 'water-1', request_type: 'water_shutoff', status: 'pending', jurisdiction: 'Water City', state: 'TX', updated_at: now, sent_at: null, response_due_at: null, retry_count: 1 },
        { id: 'unknown-1', request_type: 'tax_records', status: 'needs_review', jurisdiction: 'Other County', state: 'GA', updated_at: now, sent_at: null, response_due_at: null, retry_count: 0 },
      ]; total = 3;
    } else if (table === 'agent_runs' && !options.empty) {
      body = [{ id: 1, agent_name: 'Collection agent', status: 'completed', created_at: now, duration_ms: 1000, cost_usd: options.missingCost ? null : 0.12 }]; total = 1;
    } else if (table === 'press_accounts' && !options.empty) {
      body = [{ id: 'press-1', name: 'Test News Outlet', domain: 'news.example.test', email: 'press@news.example.test', is_active: true }]; total = 1;
    } else if (table === 'foia_responses' && !options.empty) total = 2;
    else if (table === 'v_needs_human_review_queue' && !options.empty) {
      body = [{ domain: 'foia', job_id: 'review-1', job_subtype: 'fee_quote', jurisdiction: 'Review County', state: 'FL', updated_at: now, created_at: now }]; total = 1;
    }
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
  page.on('request', req => { if (req.url().includes('/rest/v1/foia_request_jobs')) reads++; });
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
  await expect(page.getByText('Test News Outlet')).toBeVisible();
  await expect(page.getByText('Publishing feed not connected')).toBeVisible();
  await page.getByRole('button', { name: 'Your decisions', exact: true }).click();
  await page.locator('summary').click();
  await expect(page.getByText('No approval is submitted from this screen.', { exact: false })).toBeVisible();
});
test('failed feeds are unavailable, never empty or healthy', async ({ page }) => {
  await mock(page, { failed: true });
  await page.goto('/admin/operations');
  await expect(page.getByText('7 feeds are unavailable.', { exact: false })).toBeVisible();
  await expect(page.getByText('No collection jobs are visible', { exact: false })).toHaveCount(0);
  await expect(page.getByText('All jurisdictions fresh.')).toHaveCount(0);
});
test('unknown costs remain unknown and successful empty feeds stay explicit', async ({ page }) => {
  await mock(page, { empty: true });
  await page.goto('/admin/operations');
  await expect(page.getByText('Not fully recorded', { exact: true })).toBeVisible();
  await expect(page.getByText('No collection jobs are visible', { exact: false })).toBeVisible();
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
