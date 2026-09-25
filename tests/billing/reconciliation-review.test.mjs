import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareReview, preflightSql } from '../../scripts/prepare-billing-reconciliation-review.mjs';

const fixture = (overrides = {}) => ({
  observed_at: '2026-09-24T19:00:00Z',
  provider_scope: { account: 'fixture', mode: 'live' },
  canonical_subscriptions: [],
  classified: [{
    id: '00000000-0000-0000-0000-000000000001', user_id: 'fixture-user',
    stripe_subscription_id: 'sub_test_fixture', class: 'historical_test',
    status: 'active', current_period_end: '2026-02-24T00:00:00Z',
    updated_at: '2026-01-24T00:00:00Z',
    evidence: [{ event_id: 'evt_fixture', object_id: 'sub_test_fixture', livemode: false }],
    ...overrides,
  }],
});

test('only exact historical test evidence and an expired application period propose archival', () => {
  const plan = prepareReview(fixture());
  assert.equal(plan.state, 'CANDIDATE_REQUIRES_ROOT_REVIEW_NOT_APPLIED');
  assert.equal(plan.application_label_changes, 1);
  assert.equal(plan.rows[0].proposed_application_status, 'cancelled');
  assert.equal(plan.rows[0].expected_status, 'active');
  assert.deepEqual(plan.rows[0].evidence_event_ids, ['evt_fixture']);
  assert.match(plan.prerequisite, /before any production update/);
});

test('missing, mixed-mode and unrelated event evidence cannot prove test identity', () => {
  for (const evidence of [[], [{ object_id: 'sub_test_fixture', livemode: true }],
    [{ object_id: 'sub_other', livemode: false }],
    [{ object_id: 'sub_test_fixture', livemode: false }, { object_id: 'sub_test_fixture', livemode: true }]]) {
    assert.throws(() => prepareReview(fixture({ evidence })), /exact-event evidence/);
  }
});

test('unverified and internal identities retain their existing labels and periods', () => {
  for (const classification of ['unverified_identity', 'no_provider_identity']) {
    const plan = prepareReview(fixture({ class: classification, evidence: [] }));
    assert.equal(plan.application_label_changes, 0);
    assert.equal(plan.rows[0].proposed_application_status, 'active');
    assert.equal(plan.rows[0].expected_current_period_end, '2026-02-24T00:00:00Z');
    assert.equal(plan.unresolved, classification === 'unverified_identity' ? 1 : 0);
  }
});

test('current or unparseable test periods are review-only and canceled history remains unchanged', () => {
  for (const current_period_end of ['2026-10-24T00:00:00Z', null, 'invalid']) {
    const plan = prepareReview(fixture({ current_period_end }));
    assert.equal(plan.application_label_changes, 0);
    assert.equal(plan.rows[0].action, 'review_current_test_entitlement');
  }
  assert.equal(prepareReview(fixture({ status: 'cancelled' })).application_label_changes, 0);
});

test('review rejects duplicate identities and invalid snapshot time', () => {
  const duplicate = fixture(); duplicate.classified.push(duplicate.classified[0]);
  assert.throws(() => prepareReview(duplicate), /duplicate row identity/);
  assert.throws(() => prepareReview({ ...fixture(), observed_at: 'invalid' }), /observation timestamp/);
});

test('generated preflight uses a read-only transaction and checks the complete before-image', () => {
  const sql = preflightSql(prepareReview(fixture()));
  assert.match(sql, /BEGIN READ ONLY;/);
  assert.match(sql, /ROLLBACK;/);
  for (const column of ['status', 'updated_at', 'current_period_end', 'stripe_subscription_id']) {
    assert.match(sql, new RegExp(`s\\.${column} IS NOT DISTINCT FROM`));
  }
  assert.doesNotMatch(sql, /\b(?:UPDATE|DELETE|INSERT|ALTER|DROP|TRUNCATE)\s/i);
});
