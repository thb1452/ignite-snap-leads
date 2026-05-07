# Snap Ignite — Master Plan

**Owner:** JR (Snap Intelligence LLC)
**Last updated:** May 7, 2026
**Status:** Pre-Phase-1. Site live, 5 paying customers, VA layer gone, agents being built.

---

## TL;DR (read this first)

Snap Ignite is two businesses on one stack:

1. **Snap Ignite SaaS** — proprietary code-violation + water-shutoff + distress data sold to wholesalers. 5 paying customers. Launched March 7, 2026.
2. **JR Wholesaling (personal P&L)** — JR uses the same data + multi-channel outreach to close assignment fees. Customer zero of his own platform.

Combined 12-month target: **$1M revenue** ($700–900K wholesaling + $150–300K SaaS ARR).

The VAs that used to keep the data fresh are gone. Until autonomous agents replace them, the data is stale, the SaaS is at risk of churn, and wholesaling is impossible to do honestly. **The agents are the business.**

The plan: build the agent stack in 5 phases over ~150 days. Wholesaling activates last (Phase 4), after data is fresh, attributes are verified, buyer's list is built, and compliance is bulletproof.

---

## The Mental Model

### What Snap Ignite actually is

Not generic real estate software. It's:
- An **enforcement intelligence platform** (code violations, water shutoffs, liens)
- A **motivated seller signal engine** (SnapScore stacks distress signals)
- A **municipal distress intelligence network** (FOIA pipeline across 11,000+ jurisdictions)
- An **investor workflow system** (filter, unlock, contact)
- A **recurring monitoring platform** (re-FOIA on cadence, freshness)

### The moat (in priority order)

1. **Press-credential rotation pool** — 4 legitimate press outlets (codewatchers.org, groundtruthops.org, civicrecords.it.com, dataresearch.blog), 5-month per-jurisdiction cooldown, deliverability tracking. Six months of production ops behind it. Not replicable with money alone.
2. **Per-county SnapScore calibration** — every closed deal teaches the model about that specific county. County-siloed data scale effect. Competitors entering Miami-Dade start at zero; we have customer-labeled outcomes.
3. **FOIA ingestion pipeline as process IP** — portal templates, Playwright scripts, CAPTCHA handling, schema normalization across 3,000+ counties. The Clearbit moat: their pipeline, not their data.
4. **Compliance architecture as a weapon** — Ares gates every message before dispatch. When the next competitor catches an FTSA class action, "the safe PropTech" becomes the sales message.
5. **Code violations as a category** — PropStream/BatchLeads/DealMachine don't offer national code violations. We own this until someone replicates the FOIA machinery.

### The honest constraint

JR is solo. No developer, no VAs. Claude (Max plan) + ClawbotJane on the Azure VM are the team. Everything must be buildable by one operator + AI. No microservices, no Kubernetes, no Redis until pgmq breaks at 500+ jobs/sec (currently at 0.06/sec).

---

## The Stack (don't change without reason)

**Infrastructure**
- Azure VM (172.172.160.63, Ubuntu 24.04) — single VM pattern, pm2 + systemd + Docker Compose
- Supabase Postgres (snapignite-prod) — primary database, all extensions enabled
- Extensions: `pgmq` (queues), `pg_cron` (scheduling), `pgvector` (embeddings), `pg_net` (HTTP from DB), `pgcrypto`
- Azure OpenAI: `gpt-5.4-mini` + `text-embedding-3-small` via `snap-ignite.openai.azure.com`
- Frontend: Lovable
- Payments: Stripe live
- Observability: self-hosted Langfuse on the VM (Docker Compose)

**Outreach providers (Phase 3+)**
- Lob — direct mail (always permitted, no TCPA)
- Twilio Voice — cold calls
- Slybroadcast — ringless voicemail (federal TCPA only, wider geographic reach)
- Instantly.ai — cold email
- Twilio SMS + Telnyx — SMS (late-sequence only, post-engagement)

**Skip trace**
- Tracerfy ($0.02) — low-tier
- BatchData ($0.07) — high-SnapScore
- Never: LexisNexis Accurint, TLO (DPPA/GLBA credentialing burden)

**Title**
- Empora Title (default closer for IN/OH/FL/MS/PA/GA/KS, has assignment + double close + RON)

**Dataset**
- 457K+ properties scored with SnapScore v8

---

## The Agent Roster

This is the team. Every agent is a stateless worker consuming pgmq queues, registered in the `agents` table, following Jane's existing pattern.

