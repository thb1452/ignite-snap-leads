

# Plan: Snap Ignite CRM — Phase-by-Phase Build (Living Lead First)

This is a strategic build plan that takes the research findings and translates them into a concrete, phased roadmap that fits Snap Ignite's existing architecture (properties, violations, SnapScore, BYOA integrations, credit system, FOIA pipeline).

The thesis is locked: **build the only CRM where the distress signal is a first-class object.** Everything else is parity work.

---

## Phase Sequencing — Why this order

```text
Phase 3: Lead Pipeline + CSV Import      → table stakes, unblocks everything
Phase 4: Living Lead + Distress Timeline → THE moat, unique to Snap Ignite
Phase 5: SMS + Drip Engine (BYOA Twilio) → leverages Phase 2 BYOA work
Phase 6: Distress-Triggered Automation   → only possible after 4+5
Phase 7: Dialer + Call Logging           → parity feature
Phase 8: KPI Dashboard + E-sign + Cash Buyers → parity completion
```

Phases 3–6 are the differentiated wedge. Phases 7–8 are "good enough so nobody leaves."

---

## Phase 3 — Lead Pipeline + CSV Import (3–4 weeks)

**Goal:** Turn an unlocked property into a *lead* with a status, owner, and pipeline stage.

### New tables
- `leads` — `id`, `org_id`, `property_id` (FK), `owner_id` (FK to `owners`), `stage_id`, `assigned_to`, `priority`, `source`, `notes`, `last_contacted_at`, `next_follow_up_at`, timestamps
- `pipeline_stages` — `id`, `org_id`, `name`, `order`, `color`, `is_won`, `is_lost`
- `lead_activities` — `id`, `lead_id`, `actor_id`, `activity_type` (note/call/sms/email/stage_change/distress_event), `payload`, `created_at`
- `lead_tags` + `lead_tag_assignments`

### RLS
All tables scoped to `org_id`. Reuse the `org_id` resolver from `_shared/byoa/auth.ts`.

### UI
- `/crm/pipeline` — kanban board grouped by stage (drag-and-drop using existing dnd patterns)
- `/crm/leads/:id` — lead detail page (left: property panel reusing `PropertyDetailPanel`; right: activity timeline)
- "Add to Pipeline" button on `PropertyCard` and `PropertyDetailPanel`
- CSV import wizard reusing `CsvLocationDetector` + `process-upload` patterns; column mapper for owner/phone/notes

### Default stages seeded per org
`New → Researching → Contacted → Negotiating → Under Contract → Closed Won / Closed Lost`

---

## Phase 4 — The Living Lead (4–6 weeks) **← THE MOAT**

**Goal:** Every lead's record continuously reflects underlying property distress data. This is the one feature no competitor can replicate.

### New tables
- `distress_events` — `id`, `property_id`, `event_type` (snapscore_change | new_violation | water_shutoff | lis_pendens | tax_delinquency | code_escalation), `severity`, `delta` (jsonb: before/after), `detected_at`, `source`
- `lead_watch_subscriptions` — `id`, `lead_id`, `event_types[]`, `min_severity`, `notify_channel`

### Database triggers (deferred until tested)
- AFTER UPDATE on `properties` → if `snap_score` delta ≥ 15 → insert `distress_events`
- AFTER INSERT on `violations` → insert `distress_events` for any property with active leads
- AFTER INSERT on `water_shutoffs` → insert with severity = critical

### Edge functions
- `distress-event-fanout` — triggered by `pg_net` on new `distress_events`; resolves all leads attached to the property, fires notifications, updates `lead_activities`
- `lead-rescore` — nightly cron that recomputes lead priority using the latest SnapScore + event recency

### UI on lead detail page
- **Distress Timeline** component — vertical timeline showing every event since lead was created (color-coded by severity, icons by event_type)
- **Live SnapScore badge** with delta indicator (↑15 in 30d)
- **"Why this lead is hot right now"** AI-generated one-liner using existing brief generator, refreshed when new events arrive

### Realtime
Subscribe to `distress_events` filtered by `property_id IN (user's lead property_ids)` so the timeline updates without refresh.

---

## Phase 5 — SMS + Drip Engine via BYOA Twilio (4–6 weeks)

**Goal:** Outbound SMS using the customer's own Twilio account (already wired in Phase 2).

