import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildCustomerExport, canonicalDigest, CUSTOMER_PROJECT_REF, CustomerDeliveryError, prepareAcceptanceCommit,
  prepareCustomerRelease, REQUIRED_RELEASE_CHECKS, sha256,
} from "../supabase/functions/_shared/customer-delivery-contract.ts";
import type {
  AcceptedRelease, CollectionSnapshot, CustomerExportAuthority, ExportGrant,
  OriginalVerification, PropertyBinding, ReleaseDecision, ReviewedSelection,
} from "../supabase/functions/_shared/customer-delivery-contract.ts";

const id = (number: number) => "00000000-0000-4000-8000-" + number.toString(16).padStart(12, "0");
const NOW = "2026-09-07T23:59:00Z";
const CLOCK = () => NOW;
const encoder = new TextEncoder();
const CUSTOMER = id(100);
const RELEASE = id(101);
const EXPORT_REQUEST = id(102);
const request = (properties = [id(20), id(21)]) => ({ release_id: RELEASE, property_ids: properties, export_request_id: EXPORT_REQUEST });
type CandidateFixture = {
  record_key: string; source_row: number; source_file_sha256: string;
  customer_accepted: boolean; usable_records: boolean; reasons: string[]; warnings: string[];
  canonical: Record<string, string | null>; original: Record<string, string>;
};
async function fixture() {
  const sourceHash = await sha256(encoder.encode("preserved synthetic fixture only"));
  const items: CandidateFixture[] = [];
  for (let i = 0; i < 3; i++) {
    items.push({
      record_key: await canonicalDigest(["synthetic-source", i]), source_row: i + 1,
      source_file_sha256: sourceHash, customer_accepted: false, usable_records: false,
      reasons: [], warnings: ["confidentiality_not_provided"],
      canonical: {
        address: "101 Example Street", unit: i === 2 ? "2" : "1", city: "Example City", state: "NY", zip: "01234",
        case_id: "CASE-01", violation_id: "V-" + i, violation_type: "Exterior maintenance", description: "Peeling paint, second floor.",
        status: "OPEN_SOURCE", normalized_status: "Open", opened_date: "2026-08-01", event_date: "2026-09-01",
        source_record_id: "row-" + i, confidentiality_flag: null, record_type: null,
      },
      original: { private_note: "DO-NOT-EXPORT-PRIVATE-NOTE", mailbox: "private-fixture@example.test", path: "/private/raw.csv" },
    });
  }
  const collection: CollectionSnapshot = {
    customer_project_ref: CUSTOMER_PROJECT_REF,
    delivery_id: id(1), processing_run_id: id(2), jurisdiction_id: id(3), jurisdiction: "Example City", state: "NY",
    record_type: "code_violations", source_name: "Example Municipal Records", public_source_url: "https://records.example.test/code-violations",
    collected_at: "2026-09-07T22:00:00Z", freshness: "fresh_verified", period_start_inclusive: "2026-09-01", period_end_exclusive: "2026-10-01",
    source_file_sha256: sourceHash, candidate_artifact_sha256: "", processor_version: "delivery-stage-v1.1",
    input_rows: 3, candidate_rows: 3, duplicate_rows: 0, held_rows: 0,
  };
  const selected: ReviewedSelection[] = [];
  async function rebuild() {
    const artifact = encoder.encode(items.map(item => JSON.stringify(item)).join("\n") + "\n");
    collection.candidate_artifact_sha256 = await sha256(artifact);
    selected.length = 0;
    for (const item of items) {
      const c = item.canonical;
      const property: PropertyBinding = {
        customer_project_ref: CUSTOMER_PROJECT_REF,
        property_id: c.unit === "1" ? id(20) : id(21), property_revision: "property-revision-1", jurisdiction_id: id(3),
        address: c.address!, unit: c.unit ?? "", city: c.city!, state: c.state!, zip: c.zip ?? "",
      };
      selected.push({ record_key: item.record_key, source_row: item.source_row, canonical_sha256: await canonicalDigest(c), property,
        acknowledged_warnings: [...item.warnings], confidentiality: "cleared_for_customer_distribution" });
    }
    return artifact;
  }
  const artifact = await rebuild();
  return { items, collection, selected, artifact, rebuild };
}
async function releaseFixture() {
  const fixtureData = await fixture();
  const proposal = await prepareCustomerRelease(fixtureData.collection, fixtureData.artifact, fixtureData.selected);
  const decision: ReleaseDecision = {
    decision_id: id(30), reviewer_id: id(31), release_sha256: proposal.sha256, state: "approved",
    reviewed_at: "2026-09-07T23:00:00Z", expires_at: "2026-09-08T23:00:00Z",
    checks: Object.fromEntries(REQUIRED_RELEASE_CHECKS.map(key => [key, true])) as ReleaseDecision["checks"],
  };
  const original: OriginalVerification = {
    delivery_id: fixtureData.collection.delivery_id, source_file_sha256: fixtureData.collection.source_file_sha256,
    storage_kind: "supabase_private", artifact_id: id(32), verified_at: "2026-09-07T22:30:00Z",
  };
  const accepted: AcceptedRelease = { release_id: RELEASE, state: "accepted", committed_at: "2026-09-07T23:30:00Z", decision, proposal };
  return { ...fixtureData, proposal, decision, original, accepted };
}
function authority(accepted: AcceptedRelease) {
  const calls: Parameters<CustomerExportAuthority["reserveExport"]>[0][] = [];
  const grants = new Map<string, { scope: string; grant: ExportGrant }>();
  const server: CustomerExportAuthority = {
    customer_project_ref: CUSTOMER_PROJECT_REF,
    async loadAcceptedRelease(releaseId) { assert.equal(releaseId, accepted.release_id); return accepted; },
    async reserveExport(scope) {
      calls.push(structuredClone(scope));
      // Simulate the required transactional adapter: immutable request scope + quota hold.
      const existing = grants.get(scope.idempotency_key);
      if (existing) {
        if (existing.scope !== scope.scope_sha256) throw new CustomerDeliveryError("export_request_scope_conflict");
        return existing.grant;
      }
      const grant: ExportGrant = {
        grant_id: id(200 + grants.size), customer_id: scope.customer_id, export_request_id: scope.export_request_id,
        release_id: scope.release_id, release_sha256: scope.release_sha256,
        property_ids: scope.property_ids, record_keys: scope.record_keys, record_type: "code_violation", state: "reserved",
        reserved_at: NOW, expires_at: "2026-09-08T00:00:00Z", property_count: scope.property_ids.length, record_count: scope.record_keys.length,
      };
      grants.set(scope.idempotency_key, { scope: scope.scope_sha256, grant });
      return grant;
    },
  };
  return { server, calls, grants };
}
async function denied(action: () => Promise<unknown>, code: string) {
  await assert.rejects(action, error => error instanceof CustomerDeliveryError && error.code === code);
}

