import test from 'node:test';
import assert from 'node:assert/strict';
import { subscriptionSavings } from '../src/lib/pricing.ts';
import { recordIngestionStats, recordIngestionWindow } from '../src/lib/recordIngestionStats.ts';
import { isPublicIndexablePath } from '../src/lib/publicRoutes.ts';

// Financial comparisons must use equal quantities and exact cents.
test('full allowance savings compare the same quantity against PAYG without floating point drift', () => {
  assert.equal(subscriptionSavings(750, 49), 453.5);
  assert.equal(subscriptionSavings(1500, 99), 906);
  assert.equal(subscriptionSavings(3000, 199), 1811);
  assert.equal(subscriptionSavings(1, 0.67), 0);
  assert.throws(() => subscriptionSavings(-1, 49), RangeError);
  assert.throws(() => subscriptionSavings(1.5, 49), RangeError);
  assert.throws(() => subscriptionSavings(1500, NaN), RangeError);
});

test('ingestion window is exactly thirty elapsed days even across month boundaries', () => {
  const now = new Date('2026-03-15T12:00:00Z');
  assert.equal(recordIngestionWindow(now), '2026-02-13T12:00:00.000Z');
  assert.equal(now.toISOString(), '2026-03-15T12:00:00.000Z');
  assert.throws(() => recordIngestionWindow(new Date(NaN)), RangeError);
});

test('unknown counts never become zero and large counts never round upward', () => {
  const now = new Date('2026-09-24T12:00:00Z');
  assert.equal(recordIngestionStats(0, now).formattedCount, '0');
  assert.equal(recordIngestionStats(1051, now).formattedCount, '1,051');
  assert.equal(recordIngestionStats(190, now).count, 190);
  for (const count of [null, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => recordIngestionStats(count, now));
});

test('account, private CRM, admin, unknown and ambiguous legacy city routes are noindex', () => {
  for (const path of ['/auth', '/crm/pipeline', '/crm/leads/123', '/admin', '/settings', '/checkout/success', '/owner/source-review', '/code-violations/springfield', '/new-route']) assert.equal(isPublicIndexablePath(path), false, path);
  for (const path of ['/', '/pricing', '/pricing/', '/code-violations', '/code-violation-leads']) assert.equal(isPublicIndexablePath(path), true, path);
});