| Agent | Role | Phase Built | Status |
|---|---|---|---|
| **Jane (ClawbotJane)** | FOIA classification + orchestration | Built | Live |
| **Atlas** | FOIA submission across NextRequest / GovQA / JustFOIA / email | Phase 1 | Building |
| **Hermes** | IMAP polling + response classification + attachment extraction | Phase 1 | Building |
| **Nova** | Address normalization (USPS) + property linking | Phase 1 | Building |
| **Lyra** | Skip trace router (Tracerfy low / BatchData high) | Phase 2 | Pending |
| **Oracle** | Deterministic SnapScore v8 + SHAP reason codes + weekly calibration | Phase 2 | Pending |
| **Aria** | ARV / comps engine — sub-30-second comp pull | Phase 2 | Pending |
| **Ares** | Deterministic compliance gate (singleton, advisory-locked) | Phase 3 | Pending |
| **Mercury** | Multi-channel orchestrator (Lob + Twilio Voice + Slybroadcast + Instantly + SMS) | Phase 3 | Pending |
| **Sage** | Disposition + buyer's list management | Phase 3 | Pending |
| **Echo** | Content engine (TikTok / Reels / Shorts / LinkedIn) | Phase 3 | Pending |
| **Aegis** | Reflexion self-review (inline node, used by Atlas/Jane/Echo) | Phase 1 | Building |

### Agent design philosophy

- **Stateless workers, stateful queues.** State lives in Postgres. Agents read jobs, do work, write results, exit.
- **Deterministic where possible.** Ares = no LLM. Oracle scoring = no LLM. Compliance and scoring must be auditable.
- **LLM where judgment is needed.** Atlas/Hermes/Jane/Echo use `gpt-5.4-mini`; cheap classification uses `gpt-5.4-nano`.
- **Reflexion (Aegis) on external-facing outputs.** Self-review before anything goes to a customer or government.
- **Idempotency keys on every job.** Re-running a job never produces duplicates.

---

## The 5 Phases

### Phase 1 — Data Foundation + FOIA Agents (Days 1–30)

**Goal:** Stop the bleeding. Replace the VA layer for FOIA + data freshness. Get the SaaS data flowing again.

**Deliverables**
- P0 schema PR (the additive infrastructure):
  - `property_enrichment` + `parcel_attributes` (bed/bath/sqft + normalized property data)
  - `enrichment_jobs` + `enrichment_sources` + `enrichment_agent_runs`
  - `foia_request_jobs` + `foia_sources` + `foia_responses` + `foia_agent_runs`
  - `agent_runs` (universal observability)
  - Mission Control admin views (queue depth, stale jurisdictions, failed jobs, needs_human_review queue)
- Migrate 4 press credentials from Zoho to Google Workspace ($28/mo)
- Self-hosted Langfuse on the VM
- Fix `classifyTaskModel` (currently returns null, killing cost routing)
- Atlas v0 — NextRequest + GovQA + email handlers (covers ~75% of portal traffic)
- Hermes v0 — IMAP poller + classifier
- Nova — USPS-deterministic address normalizer
- Aegis — Reflexion self-review wired into Atlas + Jane

**Acceptance criteria**
- Top 5 customer-relevant counties ingesting autonomously
- 50+ FOIAs/day without human intervention
- Langfuse traces visible for every agent invocation
- Cost tracker showing real per-agent spend
- Zero regression on existing 5 paying customers

**Hard rules during Phase 1**
- Additive only. No refactoring of SnapScore, billing, auth, exports, unlock logic.
- No paid APIs by default.
- No mass enrichment of all 457K properties yet — prioritize by customer activity.
- No mass AI brief regeneration.

---

### Phase 2 — Enrichment + Scoring (Days 31–60)

**Goal:** Every property in active customer markets has bed/bath/sqft, verified or estimated with confidence. SnapScore retrains on fresh data. Site relaunch.

**Deliverables**
- Lyra agent — but routing for *enrichment lookups*, not outreach skip-trace yet
- Bulk parcel data ingestion across top 5–10 customer counties:
  - Free path: county bulk downloads (Miami-Dade BBS, county property appraisers)
  - FOIA path: press credentials submit bulk parcel requests for counties without bulk portals
  - Paid backstop: Regrid / TaxNetUSA / ScraperCity for gaps
