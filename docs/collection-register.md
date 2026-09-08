# Owner collection register

The owner dashboard now has a read-only collection register under **Data quality**
and a private sourced-draft list under **News outlets**. Customer acceptance,
request sending, editorial approval, and publication are not actions on this screen.

## Source and deployment boundary

- Repository: `thb1452/ignite-snap-leads`, draft PR 172.
- Verified PR head before editing: `b800065cd2853eb7411e2ff103ad02eade414cef`.
- The clean `snap-owner-mail-review` worktree at local commit
  `3ac72fda87f266785e36580b12dc62503ae054fa` had exactly the same tree:
  `84d2b9c28d0b4da9742c45533a25b16461f2d60b`.
- Live Supabase `owner-operations` was ACTIVE version 5 with gateway JWT
  verification enabled when inspected. After the private registry migration
  passed its database checks, this integration was deployed as version 6 with
  JWT verification still enabled. All four deployed source files matched the
  reviewed payload byte for byte, and unauthenticated access still returned 401.
- The separate `snap-owner-dashboard` worktree and its pre-existing dirty files
  were preserved. Browser tests ran on port 4186. The 4173 worktree then received
  only the checked eight-file integration patch after every prior file matched
  the verified PR base. TypeScript passed after transfer. The original v5 sources
  and a SHA-256 manifest were saved locally for rollback.

The endpoint remains GET/OPTIONS only. Auth verifies the bearer token and confirmed
email before the server-owned owner allowlist is read. Access-only checks return
before private feeds are queried. The new register uses the existing server secret
inside the endpoint; no service credentials enter the browser.

## Required private tables and fixed feeds

These tables are defined by the separate reviewed
`collection-core/deliveries-schema.sql` migration. That migration must be installed
before these feeds can succeed. A missing table remains an unavailable feed;
other dashboard sections can continue working.

| Feed | Table and scope |
|---|---|
| `collectionDeliveries` | Latest 100 source acquisitions; selected identity, geography, freshness, row-count and release-state fields |
| `collectionProcessing` | Latest 100 processing runs; selected counts, processor version and review/release-state fields |
| `collectionOriginals` | Latest 1,000 original-file location records, limited to government raw responses and preserved originals; only delivery ID, role, and storage kind |
| `collectionEditorial` | Latest 100 private editorial handoffs; source/run IDs, outlet, title, review/publication state and registration time |
| `freshCollectionCount` | Exact HEAD count of delivery rows with `freshness=fresh_verified` |
| `customerAcceptedCollections` | Exact HEAD count of delivery rows with `customer_accepted=true` |

No payload, raw property/message content, file path, storage reference, source URL,
signed download URL, or draft body is returned by these feeds. No file URL is
followed and no artifact is made public. Limits, ordering, tables and columns are
fixed in server code rather than supplied by the browser.

## What the figures mean

**Fresh source collections** counts distinct registered acquisition events, not
normalization runs, emails, violation rows or properties. Historical preservation
and unverified receipts remain separately labeled in the list. Synthetic tests
belong in isolated database schemas and are not inserted into this public register.

**Candidate rows in view** uses only the latest visible processing run for each
displayed delivery. Older runs are not added again. The figure becomes unavailable
when a displayed collection has no visible run or its feed is unavailable. It is
neither an operation-wide total nor an approved unique-property count. Recorded
case counts, violation rows, duplicate rows and held rows retain their own labels.

**Accepted for customers** counts accepted collections, not property rows. The
current private register schema constrains customer acceptance and usable-record
flags to false, so its expected count is zero. A missing count does not become zero.
This UI does not provide an acceptance action or change the schema's release gate.

Original locations distinguish local files from recorded private storage copies.
The current registry verifies/registers local files only. A future private-copy row
does not establish a complete backup of every original. If the location feed is
truncated or has no exact total, absent locations are explicitly unknown.

Sourced story drafts display their review state and source collection separately
from public-story feeds. A `reviewed` label does not mean published, and pending
handoffs are labeled **Pending editorial review**. No approval or publish button
is added.

## Validation

- 13 endpoint tests passed: existing owner access protections plus fixed metadata
  selection, GET/HEAD-only register reads, exact count scopes, no private payload
  or location exposure, and independent feed failure.
- 14 browser tests passed with intercepted synthetic responses, including fresh
  versus historical labels, latest-run deduplication (12 candidates rather than
  22 across two runs), zero accepted collections, pending editorial review, no
  approval/publish action, unavailable processing, and incomplete location lists.
- App and handler TypeScript checks, scoped owner-code lint, production build,
  and whitespace checks passed. The 390px mobile register screenshot was visually
  inspected; no horizontal overflow occurred.

The test runner accepts `OWNER_TEST_PORT` for an isolated server and refuses to
reuse a pre-existing server when that override is supplied. It keeps the existing
4173 default for prior workflows. No dependency versions or lockfiles changed.

These browser tests validate the integration with synthetic data. Deployment and
its source verification are separate evidence recorded above. An authenticated
owner-session check against registered live deliveries remains a separate rollout
check; these tests do not establish customer delivery or editorial publication.