test("exact artifact projection preserves distinct violations and units; selection order is deterministic", async () => {
  const f = await fixture();
  const first = await prepareCustomerRelease(f.collection, f.artifact, f.selected);
  const second = await prepareCustomerRelease(f.collection, f.artifact, [...f.selected].reverse());
  assert.deepEqual(second, first);
  assert.equal(first.rows.length, 3);
  assert.equal(new Set(first.rows.map(row => row.case_id)).size, 1);
  assert.equal(new Set(first.rows.map(row => row.violation_id)).size, 3);
  assert.equal(new Set(first.rows.map(row => row.property_id)).size, 2);
  assert.equal(first.rows[0].zip, "01234");
  assert.equal(first.rows[0].source_status, "OPEN_SOURCE");
  assert.equal(first.rows[0].status, "Open");
  assert(!JSON.stringify(first).includes("DO-NOT-EXPORT"));
  assert(!JSON.stringify(first).includes("private-fixture"));
  assert(!JSON.stringify(first).includes("/private/"));
});

test("candidate-byte tampering is rejected before any projected release", async () => {
  const f = await fixture();
  f.artifact[20] ^= 1;
  await denied(() => prepareCustomerRelease(f.collection, f.artifact, f.selected), "artifact_hash_mismatch");
});

test("partial review may select a strict subset but never a held or duplicate input", async () => {
  const f = await fixture();
  f.collection.input_rows = 5; f.collection.held_rows = 1; f.collection.duplicate_rows = 1;
  const partial = await prepareCustomerRelease(f.collection, f.artifact, f.selected.slice(0, 1));
  assert.equal(partial.rows.length, 1);
  f.items[1].reasons = ["exact_duplicate"];
  const bytes = await f.rebuild();
  await denied(() => prepareCustomerRelease(f.collection, bytes, f.selected.slice(0, 1)), "held_or_duplicate_candidate");
});