- Aria agent — ARV / comps engine, sub-30-second pull
- Oracle SnapScore v8 calibration on now-fresh dataset (weekly cron)
- Rehab estimator — extend Oracle's violation severity to $/sqft tiers ($15–25 light / $35–50 medium / $60–80 heavy)
- Customer-visible confidence indicators ("✓ Verified attributes" vs "⚠ Estimated")
- Site relaunch announcement to existing 5 customers as a major upgrade
- `feedback_events` table activated — customer deal outcomes flow back into Oracle

**Acceptance criteria**
- 80%+ of properties in top 5 counties have verified attributes
- Aria returns 5 comps + median $/sqft + suggested ARV in <30 seconds
- Oracle retrains weekly without breaking; Brier score doesn't worsen retrain-over-retrain
- Existing customers don't churn; ideally 1–2 expansion conversions

---

### Phase 3 — Outreach Infrastructure (Days 61–90)

**Goal:** Build everything wholesaling needs *before* wholesaling. Compliance-first. Test in shadow mode against synthetic leads.

**Deliverables**
- Ares compliance gate (deterministic, singleton, advisory-locked)
  - State allowlist/blocklist hard-coded:
    - **SMS BLOCKED** (cold): FL, WA, MD, OK, GA, TX, MS, NC, MI, VA (post-1/1/26), MO, SC, CT (post-7/1/26), IL, PA
    - **SMS ALLOWED** (with engagement): IN, OH, AL (limited), KY, LA, AZ, WV, TN (with disclosure)
    - **SC §30-2-50** — never solicit from SC records via any channel
    - **FL FTSA** — never cold-text FL
  - Federal TCPA scrubbing (DNC, internal DNC, STOP)
  - State-specific quiet hours (8am–9pm local)
  - 10DLC throttle awareness
  - Identifying business name + callback number required in first message
- Mercury multi-channel orchestrator
  - Lob (mail) — always permitted
  - Twilio Voice (cold call) — federal TCPA + DNC + state DNC + quiet hours
  - Slybroadcast (RVM) — federal TCPA only, wider geo reach (can RVM into FL/MO/MD where SMS is blocked)
  - Instantly (cold email) — CAN-SPAM
  - Twilio + Telnyx (SMS) — late-sequence only, post-engagement
- Sage agent + `cash_buyers` + `buyer_match_criteria` + `disposition_blasts` tables
  - Buyer's list build for Marion County: cash sales last 12 months → resolve LLCs via IN BSO → skip trace → 50–100 verified buyers
- 10DLC A2P approval should land in this window — wire it up
- Echo content engine — beginner pipeline manual (1 short/day per content engine doc)
- All channels tested in shadow mode against synthetic leads

**Acceptance criteria**
- Mercury can run an 8-week multi-channel sequence end-to-end in test mode
- Ares blocks every test message that violates the rules (zero false-pass on a 100-message audit)
- 50+ verified Marion County buyers in `cash_buyers`
- Echo ships 30+ shorts manually
- Discord/Telegram review channel for human-in-loop approval working

---

### Phase 4 — Wholesaling Activated (Days 91–150)

**Goal:** First deal in Marion County, IN. Data is fresh, attributes verified, buyer's list built, compliance bulletproof.

**The Marion County play (primary market)**
- Indianapolis chosen because: $15K–$20K assignment fees, no license required (disclosure-only), AG-only telemarketing enforcement, free Marion County parcel/GIS via Open Indy, deep distressed pipeline (899 foreclosure starts in first 7 months of 2025, 23% YoY increase per FHCCI)
- Foreign-qualify Snap Intelligence LLC in Indiana (~$90)
- Retain Indianapolis real estate attorney ($500–$1.5K) — IN-specific PSA + assignment + equitable-interest disclosure rider
- Empora Title as default closer
- Marion + Hamilton + Hendricks + Johnson + Boone counties as scoring scope

**The 8-week sequence (per lead)**
1. Week 1: Direct mail #1 (yellow letter via Lob, references specific SnapScore violations)
2. Week 2: Cold call #1 + RVM if no answer
3. Week 3: Cold email #1 (Instantly) if email available
4. Week 4: Direct mail #2 (postcard, different angle)
5. Week 5: Cold call #2 + RVM
6. Week 6: SMS — only if engagement on prior touch (implied consent)
7. Week 7: Direct mail #3 (urgency framing)
8. Week 8: Final cold call + email

80% of deals come from touches 3–7. **SMS is not the lead channel.**

