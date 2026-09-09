# Deployment inspection report — process-upload, generate-insights, snap-mcp-proxy

Inspection only. No files edited, no SQL applied, no functions invoked or redeployed, no secrets read, no data changed.

## 1. Environment

- Backend: Lovable Cloud (managed), project ref `ojyxblegxpdgaqiscxpz`, region `aws-1-eu-north-1`, instance size Mini, not paused.
- **One database only.** There is no separate Test/Live pair: the same instance (`ojyxblegxpdgaqiscxpz`) serves both the preview and the published app, and all session tools are bound to it. Preview vs. published differs only for frontend assets, not for database or Edge Functions.

## 2. Repository source evidence (workspace files, not runtime)

| Function | File | Bytes | SHA-256 of `index.ts` | In-source version marker |
|---|---|---|---|---|
| process-upload | `supabase/functions/process-upload/index.ts` | 90048 | `994c042cfcce6bf1b9ab4c0b7171597b89a1a25ab59f59d84eb650ca2da44d3a` | none |
| generate-insights | `supabase/functions/generate-insights/index.ts` | 23870 | `4557c15b3d53877d7c8add97c234207ff6a9ada4abe5ee87d1d75651f01605f7` | `const VERSION = "v9.4"` |
| snap-mcp-proxy | `supabase/functions/snap-mcp-proxy/index.ts` | 16548 | `ffe670efbf885a56a9fbe6f795ecaba73d8fab727cdf5e138b8f90402e8b8ba3` | none (only `scoring_version` passthrough) |

Revision caveat: the workspace git HEAD reports `1ee4aa194b4871cc400b14a719685a523c131c3d`, **not** `bcb6f46a9ef3fddfff4c7ea564d5cf059d2ba3d1`. The Lovable workspace does not preserve the upstream commit graph, so I cannot confirm the working tree corresponds to `bcb6f46a`. Treat the hashes above as "current workspace content", not as "content at bcb6f46a".

JWT settings, as declared in `supabase/config.toml` (declared configuration, still repository evidence):

- `process-upload` — `verify_jwt = true`
- `generate-insights` — `verify_jwt = false`
- `snap-mcp-proxy` — `verify_jwt = false` (auth handled in-function via HMAC-SHA256)

## 3. Runtime evidence (deployed state)

What I could observe without invoking anything, from platform logs:

- `snap-mcp-proxy` — alive and cycling: boots/shutdowns at `2026-09-09T12:48:01Z`, `12:52:00Z`, `12:56:01Z` (consistent with the keep-warm cron). Confirms a deployed instance exists; carries no version or source identity.
- `process-upload` — no log entries in the retained window. Cannot confirm or deny a deployed instance from logs alone.
- `generate-insights` — no log entries in the retained window. Same limitation.

**Explicit capability statement: I cannot retrieve deployed Edge Function source, a deployed source hash, a deployment version number, or a deployment timestamp.** My available Supabase tools cover deploy, delete, invoke, and logs — none of them read back the deployed bundle or its metadata. So no source-level comparison between deployed code and the repository is possible with the tools I have, and the Git revision must not be treated as proof of what is running. The only remaining runtime signals would come from invoking the functions (the `_version` field `generate-insights` returns, for example), which is out of scope for this request.

## 4. Exact capability needed next

To close the gap, one of:

1. Read access to Edge Function metadata/bundles for ref `ojyxblegxpdgaqiscxpz` — the Supabase Management API `GET /v1/projects/{ref}/functions` (returns `version`, `created_at`, `updated_at`, `verify_jwt` per function) and `GET /v1/projects/{ref}/functions/{slug}/body` (returns the deployed source). Requires a Supabase management access token for the Lovable-managed org, which is not available to me.
2. Or: authorization to invoke `generate-insights` once in a no-op mode so its `_version` response confirms the deployed build. That is an invocation and needs your explicit go-ahead.

## 5. Supported way to deploy the three reviewed files (after your separately verified migration)

- Mechanism: I deploy from this workspace's `supabase/functions/<name>/index.ts` with the Cloud deploy tool, naming exactly `process-upload`, `generate-insights`, `snap-mcp-proxy`. Whatever is in the workspace file at that moment is what ships — there is no way to deploy a specific Git SHA or an out-of-workspace file.
- Consequence: before deployment, the workspace files must be confirmed to be the reviewed content. The practical check is re-running the SHA-256 list in section 2 and matching it against the hashes of your reviewed files.
- `verify_jwt` ships from `supabase/config.toml` alongside the code; the values in section 2 are what would be applied.
- Deployment is immediate and hits the single live instance. There is no staging target and no per-function rollback tool — the previous build can only be restored by re-deploying the previous file content.
- Publishing the frontend is a separate action and is not required for function deployment.

## 6. Proposed next step (awaiting your decision)

No changes until you choose one:

- (a) Nothing further — report accepted as-is.
- (b) Authorize a single `generate-insights` invocation to read back its deployed `_version`.
- (c) Supply, or arrange, Management API read access so deployed source hashes can be compared properly.
- (d) After your migration is verified, authorize deployment of the three functions from the hash-confirmed workspace files.
