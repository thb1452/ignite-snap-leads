# Private source review

`/owner/source-review` uses the existing customer Supabase Auth session to load explicitly assigned intake batches. It is independent of the legacy VA/admin role and subscription gates. It does not create accounts, approve records, export, enroll CRM leads or contact a provider.

The paired database API consists of `fn_owner_source_review_batches_v1()` and `fn_owner_source_review_v1(p_preparation_sha256, p_limit, p_offset)`. Both run with the caller's permissions. Private table policies admit only the authenticated user/batch pairs in the operator-managed reviewer allowlist. The underlying installer and its specific account assignment are maintained in the private deployment packet, rather than this public source repository. Ordinary customers, anonymous callers and service-role callers are not implicitly reviewers.

The page selects from the latest 100 assigned batches, reports truncation, and reads at most 25 distinct violations at a time. Each approved-to-review batch keeps separate event and parcel totals. Original descriptions, identifiers, status and dates remain separate from later parcel evidence. Recorded units, year and acreage include their source caveats. These views do not establish current occupancy or affected-unit identity. This version's backend validates the existing Syracuse intake contract; other source contracts still require integration.

Signing out immediately hides records and cancels reads. A delayed or failed logout leaves records hidden, with a visible retry action. Late responses and results associated with another account, batch or page cannot become the visible review. Data is held only in component state. The existing application still performs its ordinary route analytics.

The detail API must return the `owner-source-review-v1` contract, and the listing API must return `owner-source-review-batches-v1`. A missing or rejected API produces an explicit error, never a raw-table fallback or a successful empty review.

Validation commands, after installing the existing lockfile dependencies:

```sh
node --experimental-strip-types --test tests/source-review.test.mjs
npx tsc --project tsconfig.app.json --noEmit
npx eslint src/services/sourceReview.ts src/pages/OwnerSourceReview.tsx src/components/source-review/SourceReviewRecords.tsx
npm run build
```

The browser test expects a development server on `127.0.0.1:4198`. Run `node tests/source-review-browser.mjs`. It uses an isolated browser with intercepted synthetic API replies, denies external network access, and never establishes real owner authentication or customer release. Screenshots default to `test-results/source-review`; `SNAP_REVIEW_TEST_ARTIFACT_DIR` may point to a private evidence directory. On non-macOS hosts install the normal Playwright Chromium runtime first.

Production readiness still requires the matching installed API and a browser read through the actual owner's signed-in customer session. Source publication or a passing synthetic browser test alone does not prove that connection.