test("candidate row counts, identities and source hashes reconcile without silently dropping rows", async t => {
  for (const scenario of ["count", "duplicate_key", "duplicate_source_row", "source_hash", "already_accepted"] as const) {
    await t.test(scenario, async () => {
      const f = await fixture();
      if (scenario === "count") f.collection.input_rows = 4;
      if (scenario === "duplicate_key") f.items[1].record_key = f.items[0].record_key;
      if (scenario === "duplicate_source_row") f.items[1].source_row = f.items[0].source_row;
      if (scenario === "source_hash") f.items[1].source_file_sha256 = "f".repeat(64);
      if (scenario === "already_accepted") f.items[1].customer_accepted = true;
      const bytes = await f.rebuild();
      await denied(() => prepareCustomerRelease(f.collection, bytes, f.selected), scenario === "count" ? "unreconciled_rows" : scenario.startsWith("duplicate") ? "duplicate_candidate_identity" : "candidate_provenance_mismatch");
    });
  }
});

test("canonical changes, incomplete warning review and missing status cannot become Open defaults", async t => {
  const edits: [string, (f: Awaited<ReturnType<typeof fixture>>) => void, string][] = [
    ["canonical hash", f => { f.selected[0].canonical_sha256 = "f".repeat(64); }, "canonical_hash_mismatch"],
    ["unreviewed warning", f => { f.selected[0].acknowledged_warnings = []; }, "unreviewed_warnings"],
    ["missing clearance", f => { (f.selected[0] as unknown as Record<string, unknown>).confidentiality = "pending"; }, "confidentiality_review_required"],
  ];
  for (const [name, edit, code] of edits) await t.test(name, async () => {
    const f = await fixture(); edit(f);
    await denied(() => prepareCustomerRelease(f.collection, f.artifact, f.selected), code);
  });
  const f = await fixture(); f.items[0].canonical.normalized_status = null;
  const bytes = await f.rebuild();
  await denied(() => prepareCustomerRelease(f.collection, bytes, f.selected), "invalid_text");
});

test("property binding refuses a different jurisdiction, missing unit or shared ID across units", async t => {
  for (const scenario of ["jurisdiction", "unit", "same_id"] as const) await t.test(scenario, async () => {
    const f = await fixture();
    if (scenario === "jurisdiction") f.selected[0].property.jurisdiction_id = id(999);
    if (scenario === "unit") f.selected[0].property.unit = "";
    if (scenario === "same_id") f.selected[2].property.property_id = f.selected[0].property.property_id;
    await denied(() => prepareCustomerRelease(f.collection, f.artifact, f.selected), scenario === "jurisdiction" ? "property_jurisdiction_mismatch" : scenario === "unit" ? "property_location_mismatch" : "conflicting_property_mapping");
  });
});

