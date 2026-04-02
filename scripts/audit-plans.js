#!/usr/bin/env node
/**
 * Snap Ignite — Full Plan Flow Audit
 * Tests signup + dashboard flow for each plan tier
 */

const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'https://snapignite.com';
const SCREENSHOTS_DIR = '/root/.openclaw/workspace/audit-screenshots/plans';
const REPORT = [];

const TEST_ACCOUNTS = [
  { plan: 'Free',    email: 'testfree001@gmail.com',    password: 'TestPass123!' },
  { plan: 'PAYG',    email: 'testpayg001@gmail.com',    password: 'TestPass123!' },
  { plan: 'Starter', email: 'teststarter001@gmail.com', password: 'TestPass123!' },
  { plan: 'Pro',     email: 'testpro001@gmail.com',     password: 'TestPass123!' },
  { plan: 'Elite',   email: 'testelite001@gmail.com',   password: 'TestPass123!' },
];

if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

function log(plan, section, status, detail) {
  const entry = { plan, section, status, detail };
  REPORT.push(entry);
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : 'ℹ️';
  console.log(`${icon} [${plan}] [${section}] ${detail}`);
}

async function shot(page, name) {
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${name}.png`, fullPage: true }).catch(() => {});
}

async function testAccount(browser, account) {
  const { plan, email, password } = account;
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

  console.log(`\n${'='.repeat(50)}`);
  console.log(`TESTING: ${plan} — ${email}`);
  console.log('='.repeat(50));

  try {
    // ── SIGN UP ──────────────────────────────────────
    const start = Date.now();
    await page.goto(`${BASE_URL}/auth?mode=signup`, { waitUntil: 'networkidle', timeout: 15000 });
    await shot(page, `${plan}-01-signup`);

    // Fill signup form
    const emailInput = await page.$('input[type="email"], input[name="email"]');
    const passwordInput = await page.$('input[type="password"]');

    if (!emailInput || !passwordInput) {
      log(plan, 'Signup', 'FAIL', 'Form fields not found');
      await context.close();
      return;
    }

    await emailInput.fill(email);
    await passwordInput.fill(password);
    await shot(page, `${plan}-02-signup-filled`);

    // Submit
    const submitBtn = await page.$('button[type="submit"]');
    if (submitBtn) {
      await submitBtn.click();
      await page.waitForTimeout(3000);
      await shot(page, `${plan}-03-after-signup`);
    }

    const afterSignupUrl = page.url();
    const afterSignupText = await page.textContent('body').catch(() => '');

    // Check for email verification requirement
    const needsVerification = /verify|confirm|check your email|sent you/i.test(afterSignupText);
    const signupError = /already.*exist|invalid|error|taken/i.test(afterSignupText);
    const signedIn = afterSignupUrl.includes('/dashboard') || afterSignupUrl.includes('/search') || afterSignupUrl.includes('/app');

    if (needsVerification) {
      log(plan, 'Signup', 'WARN', `Email verification required — blocks immediate access (${Math.round((Date.now()-start)/1000)}s)`);
      await context.close();
      return;
    } else if (signupError) {
      // Try login instead (account may already exist)
      log(plan, 'Signup', 'INFO', 'Account exists — trying login');
      await page.goto(`${BASE_URL}/auth?mode=signin`, { waitUntil: 'networkidle', timeout: 15000 });
      const eField = await page.$('input[type="email"], input[name="email"]');
      const pField = await page.$('input[type="password"]');
      if (eField && pField) {
        await eField.fill(email);
        await pField.fill(password);
        const loginBtn = await page.$('button[type="submit"]');
        if (loginBtn) await loginBtn.click();
        await page.waitForTimeout(3000);
        await shot(page, `${plan}-03-after-login`);
      }
    } else if (signedIn) {
      log(plan, 'Signup', 'PASS', `Signup successful → redirected to ${afterSignupUrl} (${Math.round((Date.now()-start)/1000)}s)`);
    } else {
      log(plan, 'Signup', 'INFO', `Landed at: ${afterSignupUrl}`);
    }

    // ── DASHBOARD / MAIN APP ─────────────────────────
    const currentUrl = page.url();
    const pageText = await page.textContent('body').catch(() => '');
    await shot(page, `${plan}-04-dashboard`);

    // What does the user see after login?
    const hasSearch = /search|address|find property/i.test(pageText);
    const hasCredits = /credit|balance|unlock/i.test(pageText);
    const hasPlanBadge = new RegExp(plan, 'i').test(pageText);
    const hasUpgradePrompt = /upgrade|get more|unlock more/i.test(pageText);
    const hasEmptyState = /no result|get started|add/i.test(pageText);

    log(plan, 'Dashboard', hasSearch ? 'PASS' : 'WARN',
      hasSearch ? 'Search/address input visible' : 'No search field on dashboard');
    log(plan, 'Credits', hasCredits ? 'PASS' : 'WARN',
      hasCredits ? 'Credit/balance visible' : 'No credit balance shown — user may not know their limits');
    log(plan, 'Plan Badge', hasPlanBadge ? 'PASS' : 'INFO',
      hasPlanBadge ? `Plan name "${plan}" visible` : `Plan name not visible on screen`);
    log(plan, 'Upgrade CTA', hasUpgradePrompt ? 'INFO' : 'INFO',
      hasUpgradePrompt ? 'Upgrade prompt present' : 'No upgrade prompt shown');

    // ── TRY A PROPERTY SEARCH ────────────────────────
    const searchInput = await page.$('input[placeholder*="address" i], input[placeholder*="search" i], input[type="search"]');
    if (searchInput) {
      await searchInput.fill('742 Evergreen Terrace, Springfield, IL');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(3000);
      await shot(page, `${plan}-05-search-result`);

      const resultText = await page.textContent('body').catch(() => '');
      const hasResults = /violation|shutoff|result|property|record/i.test(resultText);
      const isPaywalled = /unlock|credit|upgrade|sign up|purchase/i.test(resultText);
      const noResults = /no result|not found|no data/i.test(resultText);

      if (hasResults && !isPaywalled) {
        log(plan, 'Search', 'PASS', 'Search returned visible results');
      } else if (isPaywalled) {
        log(plan, 'Search', 'INFO', 'Search result is paywalled — requires unlock/credit');
      } else if (noResults) {
        log(plan, 'Search', 'INFO', 'No results for test address (expected)');
      } else {
        log(plan, 'Search', 'WARN', 'Search result unclear — check screenshot');
      }
    } else {
      log(plan, 'Search', 'WARN', 'No search input found after login');
    }

    // ── NAV / MENU ───────────────────────────────────
    await shot(page, `${plan}-06-nav`);
    const navItems = await page.$$eval('nav a, [role="navigation"] a, aside a', els =>
      els.map(el => el.textContent.trim()).filter(Boolean)
    ).catch(() => []);
    log(plan, 'Navigation', navItems.length > 0 ? 'PASS' : 'WARN',
      navItems.length > 0 ? `Nav items: ${navItems.slice(0,8).join(', ')}` : 'No nav items found');

    // ── SETTINGS / ACCOUNT PAGE ──────────────────────
    await page.goto(`${BASE_URL}/settings`, { waitUntil: 'networkidle', timeout: 10000 }).catch(() => {});
    await shot(page, `${plan}-07-settings`);
    const settingsText = await page.textContent('body').catch(() => '');
    const hasAccountInfo = /account|profile|email|plan|subscription/i.test(settingsText);
    log(plan, 'Settings', hasAccountInfo ? 'PASS' : 'WARN',
      hasAccountInfo ? 'Settings/account page accessible' : 'Settings page missing or empty');

    // ── JS ERRORS ────────────────────────────────────
    if (errors.length > 0) {
      log(plan, 'JS Errors', 'FAIL', `${errors.length} error(s): ${errors.slice(0,2).join(' | ')}`);
    } else {
      log(plan, 'JS Errors', 'PASS', 'No console errors');
    }

  } catch (err) {
    log(plan, 'FATAL', 'FAIL', err.message);
    await shot(page, `${plan}-error`);
  }

  await context.close();
}

(async () => {
  const browser = await chromium.launch({ headless: true });

  // Only test Free and PAYG first (no payment needed)
  // Starter/Pro/Elite would need real payment flows
  for (const account of TEST_ACCOUNTS) {
    await testAccount(browser, account);
  }

  await browser.close();

  // ── FINAL REPORT ─────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('SNAP IGNITE PLAN FLOW AUDIT');
  console.log('='.repeat(60));

  const passes = REPORT.filter(r => r.status === 'PASS').length;
  const fails = REPORT.filter(r => r.status === 'FAIL').length;
  const warns = REPORT.filter(r => r.status === 'WARN').length;
  console.log(`\n✅ PASS: ${passes}  ❌ FAIL: ${fails}  ⚠️  WARN: ${warns}`);

  // Group by plan
  const plans = [...new Set(REPORT.map(r => r.plan))];
  for (const plan of plans) {
    const planItems = REPORT.filter(r => r.plan === plan);
    const pFails = planItems.filter(r => r.status === 'FAIL');
    const pWarns = planItems.filter(r => r.status === 'WARN');
    console.log(`\n── ${plan} ──`);
    planItems.forEach(r => {
      const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : r.status === 'WARN' ? '⚠️' : 'ℹ️';
      console.log(`  ${icon} [${r.section}] ${r.detail}`);
    });
  }

  fs.writeFileSync('/root/.openclaw/workspace/audit-plans-report.json', JSON.stringify(REPORT, null, 2));
  console.log('\nReport: audit-plans-report.json');
  console.log(`Screenshots: ${SCREENSHOTS_DIR}/`);
})();
