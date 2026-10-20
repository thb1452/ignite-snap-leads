# Buffalo first-batch repair — October 20, 2026

The configured customer database is responding again. The former billing pause is no longer the observed blocker. The application's independent general upload hold remains in place.

984 cleaned residential Buffalo source violations have been imported into a new private, immutable source ledger. Counts: 322 agency cases, 307 complete addresses, 376 source parcel IDs; four possible duplicate rows excluded. Actual saved hashes and identity counts reconcile with the retained preparation. Exact replay adds zero records. SQL rollback tests passed for owner access, unassigned access, revocation, immutability and API role restrictions.

A dedicated authenticated Buffalo panel is being added to /owner/source-review. Existing Syracuse and Madison Heights paths remain unchanged. This is private owner review, not customer lead publication. General customer properties/violations were unchanged by this import. No other downloaded city batch is included.

See ops/buffalo-pilot/README.md and proof-20261020.json for scope, implementation and verification limitations. Preserve global ingestion and source/account controls.