test("invalid/out-of-scope dates and unverified acquisition block distribution; historical is explicit", async t => {
  for (const [event, code] of [["2026-02-30", "invalid_date"], ["2026-10-01", "event_outside_period"]]) await t.test(event, async () => {
    const f = await fixture(); f.items[0].canonical.event_date = event;
    const bytes = await f.rebuild();
    await denied(() => prepareCustomerRelease(f.collection, bytes, f.selected), code);
  });
  const f = await fixture(); f.collection.freshness = "receipt_unverified";
  await denied(() => prepareCustomerRelease(f.collection, f.artifact, f.selected), "unverified_acquisition");
  f.collection.freshness = "historical_preserved";
  const proposal = await prepareCustomerRelease(f.collection, f.artifact, f.selected);
  assert(proposal.rows.every(row => row.freshness === "historical_preserved"));
});

test("water and signed/private URL evidence cannot be passed as supported public code records", async t => {
  const f = await fixture(); f.collection.record_type = "water_shutoff";
  await denied(() => prepareCustomerRelease(f.collection, f.artifact, f.selected), "unsupported_record_type_or_processor");
  for (const url of ["http://records.example.test/data", "https://records.example.test/data?token=secret", "https://user:pass@records.example.test/data", "https://127.0.0.1/data"]) {
    await t.test("unsafe URL", async () => {
      const f = await fixture(); f.collection.public_source_url = url;
      await denied(() => prepareCustomerRelease(f.collection, f.artifact, f.selected), "invalid_source_url");
    });
  }
});

test("caller mutations during hashing cannot replace snapshotted candidate bytes or mappings", async () => {
  const f = await fixture();
  const operation = prepareCustomerRelease(f.collection, f.artifact, f.selected);
  f.artifact.fill(0); f.selected[0].property.address = "CHANGED"; f.collection.source_name = "CHANGED";
  const proposal = await operation;
  assert.equal(proposal.rows.length, 3);
  assert(!JSON.stringify(proposal).includes("CHANGED"));
});

test("reviewed hash + durable original produce only a deterministic commit plan, no accepted data", async () => {
  const f = await releaseFixture();
  const plan = await prepareAcceptanceCommit(f.proposal, f.decision, f.original, NOW);
  assert.equal(plan.state, "prepared_for_commit");
  assert.equal(plan.selected_records, 3); assert.equal(plan.selected_properties, 2);
  assert(!("customer_accepted" in plan));
  assert.deepEqual(await prepareAcceptanceCommit(f.proposal, f.decision, f.original, NOW), plan);
  f.proposal.rows[0].description = "changed after review";
  await denied(() => prepareAcceptanceCommit(f.proposal, f.decision, f.original, NOW), "release_hash_mismatch");
});

test("local originals, wrong source proofs and stale verification never satisfy durability", async t => {
  for (const scenario of ["local", "hash", "stale"] as const) await t.test(scenario, async () => {
    const f = await releaseFixture();
    if (scenario === "local") f.original.storage_kind = "local";
    if (scenario === "hash") f.original.source_file_sha256 = "f".repeat(64);
    if (scenario === "stale") f.original.verified_at = "2026-09-01T22:00:00Z";
    await denied(() => prepareAcceptanceCommit(f.proposal, f.decision, f.original, NOW), scenario === "local" ? "durable_original_required" : scenario === "hash" ? "original_provenance_mismatch" : "original_verification_stale");
  });
});

test("pending, revoked, incomplete, expired and wrong-hash approvals cannot commit", async t => {
  for (const scenario of ["pending", "revoked", "incomplete", "expired", "hash"] as const) await t.test(scenario, async () => {
    const f = await releaseFixture();
    if (scenario === "pending" || scenario === "revoked") f.decision.state = scenario;
    if (scenario === "incomplete") f.decision.checks.confidentiality = false;
    if (scenario === "expired") f.decision.expires_at = NOW;
    if (scenario === "hash") f.decision.release_sha256 = "f".repeat(64);
    await denied(() => prepareAcceptanceCommit(f.proposal, f.decision, f.original, NOW), scenario === "incomplete" ? "incomplete_release_review" : scenario === "expired" ? "review_expired_or_future" : "release_not_approved");
  });
});

