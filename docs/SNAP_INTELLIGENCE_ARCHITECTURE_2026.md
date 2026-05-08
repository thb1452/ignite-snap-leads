# Snap Ignite — Backend Intelligence Architecture (2026)

**Status:** Design document, NOT code — pre-implementation reference for P1+
**Last updated:** 2026-05-08
**Companion:** [docs/SNAP_IGNITE_MASTER_PLAN.md](./SNAP_IGNITE_MASTER_PLAN.md)
**Grounded in:** the P0 foundation that landed in `20260507194800_*` through `20260507224634_*`, and a verified map of current edge functions, queues, AI paths, and frontend integration seams as of 2026-05-08.

> **Nothing below is built yet.** All recommendations are additive evolution from the current state. Stay aligned with the master plan's solo-operator / single-VM / single-Postgres / additive-only constraints.

---

## 1. Executive summary

Snap Ignite already has the *raw materials* of an intelligence platform — 457K scored properties, deterministic SnapScore v8, FOIA pipeline foundations, agent observability table, pgmq for email — but the system is currently *episodic*: properties have a current state, briefs are generated on demand, the weekly digest is system-wide rather than watchlist-scoped, and there is **no historical state, no delta engine, no user-scoped intelligence stream, and no freshness SLA**. The product UX has shifted to a monitoring / watchlist mental model. The backend has not.

**The single highest-leverage infrastructure investment is a freshness + delta layer**: an append-only event log over violations, a periodic property snapshot, and a derived `signal_deltas` stream classified into "meaningful change" types. Once that exists, three downstream systems become trivially correct: (a) per-user watchlist intelligence ("your saved property changed"), (b) AI Brief regeneration triggers ("brief is stale because pressure escalated"), and (c) a defensible "Bloomberg for code enforcement" moat ("we know what changed and when, with a timeline").

Stay additive. Stay deterministic where possible. Don't introduce Redis, microservices, or paid APIs by default. Snap is a single-VM, single-Postgres, solo-operator-plus-AI shop until $25K MRR — that constraint is a feature, not a limitation, and the design below respects it.

---

## 2. Biggest backend / product gaps today

| # | Gap | Why it matters | Where it manifests |
|---|---|---|---|
| 1 | **No historical state / change log** for properties or violations | Cannot answer "what changed?" — the foundational moat question. `previous_status` on violations is a soft single-step tracker; no row versioning. | violations.previous_status only; no `*_history`, `*_snapshot`, `*_events` tables for property/violation lifecycle |
| 2 | **No delta / event stream** | All "freshness" framing in the UI is currently a lie of omission. We say "weekly fresh actions" but cannot say *what* changed about a specific property. | FreshnessIndicator just counts global weekly violation rows |
| 3 | **No user-scoped intelligence stream** | Saved properties + lists are passive joins. Live Feed is system-wide. Weekly digest is system-wide. There's no path from "violation changed" to "notify the users who care about this." | `saved_properties (user_id, property_id)`, `user_lists`, no `watchlist_events`, no `saved_markets` |
| 4 | **No freshness SLA per jurisdiction** | The product implicitly promises "weekly cadence" but no system tracks whether a county is actually that fresh. | `enrichment_sources.last_checked_at` + `foia_sources.last_verified_at` exist but aren't surfaced or enforced |
| 5 | **AI Brief generation is on-demand-only and stateless** | Briefs go stale silently. No regeneration trigger on signal change. Two model paths (legacy Groq + Azure GPT-4o) with no consolidation. No prompt versioning. No "delta brief". | `generate-investor-brief` (Groq Llama-3.3-70B) + `bulk-regenerate-briefs` (Azure GPT-4o); cached in `properties.snap_insight` + `properties.investor_insight_brief jsonb` |
| 6 | **SnapScore recompute is weekly cron + global** | Doesn't react to events. Wastes compute on unchanged properties. Doesn't react to violation status changes the same week. | `scheduled-rescore` cron, runs `generate-insights` against properties with open violations |
| 7 | **No unified job orchestration pattern** | `enrichment_agent_jobs` and `foia_request_jobs` use app-level row-locking. Email queue uses pgmq with DLQ. Different retry semantics across job types. | `locked_at`/`locked_by` on agent jobs vs pgmq for email |
| 8 | **No AI cost budgeting** | `agent_runs.tokens_used` + `cost_usd` exist (great!) but no cap, no per-user envelope, no "this regen would exceed budget — defer". | `agent_runs` is observability only; no budget table or guard |
| 9 | **No investor memory** | `user_activity_log` collects events but they don't feed back into the system as preference signals. No "this user values water-shutoff signals" derivation. | `user_activity_log` is write-only; no derivation |
| 10 | **Source reliability is implicit** | We have `enrichment_sources.status` and `foia_sources.automation_status` enums, but no auto-computed reliability score from outcomes. | `agent_runs` has the data; no rollup |

Gaps 1–3 are the **moat-creating** gaps. The rest are quality / cost / reliability.

---

## 3. Most important strategic infrastructure upgrades (in priority order)

The five upgrades below, in this exact order, transform Snap from "scored database" to "intelligence platform":

1. **Event log + snapshot layer over violations and properties.** Append-only `violation_events`, periodic `property_snapshots` (sparse, JSONB diff). Foundation for everything else.
2. **Signal-delta engine.** Trigger-driven enqueue → worker classifies deltas into typed events (`new_open_violation`, `escalation`, `water_shutoff`, `repeat_offender_threshold_crossed`, `enforcement_acceleration`, `signal_aging`, `closed_after_long_open`). Drives rescoring + brief regeneration + watchlist fan-out.
3. **Watchlist intelligence stream.** `saved_markets` (geographic searches saved for monitoring), `watchlist_intelligence_events` (per-user materialized stream), `user_signal_preferences` (which delta types this user cares about). Feeds digest, in-app live feed, and notifications.
4. **AI orchestrator + cost envelope.** Consolidate brief generation behind one function with prompt_version + cache_key + budget_check. Trigger regeneration on signal_delta of meaningful types. Per-user / per-org monthly token cap.
5. **Freshness SLA layer.** `jurisdiction_freshness` (per-county SLA + last-fresh timestamp), `property_freshness_score` (derived view, not column), surfaced to UI as a confidence indicator.

