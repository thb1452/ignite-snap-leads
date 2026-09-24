import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { parseReceiptCaseDetail, RECEIPT_CASE_LIMITATIONS } from '../src/services/receiptCaseContract.ts';

const hash = value => createHash('sha256').update(value).digest('hex');
const id = n => `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function bindHashes(row) {
  row.cleaned_sha256 = hash(JSON.stringify(row.cleaned_description));
  row.record_key = hash(JSON.stringify([row.citation.agency_key, 'case', row.case_id]));
  row.version_id = hash(row.record_key + row.citation.original_sha256 + row.citation.source_row_sha256 + row.cleaning_rule_version);
  return row;
}

function fixture() {
  return {
    version: 'receipt-case-crm-detail-v1', lead_id: id(1),
    property: {id: id(2), address: '1 Synthetic Lane', city: 'Fixture City', state: 'ZZ'},
    snapshot: {
      snapshot_id: id(3), acceptance_id: id(8), valid_until: '2024-04-01T12:30:00Z',
      evidence_kind: 'synthetic', report_date: '2024-03-01', received_at: '2024-03-02T12:30:00.123456+00:00',
      original_count: 3, reviewed_count: 2, held_count: 1,
      coverage: 'reviewed_subset', freshness: 'dated_snapshot', cadence: 'unverified',
    },
    cases: [1, 2].map(n => bindHashes({
      record_kind: 'case', record_key: '', version_id: '', case_id: `SYNTHETIC-${n}`,
      category: 'FIXTURE CATEGORY', status: n === 1 ? 'FIXTURE OPEN' : '',
      filed_date: '2024-02-29', closed_date: n === 1 ? null : '2024-03-01',
      cleaned_description: `Synthetic case ${n}: "quoted" evidence — no actual property facts.`,
      cleaned_sha256: '', cleaning_rule_version: 'synthetic-cleaning-v1',
      citation: {
        agency_key: 'synthetic:agency', request_id: id(4), receipt_id: id(5), source_job_id: id(6),
        archive_id: id(7), archive_manifest_sha256: hash('synthetic archive manifest'),
        original_sha256: hash('synthetic original'), source_row_sha256: hash(`synthetic row ${n}`),
        source_rows: [n * 2 + 2, n * 2 + 3], report_date: '2024-03-01',
      },
    })),
    limitations: [...RECEIPT_CASE_LIMITATIONS],
  };
}

const rejects = async mutate => {
  const value = fixture();
  mutate(value);
  await assert.rejects(parseReceiptCaseDetail(value), /could not be verified/);
};

test('accepts a synthetic dated case subset and preserves facts without adding authorization', async () => {
  const input = fixture();
  const result = await parseReceiptCaseDetail(input);
  assert.deepEqual(result, input);
  assert.notEqual(result, input);
  assert.equal(result.cases[1].status, '');
  assert.equal(result.cases[0].closed_date, null);
  assert.equal(Object.hasOwn(result, 'authorized'), false);
  assert.equal(Object.hasOwn(result, 'accepted'), false);
});

test('rejects unknown keys at every object boundary, including private or authority fields', async t => {
  for (const [label, mutate] of [
    ['root', value => { value.authorized = true; }],
    ['property', value => { value.property.owner_email = 'synthetic@example.invalid'; }],
    ['snapshot', value => { value.snapshot.customer_accepted = true; }],
    ['case', value => { value.cases[0].government_violation_id = 'invented'; }],
    ['citation', value => { value.cases[0].citation.original_text = 'private original'; }],
  ]) await t.test(label, () => rejects(mutate));
});

test('rejects invalid or missing identity, shape and fixed snapshot semantics', async t => {
  for (const [label, mutate] of [
    ['UUID', value => { value.lead_id = 'not-a-uuid'; }],
    ['hash', value => { value.cases[0].citation.archive_manifest_sha256 = 'x'.repeat(64); }],
    ['missing field', value => { delete value.cases[0].closed_date; }],
    ['blank address', value => { value.property.address = '  '; }],
    ['record kind', value => { value.cases[0].record_kind = 'violation'; }],
    ['evidence kind', value => { value.snapshot.evidence_kind = 'government_verified'; }],
    ['missing evidence kind', value => { delete value.snapshot.evidence_kind; }],
    ['invalid acceptance identity', value => { value.snapshot.acceptance_id = 'not-a-uuid'; }],
    ['missing acceptance identity', value => { delete value.snapshot.acceptance_id; }],
    ['missing acceptance deadline', value => { delete value.snapshot.valid_until; }],
    ['coverage', value => { value.snapshot.coverage = 'complete'; }],
    ['freshness', value => { value.snapshot.freshness = 'current'; }],
    ['cadence', value => { value.snapshot.cadence = 'daily'; }],
  ]) await t.test(label, () => rejects(mutate));
});

test('requires real calendar dates, chronological case dates and an ISO timestamp', async t => {
  for (const [label, mutate] of [
    ['non-leap day', value => { value.cases[0].filed_date = '2023-02-29'; }],
    ['invalid report date', value => { value.snapshot.report_date = '2024-02-30'; }],
    ['filed after report', value => { value.cases[0].filed_date = '2024-03-02'; }],
    ['closed before filed', value => { value.cases[0].closed_date = '2024-02-28'; }],
    ['closed after report', value => { value.cases[0].closed_date = '2024-03-02'; }],
    ['impossible closed date', value => { value.cases[0].closed_date = '2024-02-30'; }],
    ['timestamp date rollover', value => { value.snapshot.received_at = '2024-02-30T12:00:00Z'; }],
    ['timestamp hour rollover', value => { value.snapshot.received_at = '2024-03-02T24:00:00Z'; }],
    ['timestamp zone absent', value => { value.snapshot.received_at = '2024-03-02T12:00:00'; }],
    ['timestamp natural language', value => { value.snapshot.received_at = 'March 2, 2024'; }],
    ['acceptance deadline calendar rollover', value => { value.snapshot.valid_until = '2024-02-30T12:30:00Z'; }],
    ['acceptance deadline zone absent', value => { value.snapshot.valid_until = '2024-04-01T12:30:00'; }],
    ['acceptance deadline natural language', value => { value.snapshot.valid_until = 'tomorrow'; }],
  ]) await t.test(label, () => rejects(mutate));
});

test('acceptance deadline is structural data and does not infer current authorization', async () => {
  for (const validUntil of ['2000-01-01T00:00:00Z', '2099-01-01T00:00:00+00:00']) {
    const value = fixture();
    value.snapshot.valid_until = validUntil;
    const result = await parseReceiptCaseDetail(value);
    assert.equal(result.snapshot.valid_until, validUntil);
    assert.equal(Object.hasOwn(result.snapshot, 'authorized'), false);
  }
});

test('enforces exact count reconciliation and a nonempty bounded detail subset', async t => {
  for (const [label, mutate] of [
    ['sum mismatch', value => { value.snapshot.original_count = 4; }],
    ['negative held', value => { value.snapshot.held_count = -1; }],
    ['fractional count', value => { value.snapshot.reviewed_count = 1.5; }],
    ['unsafe integer', value => { value.snapshot.original_count = Number.MAX_SAFE_INTEGER + 1; }],
    ['zero original', value => { value.snapshot.original_count = 0; }],
    ['detail exceeds reviewed', value => { value.snapshot.reviewed_count = 1; value.snapshot.held_count = 2; }],
    ['empty cases', value => { value.cases = []; }],
    ['too many cases', value => { value.cases = Array(1001).fill(value.cases[0]); }],
  ]) await t.test(label, () => rejects(mutate));
  const subset = fixture();
  subset.cases.pop();
  assert.equal((await parseReceiptCaseDetail(subset)).cases.length, 1);
});

test('rejects duplicate case and version identities', async t => {
  await t.test('duplicate record key with a distinct version', () => rejects(value => {
    value.cases[1].case_id = value.cases[0].case_id;
    bindHashes(value.cases[1]);
  }));
  await t.test('duplicate version ID', () => rejects(value => { value.cases[1].version_id = value.cases[0].version_id; }));
});

test('requires every case citation to identify the same snapshot evidence', async t => {
  for (const key of ['agency_key', 'request_id', 'receipt_id', 'source_job_id', 'archive_id', 'archive_manifest_sha256', 'original_sha256', 'report_date']) {
    await t.test(key, () => rejects(value => {
      const row = value.cases[1];
      row.citation[key] = key === 'agency_key' ? 'synthetic:other-agency' : key === 'report_date' ? '2024-02-29' : key.endsWith('sha256') ? hash('different synthetic evidence') : id(99);
      bindHashes(row);
    }));
  }
  await t.test('all citations disagree with snapshot report date', () => rejects(value => {
    for (const row of value.cases) row.citation.report_date = '2024-02-29';
  }));
});

test('requires exactly two positive ordered source row numbers', async t => {
  for (const rows of [[4], [4, 5, 6], [0, 1], [4, 4], [5, 4], [4.5, 5]]) {
    await t.test(JSON.stringify(rows), () => rejects(value => { value.cases[0].citation.source_rows = rows; }));
  }
});

test('independently verifies description, record identity and version hashes', async t => {
  for (const [label, mutate] of [
    ['changed description', value => { value.cases[0].cleaned_description += ' altered'; }],
    ['raw description hash instead of JSON string hash', value => { value.cases[0].cleaned_sha256 = hash(value.cases[0].cleaned_description); }],
    ['changed case identity', value => { value.cases[0].case_id += '-changed'; }],
    ['wrong record key', value => { value.cases[0].record_key = hash('wrong synthetic key'); }],
    ['changed row hash', value => { value.cases[0].citation.source_row_sha256 = hash('changed synthetic row'); }],
    ['changed cleaning rule', value => { value.cases[0].cleaning_rule_version = 'synthetic-cleaning-v2'; }],
    ['wrong version hash', value => { value.cases[0].version_id = hash('wrong synthetic version'); }],
  ]) await t.test(label, () => rejects(mutate));
});

test('requires all explicit case, subset and cadence limitations', async t => {
  for (const limitation of RECEIPT_CASE_LIMITATIONS) {
    await t.test(limitation, () => rejects(value => {
      value.limitations = value.limitations.filter(text => text !== limitation);
      value.limitations.push('A different synthetic caveat.');
    }));
  }
  const value = fixture();
  value.limitations.push('Additional synthetic source limitation.');
  assert.equal((await parseReceiptCaseDetail(value)).limitations.length, 4);
});

test('rejects non-object and malformed inputs', async () => {
  for (const value of [null, undefined, [], 'receipt', {}, 1]) {
    await assert.rejects(parseReceiptCaseDetail(value), /could not be verified/);
  }
});