### New tables
- `sms_threads` — `id`, `lead_id`, `from_number`, `to_number`, `status`
- `sms_messages` — `id`, `thread_id`, `direction`, `body`, `twilio_sid`, `status`, `cost_cents`, `sent_at`
- `drip_sequences` — `id`, `org_id`, `name`, `trigger_type` (manual | stage_change | distress_event), `trigger_config` (jsonb)
- `drip_steps` — `id`, `sequence_id`, `order`, `delay_hours`, `channel` (sms | email | task), `template_body`, `branch_condition`
- `drip_enrollments` — `id`, `lead_id`, `sequence_id`, `current_step`, `next_run_at`, `status`

### Edge functions
- `drip-runner` — cron every 5 min, processes due `drip_enrollments`, calls `integration-send-sms` per step, advances enrollment
- `sms-inbound-webhook` — Twilio webhook receiver; matches inbound SMS to thread by phone number, auto-pauses any active drip enrollment for that lead, logs to `lead_activities`

### Compliance
Reuse the Phase 2 `_shared/byoa/compliance.ts` for TCPA quiet hours + state blocks. Add per-org STOP/HELP keyword handling that writes to the existing `suppression_list`.

### UI
- SMS inbox at `/crm/inbox` — left rail: threads sorted by last activity; right pane: conversation view with template insertion
- Drip builder at `/crm/sequences` — visual step editor with branch nodes for distress_event triggers

---

## Phase 6 — Distress-Triggered Automation (3–4 weeks) **← UNIQUE**

**Goal:** Drip sequences that branch on *why* the lead is distressed.

### Mechanism
A `distress_event` insert triggers `distress-event-fanout`, which evaluates active `drip_sequences` whose `trigger_type = 'distress_event'` and whose `trigger_config` matches the event. Matching leads get auto-enrolled or branched.

### Pre-built sequence templates seeded per org
- **Pre-foreclosure cadence** — 5 SMS over 14 days, escalating urgency
- **Code violation escalation** — triggered when violation count goes 1→2; weekly check-ins
- **Water shutoff (72-hour hot)** — triggered immediately on shutoff event, 3 SMS in 72h, then call task
- **SnapScore surge** — triggered when score jumps ≥15 in 30d, 1 SMS + manager notification

### UI
On the drip builder, add a "Trigger on distress event" node type with dropdowns for event_type and severity. Show a preview of how many existing leads would qualify.

---

## Phase 7 — Dialer + Call Logging (4–6 weeks, parity)

- Twilio Voice SDK (BYOA, same vault pattern as SMS)
- Click-to-call from any lead/property card
- Auto-log call duration, recording URL, disposition picker after hangup
- `call_logs` table joined to `lead_activities`

Defer power dialer (sequential auto-dial) to Phase 7.5 if customer signal demands it.

---

## Phase 8 — KPI Dashboard + E-sign + Cash Buyers (3–4 weeks, parity)

- `/crm/dashboard` — leads by stage, conversion funnel, SMS response rates, cost per deal (using `integration_action_log.cost_usd`)
- E-sign via DocuSign or HelloSign edge function; templated assignment contracts
- `cash_buyers` table + simple "blast deal to buyers in ZIP/price band" feature (Phase 1 dispo parity, not full dispo CRM)

---

## What we're NOT building

- MLS/IDX integration
- Landing page builder (integrate with Carrot via webhook)
- Ringless voicemail (TCPA risk, declining)
- Full driving-for-dollars mobile app (DealMachine owns it)
- White-label SaaS / GHL snapshots
- Generic Zapier-style automation (only distress-aware triggers)
- Native dispo CRM beyond cash-buyer blast (Phase 2 decision based on signal)

---

## Pricing (recommendation, not in this build)

Adopt the research's three-tier structure when CRM ships:
- **Hunter** $129/mo solo
- **Pipeline** $279/mo team (5 seats)
- **Ignite Scale** $549/mo (15 seats)

Bundled skip-trace, bundled SMS, no setup fee, 30-day refund, pause-not-cancel. This is a marketing/billing change, not a code change for Phase 3.

---

## What I need from you to start Phase 3

Three decisions:

1. **Org model** — Phase 1 added `profiles.org_id`. Do leads belong to the org (team-shared) or to the individual user who unlocked the property? Recommendation: **org-shared with per-user `assigned_to`** (matches REsimpli/InvestorFuse).

2. **Property → Lead conversion trigger** — Auto-create a lead when a user *unlocks* a property, or only when they explicitly click "Add to Pipeline"? Recommendation: **explicit click** to keep the pipeline curated and avoid noise.

3. **CSV import scope for Phase 3** — Just owner contact data into existing properties, or also allow importing properties not yet in the Snap Ignite database (creating shells)? Recommendation: **owner contact only** in Phase 3; defer property-shell creation to Phase 4 once distress eventing is stable.

Once you answer these (or approve the recommendations), I'll output the Phase 3 migration SQL for your review before applying.

