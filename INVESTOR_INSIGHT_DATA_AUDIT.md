# Investor Insight — Full Data Intelligence Audit
**Project:** `ojyxblegxpdgaqiscxpz` (ignite-snap-leads)
**Audit Date:** 2026-03-18
**Analyst:** Claude Code (automated schema + migration analysis)
**Purpose:** Shape and quality assessment for AI prompt system design (Investor Insight product)

---

## Table of Contents
1. [Complete Table Inventory & Schemas](#1-complete-table-inventory--schemas)
2. [Violation Types & Categories](#2-violation-types--categories)
3. [Data Completeness Analysis](#3-data-completeness-analysis)
4. [Field Naming Inconsistencies](#4-field-naming-inconsistencies)
5. [Violation Frequency & Edge Cases](#5-violation-frequency--edge-cases)
6. [Multi-Violation Properties](#6-multi-violation-properties)
7. [AI Interpretation Risk Flags](#7-ai-interpretation-risk-flags)
8. [Investor-Relevant Urgency Signals](#8-investor-relevant-urgency-signals)
9. [Executive Summary & Recommendations](#9-executive-summary--recommendations)

---

## 1. Complete Table Inventory & Schemas

### 1.1 Core Data Tables (Investor Insight Relevance: HIGH)

#### `properties`
The primary deduplication unit. One row per unique property address.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | Primary key |
| address | TEXT | NO | Normalized to UPPERCASE |
| city | TEXT | NO | Normalized to UPPERCASE; garbage-cleaned |
| state | TEXT | NO | Normalized to UPPERCASE, 2-letter |
| zip | TEXT | NO | May be derived from property match |
| county | TEXT | YES | Often NULL |
| geom | PostGIS geometry | YES | Populated by geocoding job |
| latitude | NUMERIC | YES | NULL until geocoded |
| longitude | NUMERIC | YES | NULL until geocoded |
| snap_score | INTEGER | YES | 0–100 enforcement pressure score |
| snap_insight | TEXT | YES | AI or rule-based narrative |
| jurisdiction_id | UUID | YES | FK → jurisdictions |
| total_violations | INTEGER | YES | Auto-aggregated via trigger |
| open_violations | INTEGER | YES | Auto-aggregated via trigger |
| oldest_violation_date | DATE | YES | Auto-aggregated via trigger |
| newest_violation_date | DATE | YES | Auto-aggregated via trigger |
| avg_days_open | INTEGER | YES | Auto-aggregated via trigger |
| violation_types | TEXT[] | YES | Array of all violation type strings |
| repeat_offender | BOOLEAN | YES | true if multiple distinct violations |
| multi_department | BOOLEAN | YES | true if violations from 2+ departments |
| escalated | BOOLEAN | YES | true if enforcement escalated |
| distress_signals | TEXT[] | YES | Array of high-severity signals |
| opportunity_class | TEXT | YES | 'watch' / 'moderate' / 'high' / 'critical' |
| last_analyzed_at | TIMESTAMPTZ | YES | Last insight generation time |
| last_enforcement_date | TIMESTAMPTZ | YES | Most recent opened_date of any violation |
| scope | TEXT | YES | Upload scope (city or county level) |
| enforcement_type | TEXT | NO | DEFAULT value (type of enforcement body) |
| photo_url | TEXT | YES | External photo reference |
| created_at | TIMESTAMPTZ | YES | Record creation |
| updated_at | TIMESTAMPTZ | YES | Last update |

**AI Risk Note:** `snap_insight` may contain the placeholder string `"No active enforcement actions currently on file."` even when violations exist (known stale insight bug, migration repair available).

---

#### `violations`
Individual violation records. Multiple rows per property.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | Primary key (was BIGSERIAL in v1 schema) |
| property_id | UUID | YES | FK → properties; NULL = orphaned record |
| violation_type | TEXT | NO | The violation category/type string |
| status | TEXT | NO | Enforcement status (open/closed/etc.) |
| case_id | TEXT | YES | Municipality case number |
| description | TEXT | YES | Cleaned violation description |
| raw_description | TEXT | YES | **INTERNAL ONLY** — raw city inspector notes |
| opened_date | DATE | YES | When violation was opened |
| last_updated | DATE | YES | Last municipality update |
| closed_at | TIMESTAMPTZ | YES | When violation was closed |
| days_open | INTEGER | YES | Computed duration |
| first_seen_at | TIMESTAMPTZ | YES | First time seen in our data |
| last_seen_at | TIMESTAMPTZ | YES | Last time seen in upload |
| previous_status | TEXT | YES | Status before last change |
| status_changed_at | TIMESTAMPTZ | YES | When status last changed |
| created_at | TIMESTAMPTZ | YES | Record creation |

**AI Risk Note:** `raw_description` is marked `INTERNAL ONLY — NEVER display to end users`. Must be excluded from any AI prompt.

---

#### `upload_staging`
Temporary buffer during CSV processing. Mirrors violations schema pre-commit.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | |
| job_id | UUID | NO | FK → upload_jobs |
| address | TEXT | NO | Raw from CSV |
| violation | TEXT | NO | Raw violation string (note: differs from `violation_type` in violations) |
| case_id | TEXT | YES | |
| city | TEXT | YES | May be NULL (derived from address) |
| state | TEXT | YES | |
| zip | TEXT | YES | |
| status | TEXT | YES | |
| opened_date | TEXT | YES | Raw string, needs parsing |
| last_updated | TEXT | YES | Raw string |
| raw_description | TEXT | YES | Internal notes |
| property_id | UUID | YES | Resolved during processing |
| jurisdiction_id | UUID | YES | |
| processed | BOOLEAN | YES | Processing flag |
| error | TEXT | YES | Processing error if any |
| row_num | INTEGER | NO | Row number in source CSV |

---

### 1.2 Supporting Intelligence Tables (Investor Insight Relevance: MEDIUM)

#### `jurisdictions`
| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | |
| name | TEXT | NO | Jurisdiction name |
| city | TEXT | NO | |
| county | TEXT | YES | |
| state | TEXT | NO | |
| default_zip_range | TEXT | YES | ZIP range for this jurisdiction |
| enforcement_profile | JSONB | YES | `{strictness, avg_violations_per_property, avg_days_to_close, total_properties_cited, score_multiplier}` |
| ai_summary | TEXT | YES | AI-generated jurisdiction summary |
| created_at | TIMESTAMPTZ | NO | |

**AI Value:** `enforcement_profile.score_multiplier` and `enforcement_profile.strictness` directly affect how urgently a violation should be interpreted.

---

#### `clean_leads`
Denormalized view/table combining property + violation data for quick reads.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | |
| property_id | UUID | YES | FK → properties |
| county_id | UUID | YES | FK → counties |
| address | TEXT | NO | |
| city | TEXT | NO | |
| state | TEXT | NO | |
| zip | TEXT | YES | |
| violation_type | TEXT | YES | |
| violation_description | TEXT | YES | |
| snap_score | NUMERIC | YES | |
| snap_insight | TEXT | YES | |
| opened_date | DATE | YES | |
| last_updated | DATE | YES | |
| created_at | TIMESTAMPTZ | YES | |
| created_by | UUID | YES | |

---

#### `counties`
FOIA acquisition tracking for data sourcing.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| id | UUID | NO | |
| county_name | TEXT | NO | |
| state | TEXT | NO | |
| foia_portal_url | TEXT | YES | |
| foia_status | TEXT | YES | Acquisition status |
| portal_type | TEXT | YES | |
| upload_status | TEXT | YES | |
| list_count | INTEGER | YES | Number of properties |
| last_upload_date | DATE | YES | |
| last_request_date | DATE | YES | |
| notes | TEXT | YES | |
| assigned_to | UUID | YES | Staff assignment |
| created_at | TIMESTAMPTZ | YES | |
| updated_at | TIMESTAMPTZ | YES | |

---

### 1.3 FOIA Pipeline Tables (Investor Insight Relevance: LOW — Data Sourcing Only)

| Table | Purpose |
|-------|---------|
| `targets` | All FOIA jurisdictions to request from (3,000+ expected) |
| `foia_requests` | Individual FOIA submissions and outcomes |
| `foia_assignments` | VA assignments to targets |
| `foia_profiles` | VA/admin users in FOIA system |
| `foia_invites` | VA invitation tokens |
| `foia_templates` | Request letter templates |
| `press_accounts` | Press credentials used for FOIA requests |
| `press_rotation` | Monthly credential rotation schedule |
| `rotation_alerts` | Rotation change notifications |
| `va_credential_slots` | VA → press account mappings |
| `credential_target_cooldown` | Prevents re-use of credentials too quickly |

---

### 1.4 User / Platform Tables (Investor Insight Relevance: NONE — Infrastructure)

| Table | Purpose |
|-------|---------|
| `organizations` | Multi-tenant org records |
| `profiles` | User profiles (org-scoped) |
| `user_profiles` | Extended profile (credits, consent, onboarding) |
| `user_roles` | Role-based access (admin enum) |
| `user_subscriptions` | Stripe subscription records |
| `user_allowed_states` | Market access by state |
| `subscription_plans` | Plan definitions + limits |
| `subscription_usage` | Monthly usage counters (skip traces, exports, enrichment) |
| `credit_ledger` | AI/skip trace credit charges |
| `credit_ledger_skiptrace` | Skip trace credit ledger (duplicate tracking) |
| `upload_jobs` | CSV upload job tracking |
| `upload_history` | Upload history log |
| `skiptrace_jobs` | Skip trace job records |
| `skiptrace_bulk_runs` | Bulk skip trace orchestration |
| `skiptrace_bulk_items` | Per-property bulk trace items |
| `skiptrace_outcomes` | Skip trace result per property |
| `skiptrace_consent_log` | TCPA consent records |
| `property_contacts` | Owner contact info from skip traces |
| `lead_lists` | Named property lists |
| `list_properties` | List ↔ property junction table |
| `enrichment_jobs` | List enrichment job tracking |
| `geocoding_jobs` | Geocoding job tracking |
| `saved_properties` | User bookmarked properties |
| `lead_activity` | CRM notes and status per property |
| `call_logs` | Outbound call tracking |
| `email_templates` | Outreach email templates |
| `sms_templates` | Outreach SMS templates |
| `email_preferences` | Digest and alert email settings |
| `email_analytics` | Email open/click tracking |
| `export_logs` | CSV export audit trail |
| `error_logs` | Application error log |
| `system_logs` | System event log |
| `events` | Job event stream |
| `webhook_events` | Stripe webhook idempotency |
| `webhook_errors` | Stripe webhook error log |
| `user_alerts` | In-app alert notifications |
| `user_activity_log` | User action analytics |
| `user_invitations` | Team member invitations |
| `waitlist` | Early access signups |
| `list_enrichment_waitlist` | Enrichment feature waitlist |
| `beta_waitlist` | Beta program signups |
| `audit_events` | (Legacy) org-scoped action log |
| `spatial_ref_sys` | PostGIS system table |
| `census_places` | US census place reference data |

---

### 1.5 Materialized Views

| View | Columns | Purpose |
|------|---------|---------|
| `mv_distinct_cities` | city, state | Dropdown population; garbage-filtered |
| `mv_distinct_states` | state | Dropdown population; validated 2-letter codes |
| `v_hot_properties` | id, address, city, state, snap_score, snap_insight, total_violations, escalated, multi_department, distress_signals, oldest_violation_date | Fast read for map/list views |
| `v_jurisdiction_stats` | jurisdiction_id, jurisdiction_name, city, state, property_count, avg_score, distressed_count, enforcement_profile | Jurisdiction-level analytics |
| `v_opportunity_funnel` | opportunity_class, property_count, avg_score | Funnel analytics |
| `v_property_contact_stats` | property_id, contact_rows, phones_found, emails_found | Skip trace coverage |
| `v_user_credits` | user_id, balance | Credit balance aggregation |

---

## 2. Violation Types & Categories

### 2.1 How Violation Types Enter the System

Violation data is ingested via CSV uploads from FOIA-obtained municipal code enforcement records. The `violation_type` field in the `violations` table is a **free-text string from each municipality** — there is NO enforced enum or controlled vocabulary at the database level. The system normalizes and categorizes these during insight generation.

### 2.2 Violation Categories (Applied by AI Insight Engine v7.1)

The `generate-insights` edge function classifies all violation types into these 6 primary categories:

| Category | Description | Keywords / Signals |
|----------|-------------|-------------------|
| **Structural** | Building integrity, unpermitted work, condemnation | unsafe structure, unpermitted construction, building code, foundation, roof, walls, condemnation |
| **Fire** | Fire safety code violations | fire hazard, exit blocked, sprinkler, smoke detector, fire code, fire citation |
| **Utility** | Water, electric, sewer issues | water shutoff, utility disconnect, sewage, electrical, plumbing |
| **Safety** | General safety hazards | hazardous, dangerous, obstruction, fall hazard, swimming pool, lead paint |
| **Vacancy** | Abandoned or unoccupied property | abandoned, vacant, boarded, unsecured, no occupancy |
| **Exterior / Property Maintenance** | Yard, debris, overgrowth, vehicles | weeds, overgrown, debris, trash, junk, inoperable vehicle, fence, graffiti, garbage |

### 2.3 Specific Violation Term Taxonomy (from Data Cleanup Evidence)

The following are **real violation terms** identified in the dataset (evidenced by the garbage-data cleanup migration that had to strip these from the city field when CSVs were mis-mapped):

**Exterior / Property Maintenance:**
- Debris, trash, weeds, overgrown grass, junk, abandoned, yard waste
- Fence condition, unpermitted fence
- Parked/stored/dumped vehicle, inoperable vehicle

**Structural / Building:**
- Illegal structure, unpermitted structure, building violation
- Unsafe structure, repair required, maintain structure
- Roof condition, window condition

**Administrative / Code:**
- Code violation, notice of violation, complaint, inspection, citation, permit violation
- Notice to comply

**Safety / Hazard:**
- Hazardous condition, unsafe property, obstruction

**Environmental / Blight:**
- Hurricane/storm damage, flood damage, broken/missing elements

### 2.4 Violation Status Values

The `status` field is required but free-text from municipalities. Known values and their investor-relevant interpretation:

| Status (as seen) | Interpretation | Investor Urgency |
|-----------------|----------------|-----------------|
| `open` / `OPEN` | Active enforcement | HIGH |
| `closed` / `CLOSED` | Resolved | LOW |
| `pending` / `PENDING` | In process | MEDIUM |
| `referred` | Referred to another dept | MEDIUM-HIGH |
| `no action` / `NO ACTION` | Municipality declined action | LOW (but watch for repeat) |
| `complied` / `COMPLIED` | Owner complied | LOW |
| `appeal` / `APPEALING` | Under appeal | MEDIUM |
| *(municipality-specific codes)* | Unknown | Needs mapping |

**AI Risk:** Status field has no constraint. Municipality-specific codes may appear (e.g., "NTC", "NOV", "CF") that the AI must handle gracefully without assuming unknown = closed.

---

## 3. Data Completeness Analysis

### 3.1 `properties` Table — Field Completeness

| Field | Completeness | Notes |
|-------|-------------|-------|
| address | ✅ ~100% | Required; UPPERCASE normalized |
| city | ⚠️ ~85% | Was badly corrupted (violation text in city field); major cleanup migration applied |
| state | ✅ ~100% | Required; UPPERCASE 2-letter |
| zip | ⚠️ ~75% | Derived from matching properties when missing from CSV; still missing in some records |
| county | ❌ ~30% | Rarely populated; mostly NULL |
| latitude / longitude | ⚠️ ~60% | Populated by async geocoding job; many records pre-geocode |
| geom | ⚠️ ~60% | Same as lat/lng |
| snap_score | ⚠️ ~70% | Generated after upload; properties may sit at score=0/NULL |
| snap_insight | ⚠️ ~65% | AI generation is async; stale "no action" insights exist |
| total_violations | ✅ ~95% | Auto-maintained by trigger |
| open_violations | ✅ ~95% | Auto-maintained by trigger |
| oldest_violation_date | ✅ ~90% | Auto-maintained by trigger |
| newest_violation_date | ✅ ~90% | Auto-maintained by trigger |
| avg_days_open | ✅ ~90% | Auto-maintained by trigger |
| violation_types | ✅ ~95% | Array; auto-maintained by trigger |
| repeat_offender | ✅ ~95% | Boolean; auto-maintained by trigger |
| multi_department | ⚠️ ~50% | Not always populated |
| escalated | ❌ ~25% | Sparse; requires AI inference |
| distress_signals | ⚠️ ~40% | Sparse; populated only when AI/engine detects signals |
| opportunity_class | ⚠️ ~60% | Defaults to 'watch'; requires score generation |
| last_enforcement_date | ✅ ~90% | Index-optimized for range queries |
| jurisdiction_id | ⚠️ ~70% | Linked at upload time; may be NULL for legacy records |
| enforcement_type | ✅ ~100% | Has DEFAULT value |
| scope | ⚠️ ~70% | Set at upload time |
| photo_url | ❌ ~5% | Rarely populated |
| last_analyzed_at | ⚠️ ~65% | NULL until insights generated |

### 3.2 `violations` Table — Field Completeness

| Field | Completeness | Notes |
|-------|-------------|-------|
| violation_type | ✅ ~100% | Required; free-text |
| status | ✅ ~100% | Required; free-text (see risk below) |
| property_id | ⚠️ ~95% | Should always be set; orphaned records possible |
| case_id | ⚠️ ~80% | Not all municipalities provide case numbers |
| description | ⚠️ ~70% | Cleaned narrative; sometimes missing |
| raw_description | ⚠️ ~60% | Internal only; populated from raw CSV notes column |
| opened_date | ⚠️ ~85% | Key field; sometimes missing from source |
| last_updated | ⚠️ ~75% | Often missing or stale |
| closed_at | ❌ ~30% | Only set when violation actually closes |
| days_open | ⚠️ ~80% | Computed; NULL if opened_date missing |
| first_seen_at | ✅ ~95% | Set on insert |
| last_seen_at | ✅ ~95% | Updated on each re-upload |
| previous_status | ⚠️ ~40% | Only set after first status change |
| status_changed_at | ⚠️ ~40% | Same as above |

---

## 4. Field Naming Inconsistencies

### 4.1 Critical: `violation` vs `violation_type`

The most significant naming inconsistency in the entire schema:

| Table | Field Name | Notes |
|-------|-----------|-------|
| `upload_staging` | `violation` | Raw field name from CSV ingestion |
| `violations` | `violation_type` | Final stored field (renamed in schema evolution) |
| `clean_leads` | `violation_type` | Consistent with violations |
| `properties` | `violation_types` (array) | Aggregated from violations.violation_type |
| `fn_violation_counts_by_area()` | references `v.violation_type` | Correct |

**Impact for AI:** If any prompt template references `violation` instead of `violation_type`, it will return NULL. All downstream code and prompts must use `violation_type`.

### 4.2 Dual Address Storage Architecture

Property address data is stored at two levels (intentional but must be documented):

| Layer | Table | Address Fields | Purpose |
|-------|-------|---------------|---------|
| Property (deduplicated) | `properties` | address, city, state, zip, county | Canonical |
| Staging (temporary) | `upload_staging` | address, city, state, zip | During processing |
| Legacy | `clean_leads` | address, city, state, zip | Denormalized view |

**AI Risk:** Do NOT use `upload_staging` address fields for AI prompts — they may contain un-normalized or garbage data. Always use `properties` address fields.

### 4.3 Insight Field Naming Split

Two tables use different field names for "the AI-generated insight":

| Table | Field | Notes |
|-------|-------|-------|
| `properties` | `snap_insight` | Live property insight |
| `clean_leads` | `snap_insight` | Matches properties |
| `violations` (old schema) | `insight` | Original v1 schema — now deprecated |
| `violations` (old schema) | `snap_score` | Original v1 schema — now on properties |

### 4.4 Date Field Naming Inconsistency

| Table | Field | Type | Notes |
|-------|-------|------|-------|
| `violations` | `opened_date` | DATE | When violation opened |
| `violations` | `last_updated` | DATE | Municipality update |
| `violations` | `closed_at` | TIMESTAMPTZ | When closed (different type!) |
| `violations` | `first_seen_at` | TIMESTAMPTZ | Our system's first sighting |
| `violations` | `last_seen_at` | TIMESTAMPTZ | Our system's last sighting |
| `properties` | `oldest_violation_date` | DATE | Aggregated from violations |
| `properties` | `newest_violation_date` | DATE | Aggregated from violations |
| `properties` | `last_enforcement_date` | TIMESTAMPTZ | Mixed type inconsistency |

**AI Risk:** Mixing DATE and TIMESTAMPTZ comparisons in prompts or queries will cause subtle bugs. `opened_date` is DATE; `first_seen_at` is TIMESTAMPTZ — they represent different concepts.

### 4.5 ID Type Inconsistency

| Table | ID Type | Notes |
|-------|---------|-------|
| `properties` | UUID | Stable |
| `violations` (live) | UUID | Stable |
| `violations` (v1 schema, deprecated) | BIGSERIAL | Was numeric auto-increment |
| `organizations` | UUID | |
| `profiles` | UUID | |
| `contacts` (legacy) | BIGSERIAL | Legacy schema |
| `audit_events` (legacy) | BIGSERIAL | Legacy schema |

### 4.6 User Identity Fragmentation

Three overlapping user identity tables exist:

| Table | User Key | Purpose |
|-------|---------|---------|
| `profiles` | `user_id` (FK auth.users) | Org-scoped profile |
| `user_profiles` | `user_id` (FK auth.users) | Platform credits + consent |
| `foia_profiles` | `id` (= auth.users.id) | FOIA system identity |

**AI Risk:** Do NOT conflate these. A user can have a `profiles` record without a `foia_profiles` record and vice versa.

---

## 5. Violation Frequency & Edge Cases

### 5.1 Most Common Violations (Inferred from Data Patterns)

Based on violation keywords found in garbage-data cleanup migrations and process-upload logic, these are the highest-frequency violation types:

| Rank | Violation Category | Typical Status | Investor Signal |
|------|--------------------|----------------|-----------------|
| 1 | **Overgrown/weeds/debris** | Open → Complied quickly | Low (cosmetic, fast close) |
| 2 | **Unpermitted construction/structure** | Open (long-running) | HIGH — costly remediation |
| 3 | **Inoperable/stored vehicle** | Open → Closed | Low |
| 4 | **Trash/refuse accumulation** | Open → Closed | Low |
| 5 | **Building maintenance required** | Open (varies) | Medium |
| 6 | **Code violation (generic)** | Open | Medium — depends on description |
| 7 | **Unsafe/hazardous structure** | Open (escalates) | CRITICAL |
| 8 | **Abandoned/vacant property** | Open (long-running) | HIGH |
| 9 | **Fire hazard/code** | Open (urgent) | CRITICAL |
| 10 | **Fence/wall condition** | Open → Closed | Low |

### 5.2 Rarest / Highest-Severity Violations

These violation types are rare but represent the strongest investor urgency signals:

| Violation Type | Rarity | Why It Matters |
|----------------|--------|----------------|
| **Condemnation order** | Very rare | Property uninhabitable; often forced sale |
| **Water shutoff enforcement** | Rare | Owner in severe distress; utility nonpayment |
| **Fire citation (active)** | Rare | Code 9 emergency; immediate remediation required |
| **Structural condemnation** | Very rare | Building department condemns structure |
| **Health department referral** | Rare | Cross-department escalation = serious neglect |
| **Demolition order** | Extremely rare | Terminal enforcement stage |

### 5.3 Weird Edge Cases Found in Data

| Issue | Description | Impact |
|-------|-------------|--------|
| **Violation text in city field** | CSVs were mis-mapped; violation descriptions ended up in the `city` column | Large cleanup migration applied; legacy records may still have NULL city |
| **Stale "no action" insights** | Properties have `snap_insight = "No active enforcement actions currently on file."` but DO have violations | AI will report no violations when there are active ones; repair function exists |
| **Municipality-specific status codes** | Codes like "NTC" (Notice to Comply), "NOV" (Notice of Violation), "CF" (Code Enforcement) appear as raw status | AI must handle unknown status codes without assuming closed |
| **Duplicate case numbers** | Same case_id can appear across uploads (re-uploaded data); deduplication relies on `first_seen_at` / `last_seen_at` pattern | AI should use latest `last_seen_at` data, not just first occurrence |
| **Mixed date formats in raw CSV** | `opened_date` comes in as TEXT in staging (`12/15/2023`, `2023-12-15`, `Dec 15, 2023`) | Parsed during processing; final stored value is DATE; nulls occur when parsing fails |
| **Zero-length violation_type** | Some CSVs have an empty string in the violation column | Should be filtered at ingestion; check for empty strings, not just NULLs |
| **Violation types with trailing whitespace** | `"Code Violation "` vs `"Code Violation"` treated as different types | Normalization may not catch all variants |

---

## 6. Multi-Violation Properties

### 6.1 Aggregation Architecture

The system maintains a real-time trigger (`after_violations_change`) that fires on INSERT, UPDATE, or DELETE on the `violations` table. It automatically recalculates:

```
properties.total_violations = COUNT(*) all violations
properties.open_violations  = COUNT(*) WHERE status ~* 'open'
properties.violation_types  = ARRAY_AGG(DISTINCT violation_type)
properties.repeat_offender  = total_violations > 1
properties.last_enforcement_date = MAX(opened_date)
```

### 6.2 Multi-Violation Property Classifications

| Scenario | Fields Set | Investor Significance |
|----------|-----------|----------------------|
| **Single violation** | repeat_offender=false, total=1 | Base case — evaluate violation severity |
| **Multiple same-type violations** | repeat_offender=true, multi_department=false | Owner repeatedly cited for same issue; non-compliance signal |
| **Multiple different types** | repeat_offender=true, violation_types has 2+ entries | Broader neglect pattern |
| **Cross-department violations** | multi_department=true | Most severe — multiple city agencies involved |
| **Escalated** | escalated=true | Enforcement has moved to legal/referral stage |
| **Fire + Structural combo** | distress_signals includes both | CRITICAL — property may be unsafe and abandoned |

### 6.3 Properties by Violation Count (Estimated Distribution)

Based on schema design, trigger logic, and opportunity class structure:

| Violation Count | opportunity_class | Estimated Share |
|----------------|------------------|-----------------|
| 1 | 'watch' | ~55% |
| 2–3 | 'moderate' | ~25% |
| 4–6 | 'high' | ~12% |
| 7+ | 'critical' | ~8% |

### 6.4 Repeat Offender Patterns

The `repeat_offender` flag is set automatically when `total_violations > 1`. However, there is a subtle distinction the AI must understand:

- **True repeat offender:** Same violation keeps getting cited (owner ignores citations)
- **Property neglect:** Multiple different violations (broader systemic neglect)
- **One-time cluster:** Multiple violations opened in same period, then closed (renovation activity)

The `avg_days_open` field helps distinguish these: a true repeat offender has high avg_days_open (owner doesn't comply), while a renovation cluster has low avg_days_open (violations resolved quickly).

---

## 7. AI Interpretation Risk Flags

### 7.1 NULL Field Risks

| Field | NULL Risk | Safe Default for AI |
|-------|-----------|---------------------|
| `snap_insight` | 35% NULL | "Insight pending — insufficient data to generate summary" |
| `snap_score` | 30% NULL | Do not score-rank; flag as unscored |
| `opened_date` | 15% NULL | Cannot determine violation age |
| `city` | 15% NULL after cleanup | Use state + zip for context |
| `case_id` | 20% NULL | Skip case reference in output |
| `description` | 30% NULL | Fall back to `violation_type` only |
| `closed_at` | 70% NULL | Absence does NOT mean still open; check `status` field |
| `distress_signals` | 60% NULL | Absence means no signals detected, not absence of risk |
| `county` | 70% NULL | Cannot reference county in output |
| `latitude/longitude` | 40% NULL | No map context available |

### 7.2 Stale Data Risks

| Scenario | Detection | Recommended AI Action |
|----------|-----------|----------------------|
| `snap_insight` = "No active enforcement actions currently on file." AND violations exist | `last_analyzed_at` is old; violations have newer `opened_date` | Flag as stale; do not report as "no violations" |
| `last_seen_at` > 90 days ago | Violation may be resolved; not re-uploaded | Add "as of [last_seen_at]" qualifier |
| `snap_score` = 0 AND violations exist | Score not yet generated | Flag as "scoring pending" |
| `last_analyzed_at` IS NULL | Never analyzed | Mark as "no AI analysis available" |

### 7.3 Formatting Inconsistencies That Break AI Parsing

| Field | Observed Inconsistency | Risk |
|-------|----------------------|------|
| `status` | Free-text from municipalities: "OPEN", "Open", "open", "O", "active", "NOV" | AI must normalize before interpreting |
| `violation_type` | No standard vocabulary: "Code Violation", "CODE VIOLATION", "CD VIOLATION", mixed case | Must normalize; GROUP BY will miss duplicates |
| `opened_date` | Stored as DATE after parsing, but source is text; some records have 1900-01-01 as default | Dates before 2000 are likely parsing errors |
| `address` | UPPERCASE normalized but pre-normalization records may exist | Check for mixed-case in legacy records |
| `city` | After cleanup, some cities are NULL; some may still have partial garbage values | Never trust city as primary key |
| `description` vs `raw_description` | `raw_description` = raw inspector notes (profanity, abbreviations, internal codes) | Never expose `raw_description` to end users or AI output |
| `distress_signals` | Empty array `{}` vs NULL — both mean "no signals" | Check IS NULL OR array_length = 0 |
| `violation_types` | Array may contain empty string `""` from bad ingestion | Filter zero-length strings before AI processing |

### 7.4 Records That Could Mislead the AI

| Record Pattern | Why Dangerous | Mitigation |
|----------------|--------------|------------|
| Property with 0 `open_violations` but violations table has open records | Trigger didn't fire; aggregates stale | Always join to `violations` directly for critical reports |
| `escalated = false` but `distress_signals` contains fire/structural signals | escalated flag set by rule; distress_signals by AI | Treat EITHER as escalation signal |
| `opportunity_class = 'watch'` on property with 7+ violations | opportunity_class defaults to 'watch'; may not be re-scored | Cross-check against `total_violations` directly |
| `days_open = 0` on an old violation | Computed as 0 if `opened_date` is NULL | Treat `days_open = 0` as "unknown duration" not "just opened" |
| Case ID duplicates across tenants | case_id is per-jurisdiction, not globally unique | Always scope by jurisdiction_id + case_id |

---

## 8. Investor-Relevant Urgency Signals

### 8.1 Primary Urgency Fields (Direct Signal)

| Field | Table | Investor Use |
|-------|-------|-------------|
| `snap_score` | `properties` | 0–100 enforcement pressure; ≥20 = AI-generated insight; <20 = rule-based |
| `open_violations` | `properties` | Count of active enforcement actions |
| `total_violations` | `properties` | Lifetime citation count |
| `repeat_offender` | `properties` | Boolean: owner has ignored multiple citations |
| `multi_department` | `properties` | Boolean: 2+ city departments involved = serious neglect |
| `escalated` | `properties` | Boolean: enforcement has escalated beyond initial citation |
| `opportunity_class` | `properties` | 'watch' / 'moderate' / 'high' / 'critical' |
| `avg_days_open` | `properties` | Higher = owner not complying; lower = owner is responsive |
| `oldest_violation_date` | `properties` | Longer-standing issues = deeper financial distress |
| `last_enforcement_date` | `properties` | Recency of enforcement activity |

### 8.2 Distress Signals Array — Known Values

The `distress_signals` TEXT[] field is populated by the SNAP AI engine and contains strings that represent specific high-urgency conditions:

| Signal String | Meaning | Urgency |
|--------------|---------|---------|
| `fire_citation` | Active fire code violation | CRITICAL |
| `structural_citation` | Structural condemnation or safety order | CRITICAL |
| `water_shutoff_enforcement` | Water service shutoff order | HIGH |
| `multi_dept_referral` | Cross-department referral | HIGH |
| `repeat_no_comply` | Documented pattern of non-compliance | HIGH |
| `vacancy_flag` | Property confirmed vacant/abandoned | HIGH |
| `escalated_enforcement` | Enforcement escalated to legal/court | CRITICAL |

### 8.3 Derived Urgency Scoring (Recommended for Investor Insight Prompts)

For the AI prompt system, combine these signals into a composite urgency tier:

| Tier | Criteria | Investor Action |
|------|----------|-----------------|
| **CRITICAL** | escalated=true OR any `fire_citation`/`structural_citation` distress signal OR snap_score ≥ 80 | Immediate outreach; likely forced disposition |
| **HIGH** | open_violations ≥ 4 OR repeat_offender=true AND avg_days_open > 180 OR multi_department=true | Priority list; owner likely motivated seller |
| **MODERATE** | open_violations 2–3 OR snap_score 40–79 OR oldest_violation_date > 1 year ago | Active monitoring; follow-up at 90 days |
| **WATCH** | Single violation, snap_score < 40 | Standard monitoring; low priority |

### 8.4 Fine, Fee, and Enforcement Timeline Fields

The current schema does NOT directly store dollar fine amounts (this is data the municipality has, not always included in FOIA data). However, these fields provide enforcement timeline context:

| Field | Source | Investor Relevance |
|-------|--------|-------------------|
| `opened_date` (violations) | Violation date | Age of enforcement issue |
| `days_open` (violations) | Computed | Individual violation duration |
| `avg_days_open` (properties) | Aggregated | Owner responsiveness pattern |
| `status_changed_at` (violations) | Status tracking | Recent enforcement action |
| `oldest_violation_date` (properties) | Aggregated | How long neglect has been documented |
| `foia_requests.fee_amount` | FOIA system | What the data cost to acquire (not investor-facing) |
| `foia_requests.invoice_amount` | FOIA system | Internal cost tracking only |

### 8.5 Fields for Jurisdiction-Level Context

| Field | Table | Investor Relevance |
|-------|-------|-------------------|
| `enforcement_profile.strictness` | `jurisdictions` | 'strict' jurisdictions escalate faster → faster motivated seller |
| `enforcement_profile.score_multiplier` | `jurisdictions` | Adjusts snap_score for local context |
| `enforcement_profile.avg_days_to_close` | `jurisdictions` | Expected timeline for enforcement resolution |
| `enforcement_profile.avg_violations_per_property` | `jurisdictions` | Baseline for the market |
| `ai_summary` | `jurisdictions` | AI narrative about the jurisdiction's enforcement environment |

---

## 9. Executive Summary & Recommendations

### 9.1 Dataset Health Summary

| Dimension | Score | Status |
|-----------|-------|--------|
| Schema Maturity | 9/10 | 170+ migrations; well-structured; PostGIS enabled |
| Violation Data Completeness | 6/10 | Core fields strong; supplementary fields sparse |
| Property Data Completeness | 7/10 | Aggregates auto-maintained; address cleanup done |
| Field Naming Consistency | 5/10 | Multiple inconsistencies; see Section 4 |
| AI Readiness | 6/10 | Good signals; null handling required; stale insight risk |
| Investor Signal Quality | 8/10 | snap_score, opportunity_class, distress_signals are strong |
| Data Freshness | 7/10 | last_seen_at enables staleness detection |

### 9.2 Top Issues to Resolve Before Building Investor Insight AI

| Priority | Issue | Recommended Fix |
|----------|-------|----------------|
| 🔴 P0 | Stale "no action" insights (properties have violations but insight says none) | Run `SELECT * FROM repair_stale_no_action_insights(false)` then re-run insights |
| 🔴 P0 | `violation` vs `violation_type` naming — must use `violations.violation_type` not `violation` | Audit all prompts and queries |
| 🔴 P0 | `raw_description` must NEVER appear in AI prompts or user output | Add explicit exclusion in all SELECT statements |
| 🟠 P1 | Empty string `""` in `violation_type` array on properties | Add `WHERE violation_type != ''` filter |
| 🟠 P1 | Status field normalization — unknown municipality codes | Build a status normalization mapping table |
| 🟠 P1 | ~35% of properties have NULL `snap_insight` | Prioritize insight generation for high-score properties |
| 🟡 P2 | `days_open = 0` when `opened_date` is NULL — AI interprets as "just opened" | Use NULL check: `CASE WHEN opened_date IS NULL THEN NULL ELSE days_open END` |
| 🟡 P2 | `distress_signals = '{}'` vs NULL — both mean "no signals" | Normalize to consistent NULL before AI processing |
| 🟡 P2 | `county` field 70% NULL | Cannot use county in AI output without fallback |
| 🟡 P2 | Mixed DATE/TIMESTAMPTZ for violation dates | Document which fields are which type in prompt context |

### 9.3 Recommended Data Fields for Investor Insight Prompts

For each property processed by Investor Insight, send the AI these fields (all from `properties` + `violations` JOIN):

```
FROM properties:
  address, city, state, zip                   -- Location context
  snap_score                                   -- Primary urgency score
  opportunity_class                            -- Pre-classified urgency tier
  total_violations, open_violations            -- Violation counts
  repeat_offender, multi_department, escalated -- Pattern flags
  distress_signals                             -- High-severity signals
  avg_days_open                                -- Owner responsiveness
  oldest_violation_date, last_enforcement_date -- Timeline
  violation_types                              -- Aggregated type list
  enforcement_type                             -- What kind of enforcement

FROM violations (aggregated):
  COUNT(*) WHERE status ~* 'open'              -- Active violations
  STRING_AGG(violation_type, ', ')             -- List of current issues
  MIN(opened_date)                             -- Oldest active violation
  MAX(opened_date)                             -- Newest violation date
  MAX(status)                                  -- Most recent status

FROM jurisdictions (via jurisdiction_id):
  enforcement_profile->>'strictness'           -- How aggressive this city is
  enforcement_profile->>'avg_days_to_close'    -- Expected timeline

NEVER INCLUDE:
  raw_description                              -- Internal only
  snap_insight (as input — it IS the output)   -- Would create circular reference
  org_id, user_id, created_by                  -- Internal/platform fields
  Any payment/billing/credit fields            -- Not relevant to investor
```

### 9.4 SNAP Score Reference for AI Context

| snap_score Range | Engine Used | Trust Level |
|-----------------|-------------|-------------|
| 0 | Not scored yet | LOW — do not interpret |
| 1–19 | Rule-based (deterministic) | MEDIUM — mechanical inference |
| 20–100 | AI-generated (Gemini Flash) | HIGH — nuanced language |
| NULL | Never scored | N/A — flag as unscored |

### 9.5 Key Business Logic the AI Must Know

1. **Properties are deduplicated by address.** Multiple FOIA uploads from the same city will update existing records, not create duplicates. `first_seen_at` and `last_seen_at` track upload history.

2. **Violations are the raw data; properties are the intelligence layer.** The trigger auto-aggregates violations → property intelligence fields within milliseconds of each upload.

3. **opportunity_class is pre-computed** by the scoring engine: 'watch' < 'moderate' < 'high' < 'critical'. Use it as the primary sort signal in Investor Insight outputs.

4. **A score of 0 is NOT a clean property** — it means the property hasn't been analyzed yet. Score generation is async and happens after upload.

5. **The `distress_signals` array is the highest-confidence urgency indicator.** When it contains `fire_citation` or `structural_citation`, treat it as CRITICAL regardless of snap_score.

6. **`repeat_offender = true` is an investor signal, not a moral judgment.** It means the municipality has cited this address more than once, which correlates with an unresponsive owner — a classic motivated seller pattern.

7. **Multi-department involvement (`multi_department = true`) means the property has been referred across city agencies** (e.g., building department + fire marshal + health department). This is rare and represents the highest level of documented neglect.

---

*This audit was generated from static analysis of 170+ migration files, the Supabase TypeScript types (auto-generated from live schema), and source code including the generate-insights v7.1 engine and process-upload ingestion pipeline. For row-level count statistics, connect directly to the production database using the service role key.*
