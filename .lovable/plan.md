# Read-Only Deployed-Evidence Audit — Eight Functions

No changes were made. Nothing was invoked, deployed, published or started. No function received any HTTP request, including OPTIONS. No provider or AI call was made. This document is findings only; it proposes no work.

## 1. Backend identity (from project metadata)

- Backend: Lovable Cloud managed instance, single Live environment.
- Linked project reference: `ojyxblegxpdgaqiscxpz` (organization `wpczgwxsriezaubncuom`), not paused.
- Session tools are bound to that Live reference; no separate Test environment exists.

## 2. Deployed metadata availability

The read-only tooling available in this session exposes **no** deployed-function registry: no deployment/version identifier, no deployed/updated UTC timestamp, no per-function status, no platform JWT flag as actually applied, and no deployed artifact hash or body. Every per-function attribute below is therefore **SOURCE ONLY** — repository text and `supabase/config.toml` intent — and must not be read as evidence that any of it is what is running.

| Function | Deployed version | Deployed UTC time | Status | JWT (deployed) | Deployed hash | Repo source bytes / sha256 (first 16) | config.toml `verify_jwt` (source intent) |
|---|---|---|---|---|---|---|---|
| scheduled-rescore | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 5881 / a40bc5632875c04d | absent (no entry) |
| backfill-scores | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 7279 / 0488a78af4b1c38c | false |
| job-monitor | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 6243 / 434556d4c2c13972 | true |
| bulk-regenerate-briefs | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 26673 / 96bdadca3e2961d0 | absent (no entry) |
| ai-search | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 7011 / b462346c94d111ef | false |
| generate-city-summaries | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 8987 / 730d7be6af20ad58 | false |
| generate-investor-brief | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 14167 / a72325be79678764 | true |
| fix-insight-labels | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | 1755 / af8fc842f6cdaa08 | absent (no entry) |

Note on absent entries: where `config.toml` has no `[functions.<name>]` block, the platform default applies at deploy time; the effective deployed setting is still UNKNOWN from read-only data. Hashes above are of `index.ts` only and exclude shared modules, so they are not whole-artifact fingerprints.

## 3. Existing edge logs

- Window requested: last 48 hours. The log reader returns a recent-events slice without an exposed window boundary, so actual coverage depth and retention are UNKNOWN.
- Result for all eight functions: **no log records returned** — zero boot/start entries and zero invocation entries.
- Because nothing was returned, there are no sanitized observations to report (fewer than the three permitted).
- Separation of runtime boot/start versus invocation evidence is not applicable: neither category appeared.
- Coverage caveat carried forward as instructed: absence of returned logs is **not** proof of no calls, no acceptance of anonymous traffic, no mutation, no provider call, and no exploitation. It only means this reader surfaced no records in its slice. Logs elsewhere in the platform's retention were not accessible here.
- For contrast, logs did surface in this session for other functions (`distress-event-fanout`, `drip-runner`, `snap-mcp-proxy`, `snap-mcp-keepwarm`), and those entries were boot/shutdown lifecycle messages only — no invocation, status-code, auth-outcome, mutation or provider fields. That indicates the reader's available fields cannot establish invocation outcomes even when records exist.

## 4. Confirmation table (all eight functions)

| Question | Verdict | Basis |
|---|---|---|
| Deployed version identifier | UNKNOWN | No deployment registry read available |
| JWT verification setting as deployed | NOT CONFIRMED | Only `config.toml` source intent is visible |
| Observed anonymous / ordinary-user acceptance | UNKNOWN | No invocation records; log fields carry no auth outcome |
| Privileged mutation evidence | UNKNOWN | No invocation or mutation fields returned |
| Provider / AI / geocoding call evidence | UNKNOWN | No downstream-call fields returned |

## 5. Missing visibility and repo-to-deployed linkage

The read-only record **cannot** connect the repository version to the deployed version for any of the eight functions. Doing so would require deployed-artifact metadata — a version or deployment ID, a deployed timestamp, and a deployed body or hash — none of which this session's supported read-only tools expose. Log reads provide lifecycle strings only, with no version stamp, request status, caller role or downstream-call attribution, so they cannot substitute.

To close that gap without any write action or probing, a read-only Management API grant for function metadata (version, `updated_at`, status, `verify_jwt`, artifact hash) plus an invocation-level log view carrying status code, auth outcome and downstream-call category would be needed. That is a capability request, not a repair.

No secrets, keys, tokens, headers, JWT claims, bodies, emails, phone numbers, or person/property identities were read or reproduced.
