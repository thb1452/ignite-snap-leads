# Pending checkout confirmation in Settings

This source-only slice removes payment-success claims that were derived from a return URL, a general positive balance, or a matching plan name. It does not reconnect the customer client, change prices, fulfill payments, or alter subscription/credit rules.

Settings now displays a generic **Payment confirmation pending** notice when it sees an untrusted checkout return hint. It never displays the URL's amount or the stored expected balance/tier as verified information. Signing out hides the notice; account changes cannot carry receipt details because no receipt details are loaded. Ordinary Settings visits show no checkout notice.

The two previous effects automatically called verification functions and retried broad balance refreshes before showing success. They are removed. The current working backend has no corresponding verification functions, and the source fallback does not supply a trustworthy exact-payment receipt. This slice deliberately has **no success branch and no automatic fulfillment call**. Existing checkout hints remain available for future reconciliation; expiration only affects whether the notice appears.

## Future paired adapter

Before displaying fulfilled status, a future server contract must verify the current Auth user and the exact Checkout Session/payment identity, explicitly bind the provider account/mode and source-controlled product, and return a committed idempotent fulfillment receipt. A generic `fulfilled: true`, matching plan, balance increase, or URL parameter is not that contract. Checkout hints in legacy local storage have no user binding and must never select a customer's payment record.

The notice advises a customer who already paid to retain their receipt and avoid making another payment merely to refresh the screen. It does not imply their payment failed or that the application has verified it. Other checkout/success screens are outside this Settings-only slice and require the same receipt contract before a full billing cutover.

## Validation

Using the project's existing dependencies:

```sh
node --experimental-strip-types --test tests/checkout-return-hint.test.mjs
node --test tests/checkout-return.browser.test.mjs
node node_modules/typescript/bin/tsc --noEmit -p tsconfig.app.json
node node_modules/eslint/bin/eslint.js src/pages/Settings.tsx src/components/settings/CheckoutReturnNotice.tsx src/services/checkoutReturnHint.ts
node node_modules/vite/bin/vite.js build
```

Five unit and six browser tests cover forged/malformed URL counts, session-only hints, stale/future/malformed stored hints, pre-existing balances/matching plans, focus events, sign-out/account changes and ordinary visits. The browser test mounts the real Settings page with synthetic providers, blocks nonlocal requests, confirms there are no verifier calls/success toasts and preserves local hints. No Stripe, Auth, database or customer actions occur. The browser harness uses installed Chrome by default (`SNAP_PAYMENT_BROWSER_CHANNEL` may select another installed test channel).

The slice is based on freshly verified customer main `daec0f6429d7f3cf6abd5c418dfe6b84ee46ab62`. Account-details draft PR #173 remains separate and unchanged; its files do not overlap this change.
