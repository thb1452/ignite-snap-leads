# Customer isolation and CRM preservation — implementation status

Candidate date: 2026-09-24. Branch: `codex/snap-relaunch-hardening-20260924`.

**Implemented and tested locally; not deployed or backfilled in production.** No customer records, source acceptances, provider requests, roles, or live organizations were changed during this work.

## What changed

- **B15 — New signup:** every new account receives a distinct personal organization, seven default pipeline stages through the existing organization trigger, and an ownership record in the private `snap_security` schema. User-editable signup metadata supplies only a display name. It cannot choose a role or organization. Existing user-credit behavior is preserved; workspace credits start at zero.
- **B15 — Authority:** `snap_security.can_access_workspace(org_id)` requires a current account, its profile, and its server-created workspace ownership record to agree. Anonymous, banned, or deleted accounts fail the check. Client changes to profile identity are rejected. Browser roles cannot read or write ownership records. Clients may rename their own organization but cannot change its credits. Integration credential pointers and spend counters are writable only through service-owned APIs. Global suppression entries remain available to service enforcement while raw customer queries see only workspace opt-outs.
- **B15 — Existing shared workspace:** no mass profile or data reassignment occurs in the migration. Restrictive policies stop ordinary legacy customers and internal VAs from reading or writing the shared customer CRM/provider tables. An internal admin whose profile still belongs to the legacy organization retains that operational workspace. The FOIA tables, assignments, user roles, and source-intake policies remain unchanged. Administrators do not receive an automatic blanket permission to customer private workspaces.
- **B15 — Backfill:** a service-only read-only report identifies clean eligible accounts, already-provisioned accounts, internal staff, and accounts with ownership-bearing rows requiring review. A service-only per-account provisioning function requires a review reference, locks relevant relations, checks eligibility again, creates a workspace/receipt, and updates only that user's profile. Repeating it returns the same organization. It never moves or deletes existing business rows.
- **Related CRM graph controls:** composite foreign keys prevent a lead, contact owner, activity, SMS message/thread, or enrollment from referencing a different workspace. Guards verify the activity actor, assigned account, integration owner, tag ownership, contact creator, and lead-property/contact relationship. Lead identity cannot be rewritten. Direct authenticated lead insertion also requires visible property evidence and an existing caller-owned unlock.
- **B07:** owner results are unique by `(org_id, property_id, source)`. The matching skip-trace writer uses that conflict key. Two customers tracing the same property/provider no longer overwrite the same row. No prior provider receipt is deleted during this change.
- **B08:** lead, owner, legacy activity, saved-list link, and purchased-unlock references to a property now use `ON DELETE RESTRICT`. Deleting a property with CRM/contact references fails atomically instead of deleting private work. This does not implement a new property merge or tombstone workflow; cleanup must preserve canonical IDs until that workflow is reviewed.
- **C14:** the account that owns an existing reviewed-source CRM lead keeps its private lead, notes, and follow-up fields after source acceptance expiry/revocation. Current source evidence, source exports, and the linked source receipt annotation still require valid source authorization. Existing property fences, immutable source identities, and source-detail functions remain in place.

## Files

- `supabase/migrations/20260924182954_snap_customer_workspace_isolation_v1.sql`
- `supabase/functions/integration-skip-trace/index.ts` (workspace conflict key; provider hold separately owned by the security change)
- `tests/helpers/tenancy-db.mjs`
- `tests/tenancy.test.mjs`

Native read-only checks on 2026-09-24 confirmed the five affected property foreign-key names and their existing cascade behavior. They also confirmed `public.contacts` is absent and `public.property_contacts` exists; the candidate does not reference the removed legacy table or alter the held property-contact model. The signup function's audited native MD5 is enforced as a migration precondition (`34dad4058056a2f20f88e4577caf5903`).

The migration filename was created with the discovered Supabase CLI (`supabase@2.117.0 migration new`), rather than fabricated. It runs in one transaction. Inconsistent existing related rows or missing baseline objects abort deployment; it does not silently repair or delete them.

## Verification

Run from the repository root:

```sh
node --test tests/tenancy.test.mjs
```

