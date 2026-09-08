# Owner collection readiness

The owner dashboard now includes a read-only collection-readiness section in Overview, Collection and Your decisions. It separates request controls, policy approval, state assignment, agency-history review and provider capacity from incoming-mail monitoring. No overall ready score, send/start control, approval action or publication action is added.

The change was prepared against PR #172 head `57e973bd96e53ddb2a55e8824683452d0fdb56da`. Existing owner access and customer authentication are unchanged. The required private runtime tables come from the separate `collection-core/runtime-schema.sql` migration; this UI does not create or populate them. Backend deployment remains held until that schema is confirmed installed.

## Fixed metadata feeds

All reads happen after the existing Auth verification and server-owned owner allowlist check. Access-only requests still return before any operational feed is read. GET/OPTIONS methods, origins, gateway JWT verification and server credential handling are unchanged.

| Feed | Scope |
|---|---|
| `acquisitionControls` | Only `atlas_live_enabled`, `foia_paused`, `blocked_states` from `ops_control`; maximum three rows. Values are projected into known booleans or two-letter state-code arrays before response. Missing, malformed or duplicate keys become unknown; arbitrary control JSON is never returned. |
| `acquisitionPolicy` | Singleton policy revision, approval flag and global pause. No policy body, approver identity or evidence reference. |
| `acquisitionAssignments` | Up to 100 state/outlet IDs, revision, approval and effective dates. No credentials or reviewer/evidence data. |
| `acquisitionHistory` | Latest 100 review revisions, completeness flags and review/expiry times. No agency request history, raw resolutions, inventory hashes or reviewer identities. |
| `acquisitionHealth` | Latest 100 observation kinds, times and availability flags. No source endpoints, mailbox binding objects, subject keys or evidence content. |
| `acquisitionCapacity` | Singleton revision, observation/window times, UTC day and recorded submission/outbound capacities. No mailbox-specific capacity JSON or provider-reconciliation payload. |
| `publicDownloadHealth` | Only the `harvester_syracuse` worker's name, version, success time, error code and scalar result status. Its complete result remains private. |

The existing incoming worker feed still refers only to `hermes-intake`. Public-download history has its own panel in Collection and Agents. An absent Harvester row says no run is recorded; it does not claim a timer or worker is active.

## Interpretation

- New submissions and the FOIA lane show the exact known control state. An enabled switch is labeled as requiring request checks. Unknown never defaults to enabled or unpaused.
- A policy approval flag is displayed as recorded approval only. This metadata view does not validate the policy body or authorize a request.
- State coverage stays collapsed. The 50-state/DC reference list does not select jurisdictions for work. A state is labeled unassigned only when the assignment feed is complete. Missing/truncated feeds use unknown. Unapproved, future and expired assignments remain distinct; blocked-state flags remain visible alongside them.
- History reviews marked complete within their time window are described as recorded review metadata. The inventory may have changed; the runtime resolver still must compare its exact current agency and legacy history. An incomplete feed never proves other reviews are absent.
- Provider figures are the recorded snapshot before live ledger reservations. Expired/out-of-date windows are explicit. The dashboard does not infer an available-to-send allowance or certify provider reconciliation.
- Source, portal and outbound-email observations are separate. “Available at check” is not current request readiness; exact source/account binding and freshness remain runtime checks. Missing observation types are unknown when the feed is incomplete.
- Incoming-message review can show a recent success while new requests remain disabled. Public-download staging does not mark records accepted for customers or publish a story.

## Validation

- 17 owner API tests pass, including fixed runtime metadata, bounded GET reads, scalar control sanitization, unavailable runtime tables, separate worker lookups and owner/access-only protection.
- 18 browser tests pass on an isolated 4186 server with synthetic intercepted responses. They cover existing owner navigation and authorization, missing/unapproved/expired/incomplete readiness evidence, blocked states, collapsed coverage, incoming-vs-submission separation and the 390px layout.
- App and handler/test TypeScript checks, scoped lint, production build and whitespace checks pass. The small-screen readiness screenshot was visually inspected with no horizontal overflow.

These tests do not submit a request, change an approval, inspect private request bodies, establish a live provider allowance or certify that the Harvester is scheduled. Runtime schema installation, function deployment and the signed-in live 4173 view require separate verification.
