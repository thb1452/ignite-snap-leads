# Private Buffalo local investor-brief pilot

This is an offline pilot alongside the existing Buffalo source import. It does not rebuild Snap, connect to a database, alter source acceptance, lift an upload/generation/security hold, or write customer briefs. Main was inspected at `975682646b35bab09952347719fb418896a6b7b8`; PR #195 was verified merged at `97aa5ad2f5ab3b9d1a85cf88674a768cfc32699a`.

The current execution surface is Linux, not JD's Mac. Implementation and synthetic tests do not establish that Qwen has generated a brief. The private delivery report records actual drafts/reviews/performance separately and remains incomplete until the Mac run and all ten source-based draft reviews are complete.

## Requirements

- Python 3.10 or newer; standard library only, no pip/npm packages or paid APIs.
- The actual Apple Silicon Mac with at least 16 GiB physical memory.
- LM Studio running locally, with the existing Qwen3.5 9B MLX 4-bit model loaded, at least an 8192-token context, and the server bound to loopback. Leave serving on the local network off. If reasoning is enabled, inspect whether the first response fits the output budget; a truncated response is held, never silently accepted.
- Native metadata must identify model family, size, quantization, MLX format and loaded instance. A model-list alias alone is insufficient. Native v1 is preferred; only a v1 HTTP 404 permits the documented v0 metadata fallback. Authentication failures do not trigger fallback.
- If local server authentication is enabled, set `LM_STUDIO_API_TOKEN` in the Mac shell. It is sent only to the literal loopback origin and is never written into a saved request. Do not put it in a URL, command argument or committed file.

The packaged private work directory already contains the ten selected source packages. Keep it outside the public git repository. The public branch contains reusable code and instructions only, with synthetic tests; it contains no selected property records or drafts.

## Run the prepared selection on the Mac

From the unzipped delivery folder, run the included `Run-on-Mac.command`. It verifies evidence, checks the actual host and loaded model, and generates the first property only. Alternatively, with the branch checked out and the private directory alongside it:

```sh
python3 ops/buffalo-local-brief-pilot/pilot.py verify --workdir ../Buffalo_Local_Brief_Pilot/private
python3 ops/buffalo-local-brief-pilot/pilot.py doctor --workdir ../Buffalo_Local_Brief_Pilot/private
python3 ops/buffalo-local-brief-pilot/pilot.py generate --workdir ../Buffalo_Local_Brief_Pilot/private --limit 1
```

The default origin is `http://127.0.0.1:1234`. Only literal loopback HTTP origins with a port are accepted; proxies, public/LAN endpoints, URL credentials, paths and redirects are refused. No cloud-container loopback is treated as the Mac. There is no public tunnel or automatic model loading/downloading.

Open `private/side-by-side.html`. The left side contains code-computed facts and retained source excerpts. The right contains actual Qwen investigation notes when generated. Each run also produces `brief.html`, `draft.json`, `validation.json`, `review_template.json`, `metadata.json`, and the original API response under `private/runs/<parcel>/<result-key>/`.

## Review the first trial, then finish the ten

Copy that trial's `review_template.json` to a separate local review file. Read every cited record in `properties/<parcel>/agency_originals.json` (exact collected agency JSON) and `originals.json` (the preserved import-preparation CSV representation). Check identity, classification, counts, dates, citations, source excerpts, unsupported claims and usefulness. For each model statement record the exact references checked and a specific support note. A blanket automated pass cannot approve a draft.

Record reviewer, actual review time, individual claim notes, quality scores from one to five, corrections, and `approved` or `held`. Submit it with:

```sh
python3 ops/buffalo-local-brief-pilot/pilot.py review --workdir ../Buffalo_Local_Brief_Pilot/private --parcel <parcel-id> --review-file <completed-review.json>
python3 ops/buffalo-local-brief-pilot/pilot.py generate --workdir ../Buffalo_Local_Brief_Pilot/private --limit 10
```

The worker requires an approved first trial before generating the rest. It reuses the first completed result if inputs/prompt/model/settings are unchanged. Review each remaining output the same way, then run `report`. Reviews bind to the exact input and output hashes and have an append-only local history. An unsupported statement means hold. Keep the raw Qwen output; do not edit it into an apparently original model result. Revise the prompt and its version, rerun as a new result key, and document what changed in the review correction notes.

The 48-hour collection threshold is a proposed local review policy, not proof of upstream freshness or a legal expiry. If running later, use the retained snapshot only with an explicit historical-scope explanation:

```sh
python3 ops/buffalo-local-brief-pilot/pilot.py generate --workdir ../Buffalo_Local_Brief_Pilot/private --limit 1 --historical-note 'Historical snapshot pilot only; current status and present condition remain unverified.'
```

The note is saved with the generation receipt. No source refresh or duplicate download occurs. A historical brief still requires source review and cannot claim current status.

## Evidence and identity rules

`prepare` verifies the pinned retained manifest, every artifact size/hash, all 984 cleaned records against the merged cleaner, all 988 originals including four holds, and the previously collected 257,696-row Buffalo snapshot. CSV and JSON original representations are compared explicitly: omitted empty cells and JSON-serialized object cells are normalized only for comparison; both originals and both hashes remain separate.

