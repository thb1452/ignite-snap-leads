#!/usr/bin/env node
/**
 * Snap Ignite UX Audit Script
 * Runs headless Playwright browser through key user flows
 * and reports broken flows, slow pages, and UX issues.
 */

const { chromium } = require('playwright');
const fs = require('fs');

const BASE_URL = 'https://snapignite.com';
const REPORT = [];
const SCREENSHOTS_DIR = '/root/.openclaw/workspace/audit-screenshots';

function log(section, status, detail) {
  const entry = { section, status, detail };
  REPORT.push(entry);
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : 'ℹ️';
  console.log(`${icon} [${section}] ${detail}`);
}

async function measure(label, fn) {
  const start = Date.now();
  const result = await fn();
  const ms = Date.now() - start;
  if (ms > 3000) log(label, 'WARN', `Slow load: ${ms}ms`);
  else log(label, 'INFO', `Load time: ${ms}ms`);
  return result;
}

async function screenshot(page, name) {
  if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  await page.screenshot({ path: `${SCREENSHOTS_DIR}/${name}.png`, fullPage: true });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 }, // iPhone 14 — JR works from phone
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
  });
  const page = await context.newPage();

  // Capture console errors
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push(err.message));

  try {
    // ── 1. HOMEPAGE ──────────────────────────────────────────────
    console.log('\n=== HOMEPAGE ===');
    await measure('Homepage', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    });
    await screenshot(page, '01-homepage');

    const title = await page.title();
    log('Homepage', title ? 'PASS' : 'FAIL', `Title: "${title}"`);

    // Check hero CTA buttons
    const ctaButtons = await page.$$eval('a, button', els =>
      els.filter(el => /sign up|get started|try free|start|search/i.test(el.textContent))
         .map(el => ({ text: el.textContent.trim(), href: el.href || null, visible: el.offsetParent !== null }))
    );
    if (ctaButtons.length > 0) {
      log('Homepage CTA', 'PASS', `Found ${ctaButtons.length} CTA(s): ${ctaButtons.map(b => `"${b.text}"`).join(', ')}`);
    } else {
      log('Homepage CTA', 'WARN', 'No clear CTA buttons found on homepage');
    }

    // Check nav links
    const navLinks = await page.$$eval('nav a', els => els.map(el => ({ text: el.textContent.trim(), href: el.href })));
    log('Navigation', navLinks.length > 0 ? 'PASS' : 'WARN', `Nav links: ${navLinks.map(l => l.text).filter(Boolean).join(', ') || 'None found'}`);

    // ── 2. PRICING PAGE ──────────────────────────────────────────
    console.log('\n=== PRICING PAGE ===');
    await measure('Pricing', async () => {
      await page.goto(`${BASE_URL}/pricing`, { waitUntil: 'networkidle', timeout: 15000 });
    });
    await screenshot(page, '02-pricing');

    const pricingText = await page.textContent('body');
    const hasPricing = /\$|credit|plan|free|starter|pro|elite/i.test(pricingText);
    log('Pricing', hasPricing ? 'PASS' : 'FAIL', hasPricing ? 'Pricing content visible' : 'No pricing content found');

    // Check for price consistency
    const prices = pricingText.match(/\$[\d.]+/g) || [];
    log('Pricing Values', 'INFO', `Prices found: ${[...new Set(prices)].join(', ') || 'None'}`);

    // Check CTA on pricing
    const pricingCTAs = await page.$$eval('a, button', els =>
      els.filter(el => /buy|get started|sign up|start|choose|select/i.test(el.textContent))
         .map(el => el.textContent.trim())
    );
    log('Pricing CTA', pricingCTAs.length > 0 ? 'PASS' : 'WARN', `Pricing CTAs: ${pricingCTAs.join(', ') || 'None found'}`);

    // ── 3. SIGN UP FLOW ──────────────────────────────────────────
    console.log('\n=== SIGN UP FLOW ===');
    await measure('Auth Page', async () => {
      await page.goto(`${BASE_URL}/auth?mode=signup`, { waitUntil: 'networkidle', timeout: 15000 });
    });
    await screenshot(page, '03-signup');

    const emailInput = await page.$('input[type="email"], input[name="email"], input[placeholder*="email" i]');
    const passwordInput = await page.$('input[type="password"]');
    const submitBtn = await page.$('button[type="submit"], button');

    log('Signup Form', emailInput ? 'PASS' : 'FAIL', emailInput ? 'Email field found' : 'Email input missing');
    log('Signup Form', passwordInput ? 'PASS' : 'FAIL', passwordInput ? 'Password field found' : 'Password input missing');
    log('Signup Form', submitBtn ? 'PASS' : 'FAIL', submitBtn ? 'Submit button found' : 'Submit button missing');

    // Check for social auth
    const socialAuth = await page.$$eval('button, a', els =>
      els.filter(el => /google|apple|github|facebook/i.test(el.textContent))
         .map(el => el.textContent.trim())
    );
    log('Social Auth', socialAuth.length > 0 ? 'INFO' : 'WARN',
      socialAuth.length > 0 ? `Social login: ${socialAuth.join(', ')}` : 'No social login options — adds friction');

    // ── 4. SIGN IN FLOW ──────────────────────────────────────────
    console.log('\n=== SIGN IN FLOW ===');
    await measure('Sign In Page', async () => {
      await page.goto(`${BASE_URL}/auth?mode=signin`, { waitUntil: 'networkidle', timeout: 15000 });
    });
    await screenshot(page, '04-signin');

    const forgotPassword = await page.$('a[href*="forgot"], a[href*="reset"], button');
    log('Sign In', forgotPassword ? 'PASS' : 'WARN', forgotPassword ? 'Forgot password link present' : 'No forgot password link — friction point');

    // ── 5. SEARCH / PROPERTY FLOW ────────────────────────────────
    console.log('\n=== SEARCH FLOW ===');
    await measure('Homepage Search', async () => {
      await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    });

    const searchInput = await page.$('input[placeholder*="address" i], input[placeholder*="search" i], input[type="search"]');
    if (searchInput) {
      log('Search', 'PASS', 'Address search field found on homepage');
      try {
        await searchInput.fill('123 Main St, Miami, FL');
        await page.keyboard.press('Enter');
        await page.waitForTimeout(2000);
        await screenshot(page, '05-search-result');
        const resultText = await page.textContent('body');
        const hasResult = /violation|shutoff|result|property|unlock/i.test(resultText);
        log('Search Result', hasResult ? 'PASS' : 'WARN', hasResult ? 'Search returned results' : 'No results or redirect to auth');
      } catch (e) {
        log('Search', 'WARN', `Search interaction failed: ${e.message}`);
      }
    } else {
      log('Search', 'WARN', 'No address search field on homepage — high friction for new users');
    }

    // ── 6. MOBILE RESPONSIVENESS ─────────────────────────────────
    console.log('\n=== MOBILE CHECK ===');
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 15000 });
    const hasHorizontalScroll = await page.evaluate(() => document.body.scrollWidth > window.innerWidth);
    log('Mobile Layout', hasHorizontalScroll ? 'WARN' : 'PASS',
      hasHorizontalScroll ? 'Horizontal scroll detected — layout breaks on mobile' : 'No horizontal overflow');

    // ── 7. PAGE SPEED CHECK ──────────────────────────────────────
    console.log('\n=== PERFORMANCE ===');
    const perfMetrics = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      return nav ? {
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd),
        loadComplete: Math.round(nav.loadEventEnd),
      } : null;
    });
    if (perfMetrics) {
      log('Performance', perfMetrics.loadComplete > 5000 ? 'WARN' : 'PASS',
        `DOM ready: ${perfMetrics.domContentLoaded}ms | Full load: ${perfMetrics.loadComplete}ms`);
    }

    // ── 8. CONSOLE ERRORS ────────────────────────────────────────
    if (consoleErrors.length > 0) {
      log('JS Errors', 'FAIL', `${consoleErrors.length} JS error(s): ${consoleErrors.slice(0, 3).join(' | ')}`);
    } else {
      log('JS Errors', 'PASS', 'No JavaScript console errors');
    }

  } catch (err) {
    log('FATAL', 'FAIL', err.message);
  } finally {
    await browser.close();
  }

  // ── FINAL REPORT ─────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('SNAP IGNITE UX AUDIT REPORT');
  console.log('='.repeat(60));

  const passes = REPORT.filter(r => r.status === 'PASS').length;
  const fails = REPORT.filter(r => r.status === 'FAIL').length;
  const warns = REPORT.filter(r => r.status === 'WARN').length;

  console.log(`\n✅ PASS: ${passes}  ❌ FAIL: ${fails}  ⚠️  WARN: ${warns}`);

  if (fails > 0) {
    console.log('\n❌ FAILURES:');
    REPORT.filter(r => r.status === 'FAIL').forEach(r => console.log(`  - [${r.section}] ${r.detail}`));
  }
  if (warns > 0) {
    console.log('\n⚠️  WARNINGS:');
    REPORT.filter(r => r.status === 'WARN').forEach(r => console.log(`  - [${r.section}] ${r.detail}`));
  }

  // Save JSON report
  fs.writeFileSync('/root/.openclaw/workspace/audit-report.json', JSON.stringify(REPORT, null, 2));
  console.log('\nFull report saved to: audit-report.json');
  console.log(`Screenshots saved to: ${SCREENSHOTS_DIR}/`);
})();