Everything else — better operational automation, source reliability scoring, advanced enrichment — sits on top of these five.

---

## 4. Freshness intelligence architecture

### Goal
Snap should be able to answer, for any property and any user: *what changed*, *when*, *why does it matter*, *how meaningful is the change*, *is pressure increasing or fading*, and *when was this jurisdiction last verified*.

### Design

**Three semantic layers of freshness:**

1. **Source freshness (jurisdictional)** — when did we last successfully ingest from this jurisdiction's source? Already partially tracked in `enrichment_sources.last_checked_at`, `foia_sources.last_verified_at`. Promote to first-class `jurisdiction_freshness` rolled up by `(state, county_fips, source_type)` with `sla_days`, `last_fresh_at`, `staleness_state ENUM('fresh','aging','stale','unreachable')`.

2. **Property freshness (per record)** — derived, not stored as a column. Computed from: `MAX(violations.last_seen_at)` for property, `MAX(parcel_attributes.enriched_at)`, latest `agent_runs` for that property's enrichment job. Expose as a view `v_property_freshness(property_id, last_signal_at, last_enrichment_at, freshness_score, freshness_band)`. Don't denormalize into `properties` — that creates write amplification.

3. **Signal freshness (per delta)** — every emitted signal_delta has a `detected_at` timestamp. The semantic claim "fresh enforcement action" must be backed by an actual detected delta with that timestamp.

**Event timestamps + snapshot model:**

- `violation_events (id, violation_id, property_id, event_type ENUM, prev_value jsonb, new_value jsonb, detected_at, source_run_id uuid)` — append-only, one row per state transition. Trigger on `violations` INSERT/UPDATE writes the appropriate event_type (`opened`, `status_changed`, `closed`, `reopened`, `description_updated`, `severity_increased`).
- `property_snapshots (id, property_id, snapshot_at, payload jsonb, payload_hash text)` — sparse snapshot, written only when violation_events fire OR when `snap_score` materially changes (>= 5 point delta) OR weekly heartbeat (configurable per `freshness_band`). `payload_hash` allows skipping inserts when nothing meaningful changed.

**What triggers rescoring (deterministic decision table, not "always"):**

| Event | Rescore? | Brief regen? | Snapshot? |
|---|---|---|---|
| `new_open_violation` | yes | yes | yes |
| `status_changed` (open→closed) | yes | yes if >30 days open | yes |
| `status_changed` (open→escalated) | yes | yes | yes |
| `description_updated` only | no | no (enqueue cheap re-classify only) | no |
| Cosmetic raw-data refresh, no semantic change | no | no | no (hash dedup) |
| Property unlocked by user | no | no | no |
| Weekly heartbeat | no by default; only if no snapshot in 14 days | no | yes |

This decision table is the single biggest lever for cost control. Enforce it in the worker, not in app code.

**How to maintain trust in freshness:**

- Surface jurisdictional staleness on the property card (small, low-noise: "County data verified 4 days ago"). Don't fabricate per-property freshness when the underlying jurisdiction hasn't been re-pulled.
- The `FreshnessIndicator` becomes "N new violations filed this week in markets you're tracking" once watchlist fan-out exists; until then keep current global text.

---

## 5. Signal delta architecture

### Tables (new)

- **`signal_deltas`** — the materialized stream. `(id uuid, property_id uuid, delta_type ENUM, severity smallint, prev_state jsonb, new_state jsonb, evidence jsonb, snap_score_before int, snap_score_after int, detected_at timestamptz, source_event_id uuid, expires_at timestamptz NULL)`. `expires_at` lets time-bounded deltas decay (e.g. `enforcement_acceleration` is only meaningful for 30 days).

- **`delta_type` enum** — keep this *small* and curated:
  - `new_open_violation`
  - `enforcement_escalation` (citation → court → condemned)
  - `water_shutoff_added`
  - `repeat_offender_threshold_crossed` (e.g. 3rd violation in 12mo)
  - `multi_department_now` (first time a 2nd department is involved)
  - `extended_enforcement_milestone` (90 / 180 / 365 day open thresholds)
  - `pressure_increasing` (snap_score delta ≥ +10 over 30 days)
  - `pressure_fading` (delta ≤ −10)
  - `closed_after_long_open` (closed after >180 days)

Avoid adding more without ROI. Each delta type that fires is a reason to re-engage a user; each one that fires falsely or noisily is a trust hit.

### Pipeline

```
Postgres trigger on violations INSERT/UPDATE
  → enqueue pgmq job 'signal_delta_processing' { violation_id }
       → worker: load prior property_snapshot (if any)
                 compute typed deltas (deterministic rules, no LLM)
                 INSERT signal_deltas (one per detected type)
                 INSERT property_snapshot (sparse)
                 enqueue 'rescore_property' if rule says yes
                 enqueue 'fanout_watchlist_event' for each delta
                 enqueue 'regenerate_brief' if rule says yes
```

**Why pgmq, not the app-locking pattern used on `enrichment_agent_jobs`:** signal-delta processing is high-throughput, idempotent, and benefits from fan-out semantics. The agent-job pattern is for jobs with credential / rate-limit / portal context that needs human review and explicit retry decisions. Use the right tool per workload.