Parcel plus Buffalo jurisdiction is the primary key. A complete address supports the match. Leading zeroes are preserved. There is no street-suffix guessing, unit stripping, address-only merge or case-number merge. A parcel must have one consistent complete address and class across retained snapshot observations; an address with multiple parcel references is held. Missing/conflicting classifications require an official Buffalo assessor/property source and remain held in this pilot. Only consistent exact classes 210, 220 and 230 are selected. Other potentially residential classes are outside this small benchmark, not declared nonresidential.

Class codes use the official [New York classification definitions](https://www.tax.ny.gov/research/property/assess/manuals/prclas.htm), checked October 20, 2026. One-, two- and three-family year-round classification describes the collected agency field; it is not an independent current-use, ownership, condominium, townhouse or detached-home check. Those fields remain unknown. Code definitions, classification observation, identity verification and preparation dates remain distinct.

The selection is deliberately varied: four one-family, four two-family and two three-family parcels, with simple, multi-finding and multi-case records. It is not an investment ranking. Full-snapshot identity observations are used for matching only; brief counts include only the retained pilot window. No other city is processed.

Counts, distinct cases, description categories, violation date ranges and collection comparisons are computed in Python. A violation date or year in a case ID never supplies a case-opening date. ACTIVE means agency status at collection. The original source may contain deadlines, fees or allegations: retained quotations are labelled agency reports and do not establish current obligations, occupancy, seller motivation, repair costs, valuations, liens or outcomes.

The model sees an explicit allowlist of evidence fields, not inspector columns or unnecessary contact details. Phone numbers, emails and adjacent parenthesized contact names are redacted from model comments. Source originals remain intact privately. Source text is untrusted data in the user message; the system prompt forbids treating it as instructions. The model has no tools, database client or provider fallback.

## Resume and performance

Only one worker runs at a time. Each request, original response and receipt is saved atomically. The cache key binds input hash, prompt version/hash, native model identity/configuration, generation settings and validator version. Completed unchanged drafts, including held drafts, are not regenerated. A saved response is recovered without a new POST after interruption. If killed before the response is saved, the previous attempt remains `server_completion_unknown`; restarting can require a new inference because the missing response cannot be recovered. If a timing receipt was not committed, performance remains unknown.

Each actual Mac request measures HTTP wall time with a monotonic clock, usage reported by the runtime, and one-second OS memory samples using `ps`, `vm_stat` and swap observations. Process RSS sum may double-count shared pages and omit Metal allocations; it is not exact model-only unified memory. Model-file size is never used as memory consumption. Hardware, app version when available, loaded model metadata/config and all timing/memory limitations are saved. Cloud/fake-runtime tests do not count as Mac benchmark results.

## Reproduce preparation and tests

Use the already-collected files. These commands make no network request:

```sh
python3 ops/buffalo-local-brief-pilot/pilot.py prepare --prepared <Buffalo_Pilot_2026-10-20> --snapshot <retained-Buffalo-records.jsonl.gz> --workdir <new-private-output-folder>
python3 -m unittest discover -s ops/buffalo-local-brief-pilot/tests -p 'test*.py' -v
python3 -m unittest discover -s ops/buffalo-pilot/runtime -p 'test*.py' -v
node --experimental-strip-types --test tests/buffalo-source-review.test.mjs tests/source-review.test.mjs
```

The final Node check uses existing project dependencies. The Python pilot itself has none. Its synthetic tests cover duplicate events, shared cases, uncertain parcel/address matches, conflicting/missing/mixed-use classifications, stale records, missing fields, tampered counts/dates, untrusted instructions/contact removal, foreign citations, unsupported claims, incomplete human review, model identity, private endpoints, interrupted runs, cache reuse and concurrency.

## Baseline, recommendation and remaining limits

No same-property historic briefs were available in the retained work. The side-by-side compares source facts with actual Qwen output; it does not invent an old baseline or invoke a paid model. The legacy `dealStrategistPrompt.ts` was inspected for a qualitative design comparison only. This pilot does not change it or reuse Syracuse-pinned `cleanInvestorEvidence.ts` as Buffalo evidence.

Do not expand until all ten actual Mac runs pass structure/citation checks, all ten have source-based human approvals, and all ten have actual performance receipts. A proposed next-test quality target is at least four of five for specificity, usefulness and clarity. Inspect actual speed, swap and memory samples before deciding whether a larger private test is practical. Success would recommend only a separate next private test; it does not authorize production generation or fix the separate investor-card cache/fallback review.

Official API references checked October 20, 2026: [native model metadata](https://lmstudio.ai/docs/developer/rest/list), [compatible chat API](https://lmstudio.ai/docs/developer/openai-compat/chat-completions), [structured output including MLX](https://lmstudio.ai/docs/developer/openai-compat/structured-output), and [older v0 metadata](https://lmstudio.ai/docs/developer/rest/endpoints). API documentation is not evidence that JD's installed runtime has passed this pilot.