Seventeen adversarial scenarios (18 Node test results including the parent suite) pass in isolated PostgreSQL via pinned `@electric-sql/pglite@0.5.8`:

1. Independent signups, seeded stages, malicious org/role metadata.
2. Anonymous role, null caller, anonymous authenticated account.
3. Shared legacy customer/VA denial, internal admin/FOIA preservation, and privileged handoff rejection for an unready customer workspace.
4. Registry/profile identity/self-role mutation attempts.
5. Backfill preflight eligibility and ownership conflicts.
6. Atomic, idempotent per-user provisioning without legacy data movement.
7. Two-account lead, note, contact, stage, and provider-account read isolation.
8. Guessed foreign IDs, cross-account update/assignment, actor spoofing, and service-writer FK enforcement.
9. Direct lead insertion while property visibility or unlock requirements fail.
10. Same-property/provider upserts preserve both customers' results.
11. Property hard delete fails without changing either lead or history.
12. Legacy note/list/unlock deletion preservation.
13. Tag, SMS, and enrollment cross-workspace references fail.
14. Source expiry and revocation preserve private notes while hiding source details/receipt annotations; source identity remains immutable.
15. Privileged helper ACLs and organization-credit mutation denial.
16. Global suppression privacy with service enforcement visibility.
17. Ban/deletion revokes workspace access on the next query.

The foundation organization/CRM/provider/SMS DDL and policies are loaded from repository migrations. PostgreSQL itself executes candidate RLS, triggers, foreign keys, privilege checks, and transactions. Supabase-managed auth functions and the source-acceptance lineage validator have explicitly labeled fixture implementations. This proves database behavior for these fixtures; it is not a replacement for full hosted auth, PostgREST, realtime, or production source-lineage tests. PGlite is single-connection; cross-session race/load tests remain a staging gate.

## Deployment and backfill gates

1. Verify deployed signup/schema/policies still match the audited project. Export a restorable database backup and inventory all rows/constraints affected by the change. Run database advisors against the actual staging project. No local Supabase Docker stack or hosted advisor run was available during this isolated implementation.
2. Apply this migration **before** the CRM workflow migration (`20260924183021_snap_crm_workflow_v1.sql`). Keep source, unlock, export, and provider holds enabled. Deploy the matching provider conflict-key change before reopening any provider route.
3. With a service-role session, run `SELECT * FROM public.fn_workspace_backfill_report_v1();`. Save the report privately. For each existing account, review staff roles and the report; inspect any historical unassigned/shared business rows separately. A clean report means no attributable rows were found, not proof that every historical unowned row has a known owner.
4. For a reviewed eligible ordinary customer, call `SELECT public.fn_provision_customer_workspace_v1(<user uuid>, <review reference>);` using bound parameters. This is an authorized **production write only after deployment approval**. Do not run a blanket loop over all profiles. Accounts with old lead/contact/integration/source ownership require an explicit reviewed migration mapping; the function has no force option.
5. Refresh the account session and confirm its workspace, stages, retained user-scoped saved items, and empty private CRM. Verify two independent customers, a restricted VA, and the internal admin using actual authenticated REST requests. Check that a forged profile org, foreign stage/contact/lead, and direct unauthorized RPC remain denied.
6. Exercise valid reviewed-source detail/handoff with real staging receipts, expire/revoke the source authorization, and compare private lead/note IDs and content. Live source evidence must disappear while private work remains accessible only to its owner.
7. Capture post-deploy/backfill counts and receipts, and document any accounts still quarantined. Do not reopen customer billing or acquisition while expected customers remain unresolved or these gates fail.

This release intentionally supports one customer per private workspace. Team invitations or delegating customer CRM access to a VA need a separate server-verified membership flow. The old browser-driven invitation role write is not an acceptable membership mechanism.

## Rollback boundary

Before the migration commits, any error rolls back all of it. After a successful deployment, preserve ownership receipts and created organizations. Do not restore shared-org customer permissions as a convenience rollback: that recreates the audited privacy defect. A repair should keep restrictive fences enabled and address the failed dependency. Already-provisioned customer organizations must never be reassigned into the shared org merely to restore old application behavior.