**Pipeline math**
- Pull 30–50 hot leads/week from signal-stack query (SnapScore ≥ 8.5, ≥ 2 violations, equity ≥ 40%, absentee, 10+ year ownership)
- Skip trace via BatchData (~$3.50 per batch)
- 1,000 dials is the number. If first deal misses Day 120, diagnose: list quality, sequence execution, conversion conversation, or buyer's list. Most common miss = didn't dial enough.

**On contract**
- Title to Empora within 24h
- Sage runs disposition: blast top 5 buyers (24h exclusive) → full list (48h)
- Reprice if no bite in 48h
- Aria runs ARV; rehab estimator runs from violation profile × sqft

**First close target: Day 120–150. First $15K assignment fee.**

**Acceptance criteria**
- 1+ closed deal
- First close documented as TikTok content via Echo ("Made $XXK on this Indy house — caught it on Snap Ignite three days early")
- Feedback events flow back to Oracle for retraining
- Playbook documented in Notion/Supabase for replication

---

### Phase 5 — Scale (Day 150+)

**Goal:** Replicate playbook to second + third markets, launch SaaS API tier, deepen the moat.

**Deliverables**
- Add Cleveland, OH (Cuyahoga County) — deal #2. Empora handles. Add OH SB 155 disclosure rider.
- Add Birmingham, AL (Jefferson County) — deal #3. Vet AL title via Magic City REIA.
- Do NOT exceed 5 simultaneous markets as solo operator.
- API tier launch for SaaS at $1,999/mo for volume wholesalers and hedge funds
- Per-county SKUs:
  - Miami-Dade ($299), Houston-Harris ($299), Maricopa ($249), Cook ($249), Fulton-DeKalb ($199)
  - RLS policies gate access; Stripe sub separate
- Whitepaper: "State of Code Enforcement in America 2026" — first empirical benchmark of code-violation → sale conversion. Drives press, recruits cities, brand moat.
- Pursue 3–5 exclusive county data-feed MOUs (offer cities small revenue share or free transparency dashboard in exchange for bulk feed)

**Acceptance criteria**
- $50K MRR
- 3+ county-exclusive relationships
- API customers in pipeline
- Whitepaper with at least 1 major outlet pickup

---

## Compliance — Non-Negotiable Rules

These are the hard rules. Violating any of these can end the business via class action or criminal exposure.

### State law landmines

| State | Issue | Rule |
|---|---|---|
| **SC** | §30-2-50 misdemeanor — commercial solicitation from public records | NEVER solicit any SC homeowner derived from records, any channel |
| **FL** | FTSA $500/text statutory damages | NEVER cold-text FL. Direct mail / call / email / VM only |
| **WA** | CEMA $500/text private right | No SMS without consent |
| **MD** | SB 90 — express written consent + 3-per-24-hour cap | Avoid SMS |
| **OK** | SB 1075 — license required for public marketing including double close | Don't enter without license |
| **NC** | HB 797 — license required for public marketing | Don't enter without license |
| **PA** | Act 52 — assignments = brokerage statewide | Don't enter without license |
| **IL** | REL Act caps unlicensed at 1 deal/year | Don't enter without license |
| **MO** | MTNCLA $5K/violation — covers SMS | High-risk SMS state; voice + mail only |
| **TX** | DTPA + SB 140 cold SMS class action magnet | No cold SMS |
| **GA** | SB 73 removed damage caps + vicarious liability | Avoid SMS |
| **CT** | HB 7287 — wholesaler registration with DCP required by 7/1/26 | Avoid until registered |

### Federal rules (apply everywhere)

- **TCPA**: Prior express written consent for autodialed SMS. STOP must be honored within 15 days. Identifying business name + callback number in first message. 8am–9pm local quiet hours.
- **CAN-SPAM**: Physical address, unsubscribe link, honest from-line on all email.
- **DPPA / GLBA**: Don't use LexisNexis/TLO without proper credentialing.
- **10DLC A2P**: Sole prop = 1 MPS, 3,000/day. Standard brand vetting ($40) unlocks higher.

### Ares is the gate

Every single outbound message — SMS, voice, email, mail, VM — passes through Ares before dispatch. Ares is deterministic, singleton (advisory-locked), and logs every rejection to Langfuse + `outreach_messages.compliance_checks`.

If Ares is down, outreach is paused. There is no override.

---

## Cost & Revenue Architecture

### Phase 1 monthly burn (estimate)