test("export reserves distinct property credits separately from violation rows and strips private metadata", async () => {
  const f = await releaseFixture(); const auth = authority(f.accepted);
  const result = await buildCustomerExport(CUSTOMER, request([id(20)]), auth.server, CLOCK);
  assert.equal(result.manifest.record_count, 2); assert.equal(result.manifest.property_count, 1);
  assert.equal(auth.calls.length, 1); assert.deepEqual(auth.calls[0].property_ids, [id(20)]);
  assert.equal(auth.calls[0].record_keys.length, 2);
  assert(!result.csv.includes(id(21)));
  assert(!JSON.stringify(result).includes("DO-NOT-EXPORT"));
  assert(!JSON.stringify(result).includes("property-revision"));
  assert(!JSON.stringify(result).includes(f.decision.reviewer_id));
  assert.equal(result.manifest.export_sha256, await sha256(encoder.encode(result.csv)));
});

test("same export request retries once; changed scope conflicts and a new request is separate usage", async () => {
  const f = await releaseFixture(); const auth = authority(f.accepted);
  const first = await buildCustomerExport(CUSTOMER, request([id(20)]), auth.server, CLOCK);
  assert.deepEqual(await buildCustomerExport(CUSTOMER, request([id(20)]), auth.server, CLOCK), first);
  assert.equal(auth.grants.size, 1);
  await denied(() => buildCustomerExport(CUSTOMER, request([id(21)]), auth.server, CLOCK), "export_request_scope_conflict");
  await buildCustomerExport(CUSTOMER, { ...request([id(20)]), export_request_id: id(103) }, auth.server, CLOCK);
  assert.equal(auth.grants.size, 2);
});

test("unaccepted releases, changed rows and properties outside the release never reach entitlement reservation", async t => {
  for (const scenario of ["revoked", "tampered", "foreign_property", "duplicate_property"] as const) await t.test(scenario, async () => {
    const f = await releaseFixture(); const auth = authority(f.accepted);
    if (scenario === "revoked") f.accepted.state = "revoked";
    if (scenario === "tampered") f.proposal.rows[0].zip = "99999";
    const properties = scenario === "foreign_property" ? [id(999)] : scenario === "duplicate_property" ? [id(20), id(20)] : [id(20)];
    await denied(() => buildCustomerExport(CUSTOMER, request(properties), auth.server, CLOCK), scenario === "revoked" ? "release_not_accepted" : scenario === "tampered" ? "release_hash_mismatch" : scenario === "foreign_property" ? "property_not_in_release" : "duplicate_property_selection");
    assert.equal(auth.calls.length, 0);
  });
});

test("authorization denial returns no CSV; wrong customer/subset/count/type/expired grants are rejected", async t => {
  for (const scenario of ["denied", "customer", "subset", "count", "record_type", "expired"] as const) await t.test(scenario, async () => {
    const f = await releaseFixture(); const auth = authority(f.accepted);
    const reserve = auth.server.reserveExport;
    auth.server.reserveExport = async scope => {
      if (scenario === "denied") throw new CustomerDeliveryError("subscription_required");
      const grant = structuredClone(await reserve(scope));
      if (scenario === "customer") grant.customer_id = id(999);
      if (scenario === "subset") grant.record_keys = [];
      if (scenario === "count") grant.property_count = 500;
      if (scenario === "record_type") (grant as unknown as Record<string, unknown>).record_type = "water_shutoff";
      if (scenario === "expired") grant.expires_at = NOW;
      return grant;
    };
    await denied(() => buildCustomerExport(CUSTOMER, request(), auth.server, CLOCK), scenario === "denied" ? "subscription_required" : scenario === "subset" ? "export_grant_scope_mismatch" : scenario === "count" ? "export_grant_count_mismatch" : scenario === "expired" ? "export_grant_expired_or_future" : "invalid_export_grant");
  });
});