**Confidence scoring on each delta** — `severity smallint (0–100)` derived from the same deterministic rules that produce SnapScore (master plan: Oracle is deterministic). E.g., `water_shutoff_added` ≥ 80; `description_updated` would be < 20 (and we don't emit those at all). Confidence is what lets the user trust the digest.

### Timeline generation

Once `signal_deltas` exists, `v_property_timeline (property_id, events[])` becomes a 30-line view, and the UI gets "this property's pressure history" for free. **That view is the product.**

---

## 6. Monitoring + watchlist architecture

### New first-class entity: `saved_markets`

Currently: monitoring is implicit via `saved_properties` + `user_lists`. There is no concept of "I'm watching Marion County, IN, residential, SnapScore ≥ 60."

```
saved_markets (
  id uuid PK,
  user_id uuid FK,
  name text,
  filter_payload jsonb,        -- bbox / county_fips / state / filters
  notify_on jsonb,             -- delta_type subset; defaults from user_signal_preferences
  digest_cadence ENUM('off','daily','weekly') DEFAULT 'weekly',
  last_seen_at timestamptz,    -- last time the user opened this market in app
  created_at timestamptz,
  updated_at timestamptz
)
```

The `filter_payload` mirrors the frontend's filter bar shape — same shape used by `fn_properties_by_bbox`. The point is fidelity: a saved market is *exactly* the search the user was running, parameterized.

### Event-driven monitoring

`watchlist_intelligence_events`:

```
(id uuid, user_id uuid, source ENUM('saved_property','saved_market','list'),
 source_id uuid, signal_delta_id uuid FK, severity smallint, seen_at timestamptz NULL,
 dismissed_at timestamptz NULL, created_at timestamptz)
```

Pipeline: when a `signal_delta` is generated, the fan-out worker:
1. For each saved_property whose property_id matches → insert event.
2. For each saved_market whose filter matches the property → insert event (use a stored function that re-applies the filter against the property's current state).
3. For each list whose properties contain this property → insert event with source='list'.

**De-duplication / noise control:** insert with `ON CONFLICT (user_id, signal_delta_id) DO NOTHING`. If the same property hits via saved_property AND saved_market, prefer saved_property (more specific). Add a per-user throttle: max N events per market per day, respecting `digest_cadence`.

### Low-noise alerting principles

- **Delta type whitelist per user.** `user_signal_preferences (user_id, delta_type, weight smallint, suppressed bool)`. Default weights derived from observed behavior (`user_activity_log`). Users with high `snapScoreClicked` events on water_shutoff properties get water_shutoff weighted higher. *No surveys*. Behavior-derived only.
- **Severity threshold.** Only fan out events with severity ≥ user's threshold (default 50).
- **Cooldowns.** Same property can't generate >1 event/user/24h.
- **Digest, not push.** Default delivery is the existing weekly digest with watchlist scope. Real-time push only for `severity ≥ 80` if user opted in.

### What this replaces

- `LiveActivityFeed` becomes "your activity" — same component, scoped by user. The system-wide feed becomes admin-only (`/admin/live-feed`).
- `weekly-digest` becomes watchlist-driven: top events from this user's `watchlist_intelligence_events` for the past 7 days, sorted by severity. The current "global top 5" path becomes the fallback for users with empty watchlists.

### Anti-patterns to refuse

- No fabricated "X investors are looking at this property" social proof.
- No fake "price drop" or "owner motivation increased" claims.
- No notifications without a real `signal_delta` underneath.

---

## 7. Investor-memory / workflow continuity architecture

### Already collecting (don't re-instrument)

`user_activity_log` already captures: `page_view`, `property_saved`, `property_unsaved`, `filter_used`, `upload_started`, `search`, `export_csv`. GA4 captures funnel events. **The data is there.** What's missing is the derivation layer.

### Memory derivations (server-side, batch nightly)

`user_intelligence_profile (user_id, … derived columns)` — computed nightly, never trusted as source of truth, always reproducible:

- `top_markets jsonb` — top 5 (state, county) pairs the user has filtered or saved into in the last 90 days
- `signal_affinity jsonb` — relative weights across delta_type derived from `snapScoreClicked` / `propertyViewed` events on properties carrying each signal
- `score_band_preference smallint` — modal SnapScore band the user clicks
- `engagement_decile smallint` — relative engagement among active users (rough — for ops, not for product surfacing)
- `last_active_at timestamptz`
- `last_intel_consumed_at timestamptz` — last time they opened a digest / a watchlist event
- `revisit_count_30d int` — distinct days they returned in last 30

**Use cases (server-side only at first):**
- `user_signal_preferences` defaults derive from `signal_affinity`.
- Empty-state on dashboard pulls from `top_markets`.
- Ops view: "users with high `revisit_count_30d` and zero unlocks this month" = upgrade nudge candidates (not auto-emailed; surfaced to JR).

### Privacy / non-creepiness rules (hard rules)

- **Don't surface derivations to the user that they didn't tell us about themselves.** Showing "we noticed you like water-shutoff properties" reads as surveillance. Use the derivation to *order* what they see; don't *announce* what we know.
- **Don't share inferred preferences cross-org.** Per-user only.
- **Provide a "reset memory" toggle in Settings** that wipes `user_intelligence_profile` rows for that user and clears `user_signal_preferences`.
- **Activity log retention**: 180 days, then drop. Derivations regenerate from rolling window.

### What this enables (Phase 2+)

- Personalized `Index.tsx` dashboard: "Pressure increased in your tracked markets this week" without a feature flag explosion.
- Personalized digest ordering.
- "Resume monitoring" CTA when a user returns after >7 days.

### What this does NOT enable (out of scope)

- Recommending specific deals (that's a Phase 4+ wholesaling feature).
- Predictive distress (mentioned as P2 in the strategy audit; needs Oracle Phase 2).
- Cross-user social ("other investors saved this") — fabricated social proof is forbidden.

---

## 8. Queue + pipeline orchestration design

Snap currently runs **two job patterns**: pgmq (emails) and app-locking-on-rows (`enrichment_agent_jobs`, `foia_request_jobs`). That's fine — they fit different workloads. The recommendation is to *standardize the conventions*, not converge on one tool.

### Decision rule: which pattern for which workload

**Use pgmq when:**
- High-throughput, low-context jobs
- Idempotent or naturally fan-out (signal delta → many watchlist events)
- No human-review fork
- Fast retry tolerated

→ `signal_delta_processing`, `watchlist_event_fanout`, `rescore_property`, `regenerate_brief`, `email_*` (already done)

**Use the app-locking row pattern (current `enrichment_agent_jobs` shape) when:**
- Long-running, expensive, single-actor jobs
- Credential / portal / rate-limit context bound to the row
- Human-review fork is a first-class state (`needs_human_review`)
- Cost matters per attempt

→ `enrichment_agent_jobs` (already), `foia_request_jobs` (already), future `outreach_jobs` (Phase 3, Mercury)

### Standardize conventions across both patterns

1. **Idempotency key everywhere.** `enrichment_agent_jobs.idempotency_key` already exists. Make pgmq workers always check for prior `agent_runs` row by `(agent_name, message_id)` before doing the work.
2. **All jobs log to `agent_runs`.** Whether enqueued via pgmq or row-lock. `agent_runs.job_table` should expand to include `'pgmq:signal_delta_processing'` etc. Don't fork observability.
3. **Retry policy in metadata, not code.** Each job has `retry_policy jsonb` (`max_attempts`, `backoff_ms`, `escalate_to ENUM('dlq','needs_human_review','drop')`). Workers honor it.
4. **DLQ is mandatory for pgmq queues.** Email queue already has this pattern (`auth_emails_dlq`, `transactional_emails_dlq`). Apply same to every new pgmq queue.
5. **Priority semantics are explicit.** `priority smallint` already in `enrichment_agent_jobs`. Define bands: 100=human triggered, 50=event triggered, 10=cron heartbeat. Document.

### Cost-aware execution

- Workers check `ai_budget_envelopes` (see §13) before any LLM-ish job; if over budget, requeue with backoff or `needs_human_review`.
- Long jobs publish heartbeat to `agent_runs.metadata.heartbeat_at` so a watchdog can mark zombie locks.
- Per-queue rate limit lives in `pgmq_queue_config` (new tiny table) so we can throttle Azure OpenAI calls per minute.

### Observability (use what exists)

- `agent_runs` is the single source of truth for "did this run, how long, what cost." Already has tokens / cost / status / duration_ms. Don't replace.
- Add `v_agent_runs_last_hour_by_queue` view for quick dashboard.
- Self-hosted Langfuse on the VM (per master plan) becomes the LLM trace UI; agent_runs.metadata.langfuse_trace_id links them.

---

## 9. Property enrichment evolution strategy

Master plan is explicit: *"No paid APIs by default."* Free-first, selective paid fallback.

### Tiered enrichment ladder (per attribute)

For each attribute (beds, baths, sqft, year_built, owner_occupied, assessed_value, last_sale, flood_zone, census_tract):

| Tier | Source class | Cost | Confidence ceiling |
|---|---|---|---|
| 0 | County bulk download (existing in `enrichment_sources`) | $0 | 0.95 |
| 1 | County GIS / open-data API | $0 | 0.90 |
| 2 | Press-credential FOIA bulk request (Snap moat) | ~$0 (ops cost) | 0.85 |
| 3 | Free aggregator (FCC, Census, OpenAddresses) | $0 | 0.70 |
| 4 | Paid backstop (Regrid, TaxNetUSA, ScraperCity) | $0.01–$0.10/property | 0.95 |

`parcel_attributes` already has `confidence_score` and `source_attribution jsonb` — perfect. Add a `source_tier smallint` column and a `cheaper_source_available bool` flag computed nightly so we can downgrade on next refresh if a free source surfaces.

### Per-jurisdiction routing

`enrichment_sources` already has `(state, jurisdiction, source_type, access_method)`. Augment with derived `enrichment_routing (state, county_fips, attribute_type, preferred_tier, fallback_chain jsonb)` materialized weekly from observed agent_run success rates. This becomes the "policy table" Lyra consults.

### Confidence-aware enrichment

- Only enqueue Tier 4 (paid) if Tier 0–3 produced `confidence_score < 0.70` after N attempts.
- Re-enrich on a long cadence (90 days) for `verification_status='verified'`, faster (30 days) for `'estimated'`, never for `'unknown'` unless explicitly triggered.
- Track per-source success: `source_reliability_scores (source_id, attempts, successes, p50_latency_ms, last_30d_success_rate, computed_at)` — derived nightly from `agent_runs`.

### Source attribution + auditability

`parcel_attributes.source_attribution jsonb` already captures per-attribute provenance. Make this a hard contract: every value MUST carry `(source_id, retrieved_at, run_id)`. Worker validates before insert. This is what lets us tell a customer *exactly* where a fact came from when they ask — that's the difference between a database and an intelligence platform.

### Don't build (yet)

- General-purpose ETL framework. Snap has 5 customers; per-county hand-rolled scrapers under Atlas + Hermes + Nova are the right scale.
- A unified property graph database. Postgres + parcel_attributes is enough.
- ML-based attribute imputation. Confidence scoring is enough; let users see "estimated" badges.

---

## 10. AI Investor Brief evolution strategy

### Consolidate model paths

Current state: `generate-investor-brief` uses Groq Llama-3.3-70B (legacy), `bulk-regenerate-briefs` uses Azure GPT-4o. Master plan target: Azure OpenAI `gpt-5.4-mini` for drafting, `gpt-5.4-nano` for classification. **Unify behind one orchestrator function** (`ai-orchestrator`) with `model_route` selected by `task_type`. The bug `classifyTaskModel` returning null (master plan §gaps) is the blocking fix.

### Brief regeneration triggers (event-driven, not polling)

A brief should be regenerated *only when* one of:
- New `signal_delta` of type `new_open_violation`, `enforcement_escalation`, `water_shutoff_added`, `repeat_offender_threshold_crossed` (severity ≥ 60)
- `properties.snap_score` change ≥ 10 since last brief
- Manual user request (existing path), still rate-limited at 10/property/user/day
- Brief is missing AND property is in any user's watchlist (one-time backfill)

Crucially: **do not regenerate** on cosmetic property updates, cron heartbeats, or system-wide rescore runs. The decision table from §4 governs this.

### Caching + idempotency

`ai_brief_generations` (new):

```
(id uuid, property_id uuid, prompt_version text, model text, input_hash text,
 brief_text text, structured_output jsonb, tokens_in int, tokens_out int,
 cost_usd numeric(10,6), trigger ENUM('user_request','signal_delta','backfill','cron'),
 trigger_signal_delta_id uuid NULL, generated_at timestamptz, langfuse_trace_id text)
```

- Before generating: hash inputs (`property_id` + `latest_snapshot_hash` + `prompt_version`); if a prior row matches → return cached. Effectively memoize against snapshot state.
- `properties.investor_insight_brief jsonb` becomes a *pointer* to the latest `ai_brief_generations.id`, not the source of truth. Lets us A/B prompt versions and roll back.

### Delta briefs

Once `signal_deltas` exists, the brief format extends with a `since_last_visit` paragraph keyed off the user's `last_seen_at` for that property. The brief becomes time-aware: "*Since you last viewed this on April 18, two new structural citations were filed and the case is now open 142 days.*" That sentence alone is the difference between "AI summary" and "intelligence platform."

### Hallucination prevention

- **Templated, evidence-bound prompts.** Pass the actual violation list as structured JSON, not free-form context. Require the model to cite which violation it's referencing in `structured_output.citations[]`. Reject and re-prompt if `citations.length === 0`.
- **No motivation / sale claims.** Onboarding already establishes "we don't claim owners want to sell." Bake into the system prompt as a hard constraint with an `isCleanBrief` validator (already exists in `bulk-generate-missing-insights`).
- **Confidence floor.** Brief output includes a `confidence_band ENUM('low','medium','high')`. Low → render with a warning marker.

### Cost controls

- Token budget per generation: stay at current 1500. Target output ≤ 400 tokens.
- `gpt-5.4-nano` for the *classification* pass (action_label, signal_tags); `gpt-5.4-mini` for the *drafting* pass. Two-stage: classify → draft, with classification cached.
- Per-user / per-org monthly envelope (§13).
- Refuse generation if input has zero usable signals (`signal_count_total === 0`) — render the existing rule-based fallback in `InvestorInsightCard.tsx` (already shipped).

---

## 11. Retention infrastructure strategy

The frontend monitoring evolution PR (#159, merged 2026-05-08) shifted the *language*. The backend has to deliver the *substance*. Three loops:

### Loop 1 — Watchlist event loop (weekly)

- User saves market or property.
- Signal-delta engine fires events into `watchlist_intelligence_events`.
- Weekly digest pulls `top_events_for_user(user_id, last_7d)` ordered by severity.
- Email links straight to `/saved` with a query param highlighting the changed property.
- Open-rate / click-rate logged into `email_send_log` (already exists).

This is the single most important retention mechanism. The email is only useful if it's *true* — that's why §5 has to exist first.

### Loop 2 — In-app return loop

- On app load, if `now - user.last_active_at > 7 days` AND there are unread events, show a small ribbon: "X changes since you last visited." No modal.
- Ribbon links to a filtered Live Feed scoped to user's events.
- Closing the ribbon is logged; don't show again that session.

### Loop 3 — Score-band drift loop

- When a saved property's `snap_score` *crosses* a band threshold (≥75, ≥50, ≥25), generate a `pressure_increasing` or `pressure_fading` delta.
- Surface in the property card with a small chevron indicator (frontend-only follow-up, requires `delta` join).

### Anti-patterns to refuse explicitly

- Daily emails. The cadence is tied to enforcement reality (weekly).
- Re-engagement spam to inactive users without new signals. If nothing changed, don't email.
- Streak / gamification mechanics. Wrong audience.
- Notifications outside business hours. Already implicit; codify in `weekly-digest` (don't send before 8am local).

### Metrics to instrument

- `watchlist_event_seen_rate` — % of inserted events with a non-null `seen_at` within 7 days
- `digest_to_unlock_conversion` — digest opens that lead to an unlock within 72h
- `monthly_revisit_rate` — % of users active in N consecutive 7-day windows
- `severity_calibration` — for each `delta_type`, what fraction of fired events get clicked? (Tells us our severity scoring is wrong if `water_shutoff_added` clicks low.)

These become the dashboard JR uses to know whether the intelligence is actually intelligent.

---

## 12. Operational automation strategy

Operational pieces fan out from agent_runs, which is already great.

### Source reliability scoring

Nightly cron computes `source_reliability_scores` from `agent_runs` filtered by source: success rate, p50 latency, error class distribution. Source with `last_30d_success_rate < 0.5` over 30 attempts → auto-flag `enrichment_sources.status='unverified'` and post to `v_jurisdictions_needing_verification`. Already have the view. Just need the writer.

### Stale data detection (cron, nightly)

Existing `v_stale_jurisdictions` flags FOIA sources with no response in 90 days. Extend to:
- Properties whose `MAX(violations.last_seen_at)` is older than the jurisdiction's SLA
- Saved markets whose underlying jurisdiction is stale (so we can warn the user: "this market hasn't been refreshed in 14 days")

### Auto-recovery

- 3 consecutive failed `agent_runs` for the same `(agent_name, jurisdiction)` → enqueue a `health_check_job` that uses a different credential / backoff window.
- 3 failed health checks → escalate to `needs_human_review` + Discord ping (per master plan, JR is solo).
- Stuck `locked_at` (>2× expected duration) → watchdog releases the lock.

### Observability dashboard

Use the existing 8 `v_*` admin views as Mission Control. Add three:
- `v_signal_deltas_last_hour` — sanity check the delta engine is firing
- `v_watchlist_events_last_24h` — event volume
- `v_ai_cost_by_user_30d` — cost spread

Single page, server-rendered, admin-gated. No new BI tooling.

### Don't build

- Datadog / Sentry / external APM. Console + Langfuse + agent_runs is the stack.
- A unified ops UI with live-updating dashboards. Server-rendered admin pages on `/admin/*` are sufficient at this scale.

---

## 13. Cost-control architecture

### `ai_budget_envelopes` (new)

```
(id uuid, scope ENUM('global','org','user'), scope_id uuid NULL,
 month text,                  -- '2026-05'
 token_cap int, cost_cap_usd numeric(8,2),
 tokens_used int DEFAULT 0, cost_used_usd numeric(8,2) DEFAULT 0,
 soft_threshold_pct smallint DEFAULT 80,
 hard_action ENUM('block','queue','warn'),
 updated_at timestamptz)
```

- Global cap is the master kill switch (default to e.g. $300/mo per master plan).
- Per-user caps optional; surface when needed.
- Workers consult the envelope via a `fn_can_consume_ai(scope, scope_id, estimated_tokens)` SQL function inside the same transaction that creates `agent_runs`. Atomic. No race.
- Crossing soft threshold → emit `ai_budget_warning` to admin Discord (re-using existing Discord ping).
- Hard cap → `hard_action`: block (refuse), queue (defer to next month), or warn (log + proceed). Default `queue` for batch jobs, `block` for user-triggered briefs (with a clear UX).

### Selective execution rules (deterministic, before any LLM call)

The decision table in §4 enforces *what* runs. The envelope enforces *how much*. Together they prevent runaway cost.

- AI brief on a property with no usable signals → don't run, render rule-based fallback.
- Bulk brief regen at scale → require explicit `--budget-cap` argument; fail closed.
- Same property regen within 7 days unless triggered by `signal_delta` of severity ≥ 70.

### Caching as cost control

`ai_brief_generations.input_hash` + lookup-before-generate is the single biggest cost saver after `classifyTaskModel`. Same property + same snapshot + same prompt_version → cached. Weekly cron rolls out cache when new prompt_version ships, controlled.

### Per-job cost telemetry

Already in `agent_runs.cost_usd`. Surface via:
- `v_ai_cost_by_agent_30d`
- `v_ai_cost_by_trigger_30d` (so we can see "regenerations triggered by user_request vs signal_delta vs backfill")
- `v_ai_cost_by_user_30d`

JR makes weekly review against these views part of the operating cadence.

---

## 14. Recommended database / event models

Concise schema sketch (new tables only; existing tables untouched except where noted):

```
-- §4–5 freshness + delta foundation
violation_events              -- append-only event log
property_snapshots            -- sparse snapshots, payload_hash dedup
signal_deltas                 -- materialized, classified deltas
jurisdiction_freshness        -- (state, county_fips, source_type) SLA + last_fresh_at
v_property_freshness          -- view, NOT a column
v_property_timeline           -- view over (violation_events ∪ signal_deltas)

-- §6 watchlist + monitoring
saved_markets
user_signal_preferences
watchlist_intelligence_events

-- §7 investor memory (derived)
user_intelligence_profile     -- nightly batch, never source of truth

-- §10 AI orchestration
ai_brief_generations          -- audit + cache
ai_budget_envelopes           -- cost control

-- §12 ops
source_reliability_scores
v_signal_deltas_last_hour
v_watchlist_events_last_24h
v_ai_cost_by_user_30d
```

### Existing-table touches (additive)

- `properties`: optional pointer column `latest_brief_id uuid REFERENCES ai_brief_generations(id) NULL` for fast read joins. Don't drop the existing `investor_insight_brief jsonb` until pointer is fully populated.
- `violations`: trigger only — no schema change.
- `enrichment_sources`: add `source_tier smallint NULL` (computed nightly).
- `parcel_attributes`: add `cheaper_source_available bool DEFAULT false`.

### Event names (the contract layer)

Keep the namespace flat and stable. Once a name ships in pgmq, don't rename:

```
violation.observed
violation.status_changed
property.snapshot_taken
signal.delta_emitted
property.rescore_requested
brief.regenerate_requested
watchlist.event_emitted
jurisdiction.staleness_changed
agent.budget_exceeded
```

---

## 15. Queue / event recommendations

| Queue | Pattern | Producer | Consumer | Retry | DLQ |
|---|---|---|---|---|---|
| `signal_delta_processing` | pgmq | violations trigger | delta worker | 3, expo-backoff | yes |
| `rescore_property` | pgmq | delta worker, cron | rescore worker | 3 | yes |
| `regenerate_brief` | pgmq | delta worker, user request | ai-orchestrator | 2 | yes |
| `watchlist_event_fanout` | pgmq | delta worker | fanout worker | 3 | yes |
| `enrichment_agent_jobs` | row-lock (existing) | event-driven + cron | Atlas/Hermes/Nova | per-job policy | needs_human_review |
| `foia_request_jobs` | row-lock (existing) | cron + manual | Atlas/Jane | per-job policy | needs_human_review |
| `auth_emails` / `transactional_emails` | pgmq (existing) | various | process-email-queue | 5 | yes |
| `outreach_jobs` (Phase 3, future) | row-lock | sequence engine | Mercury | per-job policy | Ares review |

**Deliberate non-queue:** SnapScore *computation itself* stays a function call inside the rescore worker, not a separate queue. Adding more hops adds latency and observability burden without isolation benefit.

---

## 16. Rollout phases (P0 / P1 / P2 / P3)

Aligned with master plan's 5-phase model. **P0 is largely shipped.**

### P0 — Foundation (DONE / mostly done)
- ✅ enrichment_agent_jobs / sources / parcel_attributes
- ✅ foia_request_jobs / sources / responses
- ✅ agent_runs polymorphic observability
- ✅ 8 v_* admin views
- 🔲 `classifyTaskModel` fix (master plan: this week)
- 🔲 Self-hosted Langfuse on VM
- 🔲 Atlas v0 / Hermes v0 / Nova / Aegis

### P1 — Freshness + Delta + Watchlist (next, ~30 days)

This is the **most important next implementation phase** — it creates the moat.

1. Add `violation_events`, `property_snapshots`, `signal_deltas`, `jurisdiction_freshness`.
2. Trigger on `violations` INSERT/UPDATE → `signal_delta_processing` pgmq.
3. Delta worker (deterministic Postgres function + lightweight Deno worker) classifies and writes deltas. **No LLM yet.**
4. Add `saved_markets`, `user_signal_preferences`, `watchlist_intelligence_events`.
5. Fan-out worker.
6. `weekly-digest` rewritten to consume watchlist events; old global path is fallback.
7. Frontend: small ribbon "X changes since last visit" + "Track this market" CTA on Leads page (separate frontend PR after backend lands).

### P2 — AI Orchestrator + Cost Envelope (~30 days)

1. `ai-orchestrator` edge function consolidates brief generation paths.
2. `classifyTaskModel` working + 2-stage (nano classify, mini draft).
3. `ai_brief_generations` + `ai_budget_envelopes`.
4. Brief regen triggered by signal_deltas.
5. `properties.latest_brief_id` populated; old `investor_insight_brief` jsonb deprecated (kept for read).

### P3 — Investor Memory + Operational Automation (~30 days)

1. `user_intelligence_profile` nightly batch.
2. `user_signal_preferences` defaults derived from activity log.
3. `source_reliability_scores` nightly.
4. Auto-recovery + watchdog.
5. Per-user AI budget envelopes (admin-set, default null = global only).

### P4+ — Outreach (master plan Phase 3) and Wholesaling (Phase 4)

Out of scope for this design doc. The infrastructure above is what those phases stand on.

---

## 17. Risks / tradeoffs

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Delta engine emits noisy deltas → users distrust digest | Medium | High | Conservative `delta_type` whitelist; severity floor 60 for digest; calibrate via `severity_calibration` metric |
| Snapshot table grows unbounded | Medium | Medium | Sparse-write rule + `payload_hash` dedup; 365-day retention with compress-to-hash for older rows |
| AI cost spike during brief regen backfill | Medium | High | Hard envelope cap; backfill prioritized by `is_in_any_watchlist` first |
| Watchlist fan-out creates write amplification | Low | Medium | Insert with `ON CONFLICT DO NOTHING`; per-user/24h cooldown; partial index on `(user_id, seen_at IS NULL)` |
| `ai-orchestrator` consolidation breaks legacy briefs | Medium | Medium | Run both paths in parallel for 2 weeks; compare outputs offline before cutover |
| pg_cron / pgmq concurrency stalls | Low | Medium | Watchdog watcher; alert in Mission Control; pgmq is at 0.06/sec in master plan, far from limits |
| Saved markets get RLS wrong → user sees others' markets | Low | Critical | RLS pattern: `auth.uid() = user_id`; admin-only writes from service role; mandatory unit test on RLS |
| Adding `violations` triggers slows ingestion | Medium | Medium | Triggers must be idempotent + cheap; heavy work goes to pgmq worker, not the trigger |
| Snapshot diff worker becomes bottleneck | Low | Medium | Concurrent workers (pgmq supports it); priority lanes for watchlist-affecting properties |
| `user_intelligence_profile` derivations feel creepy | Medium | High | Don't surface inferred preferences as text; use them only to order; provide reset toggle |

The single biggest risk is **emitting bad deltas**. If "fresh" is wrong, the entire intelligence narrative collapses. Hence the conservative `delta_type` enum and severity floor.

---

## 18. What NOT to build yet

- **Real-time streaming (websocket / SSE).** Polling + 30s React Query stale time is sufficient. Real-time is a Phase 4+ wholesaling concern, not a Phase 2 monitoring concern.
- **A graph database / Neo4j.** Property relationships are tabular. Don't reinvent.
- **A separate event bus (Kafka / Redpanda).** pgmq is fine for years.
- **A vector store / embeddings-driven recommender.** pgvector exists, save it for AI brief similarity (Phase 3+) — don't build now.
- **A unified BI tool / Superset / Metabase.** Postgres views + admin pages.
- **Per-jurisdiction microservices.** Hand-rolled per-county scrapers under Atlas + Hermes is the right design at this scale (master plan §honest constraint).
- **Predictive distress / ML models.** Oracle Phase 2 + customer feedback events; no ML before there's labeled outcomes (Phase 4+).
- **A "saved searches that re-run automatically" cron.** `saved_markets` does not need re-execution; events fan out via signal_deltas. Re-running searches is wasted compute.
- **Cross-user social proof / "X investors saved this".** Forbidden.
- **A general workflow engine (Temporal / Airflow).** pgmq + cron + agent_runs covers Snap's needs.
- **Per-user AI fine-tuning.** Costly, low ROI at this scale.
- **A separate analytics warehouse.** Postgres + materialized views.

---

## 19. Most important next implementation PR

**Title:** `feat(p1): freshness foundation — violation_events + property_snapshots + signal_deltas + delta worker`

**Scope (single PR, additive only):**

1. Migrations
   - `violation_events` (append-only event log + indexes)
   - `property_snapshots` (sparse snapshots, payload_hash unique per property)
   - `signal_deltas` (typed delta stream)
   - `jurisdiction_freshness` (per-county SLA)
   - Trigger function on `violations` INSERT/UPDATE → `pgmq.send('signal_delta_processing', …)`
   - `pgmq.create('signal_delta_processing')` + `signal_delta_processing_dlq`
   - View `v_property_timeline`
   - View `v_signal_deltas_last_hour` (admin)
   - 6 enum values for `delta_type` (start small)

2. Edge function `signal-delta-worker`
   - Consumes `signal_delta_processing` queue
   - Loads prior `property_snapshots` row
   - Classifies via deterministic Postgres function `fn_classify_deltas(prev, next)`
   - Writes `violation_events`, `property_snapshots`, `signal_deltas` in one transaction
   - Logs to `agent_runs` with agent_name `'signal_delta_worker'`
   - **No LLM. No watchlist fan-out yet.** Just the foundation.

3. Mission Control
   - Add 2 cards on `/admin/monitoring`: signal_deltas/hr, snapshots/hr.

4. Tests
   - Trigger fires on `violations` insert
   - Worker is idempotent (replay safe)
   - Deterministic classification produces stable output
   - RLS: deltas readable only by admins (until P1.5 watchlist fan-out)

**Why this PR first:** every other recommendation in this doc — watchlist fan-out, AI brief regen on change, freshness UX, retention loops — is a thin layer on top. Without it, "intelligence platform" is a marketing claim. With it, it's a system property.

**Hard rules for the PR:**
- No new AI calls.
- No changes to SnapScore computation.
- No changes to brief generation.
- No changes to billing / unlock / export.
- RLS admin-only on new tables until §6 fan-out lands.
- Rollback script (drop tables + drop trigger) included.
- Must succeed against the staging DB before main.

---

## 20. Which systems create the strongest long-term moat

Ranked by long-term defensibility, not short-term value:

1. **The signal-delta engine.** Every competitor can buy or scrape code violations. Almost no one can answer *"what changed and why does it matter"* per property, per user, per day. This is the moat.
2. **Per-county / per-source reliability + FOIA process IP.** Master plan calls this out (§moat). The press-credential rotation, the per-portal Atlas templates, the per-jurisdiction routing in `enrichment_routing` — that's the Clearbit moat. Not data; pipeline.
3. **Customer-feedback-trained Oracle (SnapScore).** Outcome data feeding back into scoring. Every closed deal in Marion County makes the scorer smarter for Marion County. Per-county silo effect. Competitors entering a new county start at zero; we start at month-N labeled outcomes.
4. **Watchlist intelligence + investor memory.** Once a user has 14 saved markets, their preference graph dialed, and 6 months of digests they trust, the switching cost is real. This is the SaaS retention moat.
5. **Compliance architecture (Ares).** Future, but listed because it's the moat that becomes existential (master plan: "the safe PropTech" sales message after the next FTSA class action).
6. **AI orchestrator + cost discipline.** Lower-priority moat — but the cost-aware design is what makes the unit economics defensible at scale. Competitors that don't budget will run out of runway before they catch up.
7. **Source attribution / data lineage.** Boring but defensible. "Where did this fact come from, when, and via which source?" — that's the difference between a database product and a data infrastructure product. Enables future B2B / API tier (master plan Phase 5: $1,999/mo data tier, hedge funds, iBuyers).

The first three are the moats Snap should *invest the most* in. The last four are moats Snap should *not lose* by skipping.

---

## Implementation gate — verified 2026-05-08

- [x] **pgmq extension installed.** `supabase/migrations/20260410001627_email_infra.sql:13` — `CREATE EXTENSION IF NOT EXISTS pgmq;`. Reachable via the SECURITY DEFINER wrapper functions in the same migration (lines 131–164: `enqueue_email`, `read_email_batch`, `delete_email`, `move_to_dlq`).
- [x] **pg_cron extension installed and actively scheduling.** `20260116015713:2` — `CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions`. Two live jobs: `weekly-digest-email` (Mon 13:00 UTC) and `revalidate-integrations` (daily 03:00 UTC).
- [x] **`violations` is the right hook table.** Created at `20250919212701:41`. Direct `INSERT INTO violations` from edge functions (`process-upload`, `reprocess-upload-job`). No staging-to-violations flow.
- [x] **Admin-only RLS pattern available.** Existing P0 pattern `has_role(auth.uid(), 'admin'::app_role)` (e.g. `20260421011308:40-45` distress_events policy). For service-role-only append, the `auth.role() = 'service_role'` pattern from `email_send_log` (`20260410001627:40-60`) is the template.
- [x] **No naming conflict for `violation_events`.** Legacy `audit_events` was DROPPED in `20251006003730:4`. `distress_events` (live) is a narrower table — no name overlap.
- [x] **P0 tables in place.** `enrichment_agent_jobs`, `agent_runs`, `foia_request_jobs`, `foia_sources`, `foia_responses`, `parcel_attributes`, `enrichment_sources` all created in the `20260507194800_*` through `20260507224634_*` migration batch (PR #156).
- [x] **pgmq DLQ pattern documented.** `20260410001627:17-22` for queue creation, `:174-189` for `move_to_dlq` defensive wiring (auto-create DLQ on undefined_table). Mirror this pattern for `signal_delta_processing` + `signal_delta_processing_dlq`.

### Coexistence constraints (NEW — discovered during prereq check)

- **`trg_log_new_violation`** already fires AFTER INSERT on `violations` and writes to `distress_events` (`20260421011308:152-155`). The §19 PR's new trigger must **coexist** — both fire on the same INSERT. They write to different targets (`distress_events` vs. our new `violation_events` + pgmq enqueue). Use a distinct trigger name (e.g. `trg_enqueue_signal_delta_processing`) and keep the body cheap (single pgmq.send) so it never delays ingestion.
- **`trg_log_snapscore_change`** fires AFTER UPDATE OF snap_score on `properties` and also writes to `distress_events` (`20260421011308:99-103`). The signal-delta worker should READ from `distress_events` as supplementary input for the `pressure_increasing` / `pressure_fading` delta types — it's a free signal we already record. Don't duplicate the firing logic; classify on top of it.
- **`update_violations_updated_at`** is a BEFORE UPDATE timestamp-only trigger (`20250919212701:205-208`). Harmless. No interaction.

The §19 PR is unblocked. The two distress_events triggers above are not blockers — they're an opportunity. The new architecture should treat `distress_events` as a sibling event stream (not replace it) and the signal_delta_worker should consume both `violations` events and existing `distress_events` rows when classifying.
