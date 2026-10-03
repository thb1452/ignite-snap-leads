import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasCheckoutReturnHint } from '../src/services/checkoutReturnHint.ts';

const now = Date.parse('2026-09-08T12:00:00Z');
test('URL values are only a boolean navigation hint, including forged or malformed amounts', () => {
  for (const search of ['credits_added=5000', 'credits_added=-1', 'credits_added=NaN',
    'credits_added=%3Cscript%3Eprivate%3C%2Fscript%3E', 'credits_added=', 'session_id=forged']) {
    assert.equal(hasCheckoutReturnHint(search, null, now), true);
  }
});
test('unrelated navigation and ordinary account state are not checkout hints', () => {
  for (const pending of [null, undefined, {}, {balance:5000}, {plan_name:'professional'}]) {
    assert.equal(hasCheckoutReturnHint('tab=subscription', pending, now), false);
  }
});
test('fresh legacy checkout hints remain unverified regardless expected balance or plan', () => {
  for (const type of ['subscription', 'bulk_credits']) {
    assert.equal(hasCheckoutReturnHint('', {type, at:now, expectedBalance:9000, expectedTier:'enterprise'}, now), true);
  }
});
test('expired, future and nonfinite timestamps cannot revive stored hints', () => {
  for (const at of [now-3600001, now+1, Infinity, -Infinity, NaN, 'yesterday', null]) {
    assert.equal(hasCheckoutReturnHint('', {type:'bulk_credits', at}, now), false);
  }
  assert.equal(hasCheckoutReturnHint('', {type:'subscription',at:now-3600000}, now), true);
});
test('malformed storage values and unsupported types fail closed', () => {
  for (const value of [true, 5, 'subscription', [], {type:'verified',at:now}, {type:'bulk_credits'},
    {type:'subscription',at:String(now)}]) assert.equal(hasCheckoutReturnHint('', value, now), false);
});
