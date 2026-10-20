import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBuffaloSourceReview, loadBuffaloSourceReview, buffaloCalendarDate} from '../src/services/buffaloSourceReview.ts';
import {buffaloPage} from './buffalo-source-review-fixture.mjs';

test('984 government violations survive all pages despite shared case and code', () => {
  const pages = Array.from({length: 40}, (_, i) => parseBuffaloSourceReview(buffaloPage(i * 25), i * 25));
  const events = pages.flatMap(page => page.events);
  assert.equal(events.length, 984);
  assert.equal(new Set(events.map(event => event.agency_record_id)).size, 984);
  assert.equal(pages.at(-1).events.length, 9);
  assert.equal(pages.at(-1).next_offset, null);
  assert.ok(pages.every(page => page.batch.case_count === 322 && page.batch.address_count === 307 && page.batch.held_count === 4));
});

test('duplicate IDs, missing rows, reordered rows, incorrect totals and pagination fail closed', () => {
  for (const change of [
    page => {page.events[1].agency_record_id = page.events[0].agency_record_id;},
    page => {page.events.pop();},
    page => {[page.events[0], page.events[1]] = [page.events[1], page.events[0]];},
    page => {page.batch.address_count = 999;},
    page => {page.next_offset = 50;},
  ]) {
    const page = buffaloPage(); change(page);
    assert.throws(() => parseBuffaloSourceReview(page, 0));
  }
  assert.throws(() => parseBuffaloSourceReview(buffaloPage(1000), 1000));
});

test('agency date is preserved without substituting case opening or collection date', () => {
  const parsed = parseBuffaloSourceReview(buffaloPage(), 0);
  assert.equal(parsed.events[0].violation_date, '2026-09-21');
  assert.equal(buffaloCalendarDate(parsed.events[0].violation_date), 'Sep 21, 2026');
  for (const change of [
    event => {event.violation_date = '2026-10-19';},
    event => {event.violation_date = '2026-02-30'; event.source_date_raw = '2026-02-30T00:00:00.000';},
    event => {event.opened_date = event.violation_date;},
    event => {event.days_open = 29;},
    event => {event.snap_score = 90;},
  ]) {
    const page = buffaloPage(); change(page.events[0]);
    assert.throws(() => parseBuffaloSourceReview(page, 0));
  }
});

test('nonresidential, unknown-status and wrong-source records cannot render as the pilot', () => {
  for (const change of [
    page => {page.events[0].property_class = '400';},
    page => {page.events[0].source_status = 'UNKNOWN';},
    page => {page.events[0].city = 'SYRACUSE';},
    page => {page.batch.source_url = 'javascript:alert(1)';},
  ]) {
    const page = buffaloPage(); change(page);
    assert.throws(() => parseBuffaloSourceReview(page, 0));
  }
});

test('unassigned response has no records and malformed responses never become successful emptiness', () => {
  const unavailable = {version: 'owner-buffalo-source-review-v1', status: 'unavailable'};
  assert.deepEqual(parseBuffaloSourceReview(unavailable, 0), unavailable);
  assert.throws(() => parseBuffaloSourceReview({...unavailable, events: buffaloPage().events}, 0));
  assert.throws(() => parseBuffaloSourceReview({}, 0));
});

test('transport uses bounded read RPC only and sanitizes provider details', async () => {
  let request;
  const client = {rpc: (name, args) => {
    request = {name, args};
    return {abortSignal: async () => ({data: buffaloPage(25), error: null})};
  }};
  await loadBuffaloSourceReview(client, 25, new AbortController().signal);
  assert.deepEqual(request, {name: 'fn_owner_buffalo_source_review_v1', args: {p_limit: 25, p_offset: 25}});
  client.rpc = () => ({abortSignal: async () => ({data: null, error: {code: 'XX000', message: 'private database detail'}})});
  await assert.rejects(() => loadBuffaloSourceReview(client, 0, new AbortController().signal), error => !error.message.includes('private database detail'));
  for (const offset of [-1, 1, 1.5])
    await assert.rejects(() => loadBuffaloSourceReview(client, offset, new AbortController().signal));
});