| Item | Cost |
|---|---|
| Azure VM | ~$200 (existing credits) |
| Supabase Pro | ~$25 |
| Google Workspace × 4 press identities | $28 |
| Langfuse (self-hosted) | $0 |
| Azure OpenAI (post-`classifyTaskModel` fix) | $150–300 |
| Devi AI | ~$49 |
| **Total Phase 1** | **~$450–600/mo** |

### Phase 3+ adds

| Item | Cost |
|---|---|
| Lob direct mail | variable, ~$0.80/piece |
| Twilio Voice + SMS | variable |
| Slybroadcast RVM | ~$0.10/drop |
| Instantly.ai | $37–97 |
| BatchData skip trace | $0.07/match |
| Empora Title | per-deal |

### Revenue mix (12-month target)

- Wholesaling P&L: $700–900K (5 deals/mo × $15K avg by month 6)
- SaaS ARR: $150–300K
- **Combined: $850K–$1.2M**

### Cost-control levers (already identified)

1. Fix `classifyTaskModel` — route nano for classification, mini for drafting → ~40% LLM cost reduction
2. Skip-trace routing (Tracerfy low / BatchData high) → ~50% skip cost reduction
3. Self-hosted Langfuse vs paid → $59–249/mo avoided
4. pgmq vs Redis → $15–60/mo avoided
5. Batch embedding re-indexing (50% off Azure batch) → one-time $12

---

## Critical Infrastructure Gaps (being closed in order)

| Gap | Severity | Phase Closed |
|---|---|---|
| Bed/bath/sqft enrichment missing | HIGH | Phase 1–2 |
| No buyer's list | HIGH (for wholesaling only) | Phase 3 |
| No comps/ARV engine | HIGH | Phase 2 |
| No rehab cost estimator | MEDIUM | Phase 2 |
| No disposition system | HIGH (for wholesaling only) | Phase 3 |
| Content engine not running | MEDIUM | Phase 3 (manual) → Phase 5 (automated) |
| `classifyTaskModel` broken | MEDIUM | Phase 1 |
| Cost Tracker dead on gateway path | MEDIUM | Phase 1 (replaced by Langfuse) |
| Async jane-bridge | LOW | Phase 3 |

---

## Risks (and how we mitigate them)

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Atlas can't handle a portal type and stalls | High | Medium | Human-review queue; VA-replacement happens incrementally per portal type |
| FTSA class action | Low if Ares works | Existential | Ares deterministic gate, never cold-text FL |
| First deal misses Day 150 | Medium | Morale + cash | Diagnose: list, sequence, conversation, buyers. 1,000 dials is the answer |
| Existing 5 customers churn during data refresh | Medium | Cash | Communicate upgrade narrative; ship confidence indicators; backfill priority counties first |
| Twilio 10DLC rate limits | High | Medium | Telnyx parallel; standard brand vetting after 10–15 deals |
| JR burnout from solo + agents + customers | High | Medium | One day off/week; one week off in 90 days; time blocks (agents AM, customers PM) |
| Press credentials get challenged | Low | Medium | Each domain has real published content, named editor, archive. Obsidian v. Cox protections |
| Codex/Claude ships bad migration | Medium | High | Additive PRs only; staging DB for migration testing; rollback scripts on every PR |

---

## How GPT (or any new collaborator) should think about this

1. **Wholesaling is last, not first.** Anything that prioritizes wholesaling before agents work is wrong.
2. **The agents replace VAs. They are not features. They are the labor force.**
3. **Single-VM, single-Postgres, additive-only.** No microservices, no Redis until pgmq breaks, no rewrites of working systems.
4. **Compliance is the moat, not just a constraint.** Ares is the most important agent in the system because it makes everything else legally defensible.
5. **Deterministic where possible, LLM where judgment is needed.** Scoring, compliance, address normalization = no LLM. Drafting, classification, content = LLM.
6. **The 457K properties and 6 months of FOIA ops are training data, not just a database.** Atlas's prompts come from VA WhatsApp transcripts. Ares's rules come from real legal exposure events. Oracle's weights come from customer feedback.
7. **One operator + AI is the team. Forever, until $25K MRR. Period.**

---

## What's happening this week

- Ship the P0 schema PR (Phase 1 foundation)
- Migrate 4 press credentials to Google Workspace
- Install Langfuse
- Fix `classifyTaskModel`
- Start building Atlas v0 (NextRequest handler first)

That's it. Don't get distracted.
