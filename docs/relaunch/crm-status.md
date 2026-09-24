# Private CRM implementation status — 2026-09-24

Candidate code on `codex/snap-relaunch-hardening-20260924`. No production migration, provider send, paid enrichment, Lovable prompt, or deployment performed by this work.

## Implemented

- **Private workspace scope:** CRM query keys include the signed-in user. Reads and mutations verify current identity before requests and discard responses after an account change. SMS/sequence/evidence caches include identity; root's auth-boundary work clears queries on identity transitions. Server authorization is supplied independently by the tenancy migration.
- **Property handoff:** `fn_crm_add_property_v1` requires a private workspace, current ordinary-property visibility and the caller's existing unlock. Checked source properties retain their dedicated reviewed handoff. Per-workspace/property locking and the existing unique key make retries return the same record. Archived leads restore with the same ID, stage, notes and contacts. No unlock, release or purchase is performed by this RPC. Mobile detail exposes the same action as desktop.
- **Daily work:** pipeline cards have a private label and next action. Today, Overdue, All active, Archived views use the device timezone, refreshed each minute. Stage dropdown supports touch/keyboard; optional desktop dragging remains. Missing data and failed requests have distinct states.
- **Private lead editor:** label, priority, next action/time, estimated value, repairs estimate, offer and contract deadline. Amounts require nonnegative finite values with at most two decimals. No automated valuation or profitability promise. Named action/date pairs are enforced in SQL. Existing legacy dates receive the neutral label “Review saved follow-up,” preserving their due date. Concurrent changes require explicit reload of latest saved values rather than silently overwriting them.
- **Manual outcome:** one atomic RPC records the outcome, completed action and replacement action (or explicit no follow-up). Outcomes do not send communications. Only `reached_owner` advances last-contacted time. Same request UUID + exact command is idempotent; changed commands and stale versions fail. The UI retains an uncertain attempt for retry. Do-not-contact persists at the lead and existing/future private-contact relationships; ordinary edits cannot clear it. Full activity notes remain while the restriction summary is bounded to 1,000 characters.
- **Contacts:** multiple user-entered private relationships per opportunity (owner/buyer/agent/other), name/phone/email, provenance and restriction notes. These do not copy the shared enrichment tables or claim permission to contact. Workspace/lead composite FK and RLS prevent cross-tenant attachment. Relationship IDs cannot be reassigned.
- **Source evidence:** an account-checked source identity lookup selects the reviewed evidence RPC exclusively for source properties. A denied/expired source read has an explicit unavailable state with private work preserved. No raw-property fallback, source release or export permission relaxation. Ordinary accessible properties use the existing RLS-protected read; canonical deep link uses `propertyId`.
- **History:** notes, manual outcomes, system annotations and stage changes render useful text; load errors are distinct from an empty history. Sequence enrollment is absent from the core lead workflow; provider holds remain.
- **Portability:** private lead-summary CSV escapes spreadsheet formulas. Account JSON export uses the caller's JWT for every query, includes private leads/contacts/manual history/stages, paginates beyond 1,000, and fails explicitly on incomplete categories/oversized exports. Source evidence receipts and automatic evidence events are excluded and retain their separate release contract.

## Verification

`node --test tests/crm-workflow.test.mjs` exercises the actual CRM migration and PostgreSQL RLS/FK/trigger/RPC behavior in PGlite. It covers create/retry, archive/restore preservation, stage persistence/history, invalid input rollback, atomic outcome idempotency, stale requests, successful-contact semantics, long DNC note handling, suppression preservation, two-account denial, anonymous denial, complete export pagination/source exclusion/error handling, and legacy due-date migration.

The tenancy helper loads relevant real repository migrations and uses labeled test doubles for Supabase-managed auth and source acceptance validation. It is not a deployed Supabase or multi-connection concurrency certification. A single embedded PostgreSQL connection cannot certify contention between independent database connections; the transaction lock and unique constraint require the staging concurrency test below.

Application type check and focused lint for the new CRM service/model/hooks/editors/pages and export files pass. Existing broader legacy lint findings are not represented as repaired here.

## Still required before release

1. Apply tenancy then CRM migrations to an approved staging database; regenerate client schema types and run native advisors. No staging credentials/instance was provisioned here.
2. With two isolated users, run signed-in desktop/mobile flows, account-switch race, keyboard stage change, reschedule, archive/restore, error recovery, refresh persistence and account export in the supported browser. No current authenticated browser journey is claimed passed.
3. Run simultaneous create requests from independent DB sessions and lost-response retry after page reload. Current outcome retry survives component lifetime; a page reload requires checking saved activity history before submitting a new outcome. Persistent recovery receipts across browser reload are not implemented.
4. Validate the actual reviewed source-detail contract against accepted, held, expired and revoked staging receipts. Existing source holds remain prerequisites; this workflow cannot make an unapproved market available.
5. Verify full account export against deployed schemas and relevant historical categories. This implementation fails closed on a category error rather than delivering a misleading partial archive.

## Scope retained for later decisions

This is a complete small **single-owner manual workflow** in code, not a team CRM. Contacts are private per-opportunity relationships, not a deduplicated global person directory. No VA assignment system, inbound CRM CSV import, dialer disposition import, automated SMS/email sequences, integrated calling, external enrichment, or offer-calculation engine was added. Those broader audited candidates require their own product/provider/cost decisions.

Migration: `supabase/migrations/20260924183021_snap_crm_workflow_v1.sql`; must follow `20260924182954_snap_customer_workspace_isolation_v1.sql`.
