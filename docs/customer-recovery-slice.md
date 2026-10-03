# Account-details readiness

This source change makes account details depend on a freshly verified Auth identity and an unambiguous profile/organization lookup. It does not grant property access, change authentication configuration or implement account provisioning.

## Behavior

- A missing, duplicate, mismatched or unreadable profile shows a setup/retry message instead of a profile assembled from Auth metadata.
- The query cache is scoped by Auth UUID. Switching profiles discards unfinished name edits.
- Name changes revalidate the current account, target both profile and user UUID, update only `full_name`, and require exactly one matching receipt. Each gateway operation has a 12-second timeout; errors and uncertain updates have no automatic retry. A timeout does not guarantee cancellation of an already accepted update.
- Password reset uses native Auth after a fresh account check. The screen does not send reset mail automatically.
- A ready account-details result is not a subscription, credit, source-release or export authorization.

## Tests

Run with the existing project dependencies and a Node runtime supporting type stripping:

```sh
node --experimental-strip-types --test tests/profile-readiness.test.mjs
node --test tests/profile-readiness.browser.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/eslint/bin/eslint.js src/services/profileReadiness.ts src/services/profileGateway.ts src/hooks/useProfileSettings.ts src/components/settings/AccountDetailsSection.tsx
node node_modules/vite/bin/vite.js build
```

The browser harness uses installed Chrome by default (or `SNAP_PROFILE_BROWSER_CHANNEL`), an injected fake client and Auth context, and a temporary loopback server. It blocks all nonlocal requests and closes the browser/server after testing. No live Auth, database, payment or email calls are made.

Validated: 16 unit tests, six browser cases, app TypeScript, scoped lint and production build. Cases cover incomplete/ambiguous setup, exact name-update scope, native password reset arguments, cached profile separation and an unfinished edit during an account switch. The fixture uses only synthetic identities and records.