test("review/grant expiration during reservation is checked again after the await", async () => {
  const f = await releaseFixture(); const auth = authority(f.accepted);
  let clock = NOW;
  const reserve = auth.server.reserveExport;
  auth.server.reserveExport = async scope => { const result = await reserve(scope); clock = "2026-09-08T00:01:00Z"; return result; };
  await denied(() => buildCustomerExport(CUSTOMER, request(), auth.server, () => clock), "export_grant_expired_or_future");
});

test("destination binding rejects worker-property mappings, wrong release destinations and wrong export adapters", async t => {
  for (const scenario of ["mapping", "release", "authority"] as const) await t.test(scenario, async () => {
    const worker = "dqwolscmceelqpkfclgi";
    if (scenario === "authority") {
      const f = await releaseFixture(); const auth = authority(f.accepted);
      (auth.server as unknown as Record<string, unknown>).customer_project_ref = worker;
      await denied(() => buildCustomerExport(CUSTOMER, request(), auth.server, CLOCK), "wrong_customer_destination");
      assert.equal(auth.calls.length, 0);
    } else {
      const f = await fixture();
      const target = scenario === "mapping" ? f.selected[0].property : f.collection;
      (target as unknown as Record<string, unknown>).customer_project_ref = worker;
      await denied(() => prepareCustomerRelease(f.collection, f.artifact, f.selected), "wrong_customer_destination");
    }
  });
});

test("review expiration during export quota reservation fails even if its returned grant is current", async () => {
  const f = await releaseFixture(); const auth = authority(f.accepted);
  f.decision.expires_at = "2026-09-08T00:00:00Z";
  let clock = NOW;
  const reserve = auth.server.reserveExport;
  auth.server.reserveExport = async scope => {
    const grant = await reserve(scope);
    clock = "2026-09-08T00:01:00Z";
    return { ...grant, expires_at: "2026-09-08T00:05:00Z" };
  };
  await denied(() => buildCustomerExport(CUSTOMER, request(), auth.server, () => clock), "review_expired_or_future");
});

test("invalid UTF-8 and unsafely large artifacts are rejected without partial projection", async () => {
  const f = await fixture();
  const bytes = new Uint8Array([0xff]);
  f.collection.candidate_artifact_sha256 = await sha256(bytes);
  await denied(() => prepareCustomerRelease(f.collection, bytes, f.selected), "invalid_artifact_encoding");
  await denied(() => prepareCustomerRelease(f.collection, new Uint8Array(32 * 1024 * 1024 + 1), f.selected), "artifact_size_limit");
});

test("CSV quotes multiline descriptions and neutralizes padded spreadsheet formulas", async () => {
  const f = await fixture();
  f.items[0].canonical.description = '  =HYPERLINK("https://example.test","x")\nmore';
  const bytes = await f.rebuild();
  const proposal = await prepareCustomerRelease(f.collection, bytes, f.selected);
  const base = await releaseFixture();
  base.accepted.proposal = proposal; base.accepted.decision.release_sha256 = proposal.sha256;
  const result = await buildCustomerExport(CUSTOMER, request(), authority(base.accepted).server, CLOCK);
  assert(result.csv.includes('"\'  =HYPERLINK(""https://example.test"",""x"")\nmore"'));
  assert(result.csv.includes('"01234"'));
});

test("no existing customer caller or deployed endpoint imports the new contract", async () => {
  for (const file of ["../src/services/export.ts", "../src/services/upload.ts", "../supabase/functions/export-csv/index.ts"]) {
    const source = await readFile(new URL(file, import.meta.url), "utf8");
    assert(!source.includes("customer-delivery-contract"));
  }
});
