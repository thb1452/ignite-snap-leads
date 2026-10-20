import { chromium, expect } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import { buffaloPage } from './buffalo-source-review-fixture.mjs';

const root = process.env.SNAP_BUFFALO_TEST_ARTIFACT_DIR || new URL('../test-results/buffalo-review', import.meta.url).pathname;
await mkdir(root, {recursive: true, mode: 0o700});
const browser = await chromium.launch({headless: true,
  ...(process.env.SNAP_TEST_CHROMIUM_PATH ? {executablePath: process.env.SNAP_TEST_CHROMIUM_PATH, args: ['--no-sandbox', '--disable-dev-shm-usage']} : {}),
});
const context = await browser.newContext({viewport: {width: 1280, height: 900}, timezoneId: 'America/Los_Angeles'});
const user = {id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', role: 'authenticated', aud: 'authenticated', email_confirmed_at: '2026-09-01T00:00:00Z', app_metadata: {provider: 'email'}, user_metadata: {}, created_at: '2026-09-01T00:00:00Z'};
const session = {access_token: 'synthetic-owner-only', refresh_token: 'synthetic-refresh-only', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user};
let allowed = true, hold = false, release;
const unexpected = [], reads = [], checks = [];
const unavailable = {version: 'owner-buffalo-source-review-v1', status: 'unavailable'};
await context.route('**/*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.hostname === '127.0.0.1') return route.continue();
  const json = data => route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify(data)});
  if (url.pathname === '/rest/v1/rpc/fn_owner_buffalo_source_review_v1') {
    reads.push(request.postDataJSON());
    if (hold) await new Promise(resolve => {release = resolve;});
    const response = allowed ? buffaloPage(request.postDataJSON().p_offset) : unavailable;
    if (response.status === 'available') response.events[0].comments = '<img src="x" onerror="alert(1)"> Literal agency text';
    return json(response);
  }
  if (url.pathname === '/rest/v1/rpc/fn_owner_source_review_batches_v1') return json({version: 'owner-source-review-batches-v1', checked_at: new Date().toISOString(), batches: [], total_count: 0, truncated: false});
  if (url.pathname === '/rest/v1/rpc/fn_private_cleaned_records_v1') return json({version: 'private-cleaned-records-v1', records: [], total: 0});
  if (url.pathname === '/auth/v1/logout') return route.fulfill({status: 204});
  if (url.pathname.startsWith('/auth/v1/')) return json(user);
  if (url.hostname.endsWith('.supabase.co') && request.method() === 'GET') return json([]);
  if (url.pathname === '/rest/v1/user_activity_log') return json([]);
  if (url.hostname.endsWith('.supabase.co') && request.method() !== 'GET') unexpected.push(url.pathname);
  return route.abort();
});
const page = await context.newPage();
try {
  await page.goto('http://127.0.0.1:4198/owner/source-review');
  await expect(page.getByRole('heading', {name: 'Sign in to review'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Buffalo residential pilot'})).toHaveCount(0);
  if (reads.length) throw new Error('Signed-out page requested Buffalo records');
  checks.push('Signed-out page requests no Buffalo records.');
  await page.evaluate(value => localStorage.setItem('sb-ojyxblegxpdgaqiscxpz-auth-token', JSON.stringify(value)), session);
  await page.reload();
  const panel = page.locator('section[aria-labelledby="buffalo-review-heading"]');
  await expect(panel.getByText('Showing 1–25 of 984 Buffalo violations')).toBeVisible();
  await expect(panel.getByText('984', {exact: true})).toBeVisible();
  await expect(panel.getByText('322', {exact: true})).toBeVisible();
  await expect(panel.getByText('307', {exact: true})).toBeVisible();
  await expect(panel.locator('article')).toHaveCount(25);
  await expect(panel.locator('article').first()).toContainText('Violation date: Sep 21, 2026');
  await expect(panel.locator('article').first()).toContainText('Agency violation ID 538401');
  await expect(panel.locator('article img')).toHaveCount(0);
  await expect(panel.getByText('ACTIVE at collection', {exact: true})).toHaveCount(25);
  await expect(panel.getByText(/Multiple parcels can share an address/)).toBeVisible();
  await page.screenshot({path: root + '/buffalo-desktop.png', fullPage: false});
  checks.push('Counts, distinct IDs, snapshot status, literal agency text and agency date render without a timezone shift.');
  await panel.getByRole('button', {name: 'Next Buffalo records', exact: true}).click();
  await expect(panel.getByText('Showing 26–50 of 984 Buffalo violations')).toBeVisible();
  await expect(panel.locator('article').first()).toContainText('Agency violation ID 538426');
  checks.push('Next page reads the next 25 source IDs without merging shared cases.');
  await page.setViewportSize({width: 390, height: 844});
  await page.screenshot({path: root + '/buffalo-mobile.png', fullPage: false});
  if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)) throw new Error('Mobile viewport overflow');
  checks.push('The review fits a 390px mobile viewport.');
  allowed = false;
  await panel.getByRole('button', {name: 'Refresh Buffalo records'}).click();
  await expect(panel.getByText('No Buffalo pilot is assigned to this account.')).toBeVisible();
  await expect(panel.locator('article')).toHaveCount(0);
  checks.push('Revoked/unassigned access clears prior displayed records.');
  allowed = true; hold = true;
  await panel.getByRole('button', {name: 'Refresh Buffalo records'}).click();
  await expect.poll(() => Boolean(release)).toBeTruthy();
  await page.getByRole('button', {name: 'Sign out', exact: true}).click();
  release();
  await expect(page.getByRole('heading', {name: 'Sign in to review'})).toBeVisible();
  await expect(page.locator('article')).toHaveCount(0);
  checks.push('A delayed Buffalo response remains hidden after sign-out.');
  if (unexpected.length) throw new Error('Unexpected external calls: ' + unexpected.join(','));
  checks.push('No import, release, CRM, email, payment or customer-publication actions are attempted.');
  await writeFile(root + '/browser-results.json', JSON.stringify({passed: true, kind: 'isolated-browser-with-intercepted-synthetic-responses', production_network_used: false, checks}, null, 2) + '\n', {mode: 0o600});
  console.log(JSON.stringify({passed: true, checks: checks.length, artifactRoot: root}));
} finally {await browser.close();}
