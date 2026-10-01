# Internal pilot rehearsal — prepared, not a customer result

Use an isolated staging environment and synthetic fixtures only. No production buyer impersonation, no real owner details, no payments and no communications to property owners. Record staging URL, exact release SHA, seeded user IDs and synthetic label before starting.

## Setup

- Two independent synthetic customer workspaces: Fixture A and Fixture B. Separate authenticated browser contexts; do not rely on a shared founder account.
- One clearly marked synthetic ordinary property and one synthetic reviewed-source receipt with explicit fixture acceptance. Do not change production source release permissions.
- Fictional contact: “Example Owner,” phone omitted, email omitted, source “Internal rehearsal fixture,” permission unknown. Private note: “Synthetic exercise only.”
- Dates: one due tomorrow, one overdue yesterday, and a current local-time action. Verify displayed device timezone.

## Moderator rehearsal

1. Show the synthetic/source label and ask the operator to state which facts are known versus fictional. A synthetic case cannot be counted as validated municipal data.
2. Create or reopen the property lead on desktop; repeat via mobile action. Refresh and assert one lead ID and preserved private work.
3. Add the fictional contact/note; schedule a next action and edit a deal estimate. Verify normal negative input handling.
4. Change stage with the keyboard/touch selector; verify persisted stage/history. Archive and restore the same lead.
5. Interrupt acknowledgement after an outcome commit, reload the same tab, and retry/check the saved request. Assert one outcome activity, correct next action, and no duplicated last-contact event. Repeat with expired and other-account recovery state; require fail-closed behavior without exposing the private note.
6. Switch to Fixture B in the same browser session. Attempt direct access to A's lead/contact/activity IDs and export. No A data should appear. Return to A only through ordinary authorized login.
7. Revoke/expire the synthetic source receipt. Private notes/contacts/actions stay available; evidence becomes unavailable with no raw-table fallback.
8. Export private account JSON and summary CSV. Confirm all permitted private work and formula escaping; source receipts remain outside the private-work export contract.

Record pass/fail, screenshots without credentials/PII, exact obstacle and reproduction. A browser test failure becomes a release blocker. This checklist is **not yet executed** merely because isolated PostgreSQL/unit tests passed.

## Completion record

Maintain a separate `internal-rehearsal-result` with `kind: internal_synthetic`, actual timestamp, browser/runtime version, release SHA and test identities. Never insert these rows into the customer scorecard. Buyer counts and day 3–7 return metrics remain unobserved until real eligible participants complete them.
