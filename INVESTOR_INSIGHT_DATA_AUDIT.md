# Snap Dataset — Full Data Intelligence Audit
## For Investor Insight AI System Design

**Audit Date:** 2026-03-18
**Database:** Supabase Project `ojyxblegxpdgaqiscxpz`
**Total Tables:** 61 | **Total Views:** 9 | **Total Functions:** 100+
**Migrations:** 229 SQL files

---

## Table of Contents
1. [Database Architecture Overview](#1-database-architecture-overview)
2. [Core Data Tables — Schema Breakdown](#2-core-data-tables--schema-breakdown)
3. [Violation Type Analysis](#3-violation-type-analysis)
4. [Data Completeness Audit](#4-data-completeness-audit)
5. [Field Structure & Naming Consistency](#5-field-structure--naming-consistency)
6. [Text / Description Analysis](#6-text--description-analysis)
7. [Frequency & Pattern Insights](#7-frequency--pattern-insights)
8. [Data Outliers & Edge Cases](#8-data-outliers--edge-cases)
9. [Investor-Relevant Signals](#9-investor-relevant-signals)
10. [AI Prompt System Recommendations](#10-ai-prompt-system-recommendations)

---

## 1. Database Architecture Overview

### Table Classification

| Category | Tables | Purpose |
|----------|--------|---------|
| **Core Property Data** | `properties`, `violations`, `clean_leads`, `property_contacts` | Main data for Investor Insight |
| **Upload Pipeline** | `upload_jobs`, `upload_staging`, `upload_history`, `staging_uploads` | CSV ingestion system |
| **Jurisdiction/FOIA** | `jurisdictions`, `counties`, `targets`, `foia_requests`, `foia_assignments`, `foia_profiles`, `foia_invites`, `foia_templates` | Data acquisition workflow |
| **User/Auth** | `profiles`, `user_profiles`, `user_roles`, `user_subscriptions`, `user_allowed_states`, `user_invitations`, `organizations` | User management |
| **Engagement** | `lead_activity`, `lead_lists`, `list_properties`, `saved_properties`, `call_logs` | CRM / lead tracking |
| **Credits/Billing** | `credit_ledger`, `credit_ledger_skiptrace`, `subscription_plans`, `subscription_usage`, `user_subscriptions` | Monetization |
| **Skip Trace** | `skiptrace_jobs`, `skiptrace_outcomes`, `skiptrace_bulk_items`, `skiptrace_bulk_runs`, `skiptrace_consent_log` | Contact lookup |
| **Communication** | `email_templates`, `sms_templates`, `email_analytics`, `email_preferences` | Outreach |
| **System** | `error_logs`, `system_logs`, `events`, `webhook_events`, `webhook_errors`, `export_logs`, `user_activity_log` | Operational logging |
| **Press/VA** | `press_accounts`, `press_rotation`, `rotation_alerts`, `va_credential_slots`, `credential_target_cooldown` | FOIA operations |
| **Geo/Spatial** | `spatial_ref_sys`, `census_places`, `geocoding_jobs` | PostGIS / mapping |
| **Misc** | `beta_waitlist`, `list_enrichment_waitlist`, `enrichment_jobs` | Waitlists / enrichment |

### Key Views for Investor Insight

| View | Purpose | Fields |
|------|---------|--------|
| `v_hot_properties` | Pre-filtered high-distress properties | address, city, state, distress_signals, escalated, snap_score, total_violations |
| `v_jurisdiction_stats` | Aggregated city-level enforcement data | avg_score, property_count, distressed_count, enforcement_profile |
| `v_opportunity_funnel` | Properties grouped by opportunity class | opportunity_class, property_count, avg_score |
| `v_property_contact_stats` | Contact info completeness per property | contact_rows, emails_found, phones_found |
| `v_user_credits` | User credit balance | balance, user_id |
| `mv_distinct_cities` | Materialized: unique cities | city, state |
| `mv_distinct_states` | Materialized: unique states | state |

---

## 2. Core Data Tables — Schema Breakdown

### `properties` — Central Property Record (31 fields)

| Field | Type | Nullable | Investor Insight Relevance |
|-------|------|----------|--------------------------|
| `id` | uuid | NO | Primary key |
| `address` | text | NO | Core identifier |
| `city` | text | NO | Location filter |
| `state` | text | NO | Location filter |
| `zip` | text | NO | Location filter |
| `county` | text | YES | Location filter |
| `latitude` | float | YES | Map display |
| `longitude` | float | YES | Map display |
| `geom` | geometry | YES | PostGIS spatial queries |
| `snap_score` | integer | YES | **PRIMARY** — 0-100 enforcement intensity score |
| `snap_insight` | text | YES | **PRIMARY** — AI/rule-based narrative summary |
| `total_violations` | integer | YES | **HIGH** — violation count |
| `open_violations` | integer | YES | **HIGH** — active enforcement count |
| `violation_types` | text[] | YES | **HIGH** — array of violation category strings |
| `distress_signals` | text[] | YES | **HIGH** — array of signal keywords |
| `opportunity_class` | text | YES | **HIGH** — "distressed" / "value_add" / "watch" |
| `enforcement_type` | text | NO (default '') | **HIGH** — "water_shutoff" or standard |
| `repeat_offender` | boolean | YES | **HIGH** — 3+ violations flag |
| `multi_department` | boolean | YES | **HIGH** — 2+ enforcement categories |
| `escalated` | boolean | YES | **HIGH** — condemned/legal/court status |
| `avg_days_open` | float | YES | **MEDIUM** — average enforcement duration |
| `oldest_violation_date` | date | YES | **MEDIUM** — enforcement history start |
| `newest_violation_date` | date | YES | **MEDIUM** — most recent activity |
| `last_enforcement_date` | date | YES | **MEDIUM** — last enforcement action |
| `last_analyzed_at` | timestamp | YES | Freshness indicator |
| `scope` | text | YES | "city" or "county" upload scope |
| `jurisdiction_id` | uuid | YES | FK → jurisdictions |
| `photo_url` | text | YES | Property image |
| `created_at` | timestamp | YES | Record creation |
| `updated_at` | timestamp | YES | Last modification |

### `violations` — Individual Violation Records (16 fields)

| Field | Type | Nullable | Investor Insight Relevance |
|-------|------|----------|--------------------------|
| `id` | uuid | NO | Primary key |
| `property_id` | uuid | YES | FK → properties |
| `violation_type` | text | NO | **PRIMARY** — violation category label |
| `status` | text | NO | **PRIMARY** — "Open" / "Closed" / escalated statuses |
| `case_id` | text | YES | Municipal case reference |
| `description` | text | YES | Normalized description |
| `raw_description` | text | YES | **HIGH** — original text from source CSV |
| `days_open` | integer | YES | **HIGH** — duration metric |
| `opened_date` | date | YES | When violation was filed |
| `closed_at` | date | YES | When violation was resolved |
| `last_updated` | date | YES | Most recent status change |
| `first_seen_at` | timestamp | YES | When Snap first ingested |
| `last_seen_at` | timestamp | YES | Most recent Snap observation |
| `previous_status` | text | YES | Status before current |
| `status_changed_at` | timestamp | YES | When status last changed |
| `created_at` | timestamp | YES | Record creation |

### `clean_leads` — Cleaned Lead Records (15 fields)

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | uuid | NO | Primary key |
| `address` | text | NO | Cleaned address |
| `city` | text | NO | City |
| `state` | text | NO | State code |
| `zip` | text | YES | Zip code |
| `violation_type` | text | YES | Violation category |
| `violation_description` | text | YES | Description text |
| `snap_score` | integer | YES | Score at time of cleaning |
| `snap_insight` | text | YES | Insight at time of cleaning |
| `property_id` | uuid | YES | FK → properties |
| `county_id` | uuid | YES | FK → counties |
| `opened_date` | date | YES | Violation date |
| `last_updated` | date | YES | Last update |
| `created_by` | uuid | YES | User who created |
| `created_at` | timestamp | YES | Record creation |

### `property_contacts` — Skip Trace Results (9 fields)

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | uuid | NO | Primary key |
| `property_id` | uuid | NO | FK → properties |
| `name` | text | YES | Contact name |
| `email` | text | YES | Contact email |
| `phone` | text | YES | Contact phone |
| `source` | text | YES | Data provider |
| `raw_payload` | jsonb | YES | Full vendor response |
| `created_by` | uuid | NO | User who requested |
| `created_at` | timestamp | NO | Record creation |

### `jurisdictions` — City Enforcement Profiles (9 fields)

| Field | Type | Nullable | Notes |
|-------|------|----------|-------|
| `id` | uuid | NO | Primary key |
| `name` | text | NO | Display name |
| `city` | text | NO | City name |
| `state` | text | NO | State code |
| `county` | text | YES | County name |
| `enforcement_profile` | jsonb | YES | **HIGH** — AI-generated enforcement behavior profile |
| `ai_summary` | text | YES | AI summary of jurisdiction |
| `default_zip_range` | text | YES | Default zip code range |
| `created_at` | timestamp | NO | Record creation |

---

## 3. Violation Type Analysis

### Current Violation Classification System

The system classifies violations using a **keyword-scan approach** on `violation_type` + `raw_description` combined text. Here's the complete classification:

#### HIGH Priority Categories

| Category | Keywords Scanned | Priority |
|----------|-----------------|----------|
| **Structural** | collapse, unsafe structure, condemned, foundation failure, imminent danger | HIGH |
| **Fire** | fire damage, burnt, smoke damage, charred, fire, burn, smoke | HIGH |
| **Utility** | no utilities, utility disconnect, no water, no electric, water disconnect, water shutoff | HIGH |

#### MEDIUM Priority Categories

| Category | Keywords Scanned | Priority |
|----------|-----------------|----------|
| **Structural** | roof leak, structural damage, foundation crack, major repair, structure, foundation, roof, wall | MEDIUM |
| **Vacancy** | vacant, abandon, unoccup, boarded | MEDIUM |
| **Safety** | unsafe, hazard, danger, health | MEDIUM |
| **Utility** | plumbing, electrical, sewage, hvac | MEDIUM |
| **Zoning** | zoning, zone violation, land use, code enforcement, unpermitted, without permit, permit violation, illegal construction | MEDIUM |
| **Maintenance** | property maintenance, property inspection, code compliance, nuisance | MEDIUM |
| **General Enforcement** | *(any open violation not matching above)* | MEDIUM |

#### LOW Priority Categories

| Category | Keywords Scanned | Priority |
|----------|-----------------|----------|
| **Exterior** | paint, siding, fence, grass, weeds, debris, window, door, screen, gutter, exterior, facade | LOW |
| **Other** | *(any closed violation not matching above)* | LOW |

### Category Groupings Used in UI Filtering (`fn_properties_by_category`)

| UI Category | Keyword Array |
|------------|---------------|
| `exterior` | Exterior |
| `structural` | Structural |
| `safety` | Safety, Fire |
| `zoning` | Zoning |
| `maintenance` | Rubbish, Grass, Trash, Debris, Weed, Dumping, Waste, Snow |
| `interior` | Interior, Plumbing, HVAC, Furnace, 305.3, 305.6, 605.3, 403., 504., 506., 605. |
| `vacancy` | Vacancy, Vacant |
| `water_disconnection` | enforcement_type = 'water_shutoff' |
| `other` | Unknown, Other, Complaint |

### Potential Edge Cases in Violation Types

1. **Raw violation_type values come directly from CSV uploads** — there is NO normalization at upload time. The `violation_type` field stores whatever was in the `category`, `violation`, `type`, `violation_type`, or `violation_category` CSV column
2. **Classification happens at scoring time** — the `classifyViolation()` function runs keyword matching on the combined `violation_type + raw_description` text
3. **Many violations may fall to "Other/General Enforcement"** if the source CSV uses city-specific codes (e.g., "305.3", "ICC 101.1", "CE-2024-xxxxx")
4. **Description text is the richest source** but is optional and inconsistently provided across jurisdictions
5. **Municipal code references** (e.g., "305.3", "605.3") are hardcoded in the interior category — not all code references are covered
6. **No formal taxonomy** — violation types are free-text from CSV sources, meaning the AI must handle arbitrary strings

---

## 4. Data Completeness Audit

### `properties` Table — Field Completeness Assessment

| Field | Required | Likely Fill Rate | Risk Level | Notes |
|-------|----------|-----------------|------------|-------|
| `address` | YES | ~100% | LOW | Required on insert |
| `city` | YES | ~100% | LOW | Required; extracted from address if missing |
| `state` | YES | ~100% | LOW | Required; falls back to job-level state |
| `zip` | YES | ~95% | MEDIUM | Required on insert but can be empty string; backfill functions exist |
| `county` | NO | ~30-50% | HIGH | Only populated on county-scope uploads |
| `snap_score` | NO | ~80-90% | MEDIUM | Null until `generate-insights` runs; backfill available |
| `snap_insight` | NO | ~80-90% | MEDIUM | Generated alongside snap_score |
| `total_violations` | NO | ~80-90% | MEDIUM | Computed during scoring |
| `open_violations` | NO | ~80-90% | MEDIUM | Computed during scoring |
| `violation_types` | NO | ~80-90% | MEDIUM | Array; computed during scoring |
| `distress_signals` | NO | ~80-90% | MEDIUM | Array; computed during scoring |
| `opportunity_class` | NO | ~80-90% | MEDIUM | Computed during scoring |
| `enforcement_type` | YES (default '') | ~100% | LOW | Default empty string |
| `repeat_offender` | NO | ~80-90% | MEDIUM | Boolean; computed (3+ violations) |
| `multi_department` | NO | ~80-90% | MEDIUM | Boolean; computed (2+ categories) |
| `escalated` | NO | ~80-90% | MEDIUM | Boolean; computed from status keywords |
| `latitude` | NO | ~60-70% | HIGH | Requires geocoding; batch function exists |
| `longitude` | NO | ~60-70% | HIGH | Requires geocoding; batch function exists |
| `avg_days_open` | NO | ~80-90% | MEDIUM | Computed during scoring |
| `oldest_violation_date` | NO | ~70-80% | MEDIUM | Depends on violation dates |
| `newest_violation_date` | NO | ~70-80% | MEDIUM | Depends on violation dates |
| `jurisdiction_id` | NO | ~50-70% | MEDIUM | Only linked if jurisdiction exists |
| `photo_url` | NO | ~5-10% | HIGH | Rarely populated |

### `violations` Table — Field Completeness Assessment

| Field | Required | Likely Fill Rate | Risk Level | Notes |
|-------|----------|-----------------|------------|-------|
| `property_id` | NO | ~99% | LOW | FK to properties; almost always linked |
| `violation_type` | YES | ~100% | LOW | Required; but may be generic (e.g., "Complaint") |
| `status` | YES | ~100% | LOW | Required; typically "Open" or "Closed" |
| `case_id` | NO | ~60-80% | MEDIUM | Not all jurisdictions provide case numbers |
| `description` | NO | ~30-50% | HIGH | Normalized description; sparsely filled |
| `raw_description` | NO | ~40-60% | HIGH | Original CSV text; most valuable for AI |
| `days_open` | NO | ~50-70% | HIGH | Computed from dates; null if no dates available |
| `opened_date` | NO | ~60-80% | MEDIUM | Key date; not all CSVs provide it |
| `closed_at` | NO | ~20-40% | HIGH | Only for resolved violations |
| `last_updated` | NO | ~40-60% | HIGH | Inconsistently provided |
| `first_seen_at` | NO | ~50-60% | MEDIUM | Upload tracking |
| `last_seen_at` | NO | ~50-60% | MEDIUM | Upload tracking |
| `previous_status` | NO | ~10-20% | HIGH | Only populated on status changes |
| `status_changed_at` | NO | ~10-20% | HIGH | Only populated on status changes |

### Data Quality Variation by Source

| Factor | Impact on Data Quality |
|--------|----------------------|
| **City vs County scope** | City-scoped uploads have more complete city fields; county-scoped may have null city |
| **FOIA response format** | CSV, PDF, image — only CSVs produce structured data; PDFs/images need manual processing |
| **Jurisdiction compliance** | Some cities provide rich violation descriptions; others provide only codes |
| **State coverage** | Currently focused on CA, NV cities (known city list in upload parser) |
| **Date formats** | Parser handles ISO (YYYY-MM-DD) and US (MM/DD/YYYY) formats |
| **Redacted records** | FOIA responses may redact owner info, addresses |

---

## 5. Field Structure & Naming Consistency

### Cross-Table Field Name Inconsistencies

| Concept | `properties` | `violations` | `clean_leads` | `upload_staging` | `upload_jobs` |
|---------|-------------|-------------|---------------|-----------------|--------------|
| Violation type | `violation_types` (array) | `violation_type` (text) | `violation_type` (text) | `violation` (text) | N/A |
| Description | N/A | `description` + `raw_description` | `violation_description` | `raw_description` | N/A |
| Date opened | `oldest_violation_date` | `opened_date` | `opened_date` | `opened_date` | N/A |
| Date closed | N/A | `closed_at` | N/A | `last_updated` | N/A |
| Status | N/A | `status` | N/A | `status` | `status` (job status) |
| Location | `city`, `state`, `zip`, `county` | N/A (via property FK) | `city`, `state`, `zip` | `city`, `state`, `zip` | `city`, `state`, `county` |
| Case ID | N/A | `case_id` | N/A | `case_id` | N/A |
| Score | `snap_score` | N/A | `snap_score` | N/A | N/A |
| Insight | `snap_insight` | N/A | `snap_insight` | N/A | N/A |

### CSV Column Name Mappings (from process-upload)

The upload parser handles these CSV column name variations:

| Data Field | Accepted CSV Column Names |
|-----------|--------------------------|
| **Case ID** | `case_id`, `case/file id`, `file #`, `file_number`, `id`, `file number` |
| **Address** | `address`, `location`, `property_address`, `property address` |
| **Violation Type** | `category`, `violation`, `type`, `violation_type`, `violation type`, `violation_category` |
| **Open Date** | `opened_date`, `open_date`, `open date`, `date`, `date_opened` |
| **Close Date** | `close_date`, `close date`, `closed_date`, `date_closed` |
| **Description** | `description`, `violation_description`, `notes`, `comments` |
| **City** | `city` |
| **State** | `state` |
| **Zip** | `zip`, `zipcode`, `zip code` |
| **Status** | `status` (defaults to "Open" if missing) |

### Issues for AI Prompt Design

1. **`violation` in staging vs `violation_type` in violations** — same concept, different field names
2. **`description` vs `raw_description` vs `violation_description`** — three different fields across tables for the same concept
3. **`closed_at` vs `close_date` vs `last_updated`** — close date stored differently across tables
4. **Status field overloading** — `upload_jobs.status` = job status (QUEUED/PARSING/PROCESSING/COMPLETE/FAILED) vs `violations.status` = violation status (Open/Closed/Board/Legal/Court)
5. **`enforcement_type` default empty string** — not null, but empty string "" when no special enforcement, "water_shutoff" when water disconnected

---

## 6. Text / Description Analysis

### Violation Description Patterns

Based on the code analysis, violation descriptions contain:

#### Severity Signal Keywords (from classifyViolation)

| Severity | Keywords | Example Descriptions |
|----------|----------|---------------------|
| **CRITICAL** | collapse, unsafe structure, condemned, foundation failure, imminent danger, condemnation | "Structure condemned - unsafe for occupancy" |
| **HIGH** | fire damage, burnt, smoke damage, no water, water disconnect, water shutoff, no utilities | "Water service disconnected per utility authority" |
| **MEDIUM** | roof leak, structural damage, foundation crack, vacant, abandoned, boarded, unsafe, hazard, zoning, unpermitted | "Vacant property with boarded windows and overgrown vegetation" |
| **LOW** | paint, siding, fence, grass, weeds, debris, window, door, gutter | "Overgrown weeds and debris in front yard" |

#### Escalation Status Keywords (from aggregatePropertyIntelligence)

| Status | Interpretation |
|--------|---------------|
| `board` | Referred to administrative board hearing |
| `legal` | Referred for legal enforcement |
| `court` | Municipal court proceedings |
| `condemned` | Property condemned as unsafe |
| `prosecution` | Criminal prosecution initiated |

#### Water Shutoff Detection Keywords

| Keyword | Source |
|---------|--------|
| `water shutoff` | violation_type or raw_description |
| `water disconnect` | violation_type or raw_description |
| `no water` | violation_type or raw_description |
| `water termination` | violation_type or raw_description |
| `water service disconnect` | violation_type or raw_description |

### Address Validation Filters

The upload parser rejects addresses containing:
- Street number-less text
- Case number prefixes (e.g., "CE-2026-04026")
- ATTN: prefixes
- Concatenated status fields
- AI/narrative text ("nextdoor", "posting says")
- Complaint narratives ("complainant", "neighbor", "property owner")
- OCR garbage text
- Legal land descriptions (SEC, LOT, PTN)
- Sentence structures

---

## 7. Frequency & Pattern Insights

### Snap Score Distribution & Interpretation

| Score Range | Activity Class | Opportunity Class | Interpretation |
|------------|---------------|-------------------|----------------|
| **70-100** | Critical | `distressed` | Active multi-vector enforcement; highest investor interest |
| **40-69** | Elevated | `value_add` | Significant enforcement activity; value-add potential |
| **0-39** | Monitoring | `watch` | Minor or resolved enforcement; monitoring only |

### Scoring Factors (from calculateEnforcementIntensity)

| Factor | Max Points | Condition |
|--------|-----------|-----------|
| **Duration** | 30 | 3 pts per month open (capped at 30) |
| **High-priority violations** | 60 | 40 base + 10 per additional (capped at +20) |
| **Medium-priority violations** | 30 | 15 per violation (capped at 30) |
| **Repeat activity** | 30 | 5 pts (2+), 15 pts (3+), 25 pts (5+), 30 pts (10+) |
| **Open violation volume** | 70 | Progressive: 10 (3+), 20 (5+), 30 (10+), 40 (20+), 50 (50+), 60 (100+), 70 (200+) |
| **Multi-category** | 25 | 15 (2+ categories), 25 (3+ categories) |
| **Escalation** | 30 | 15 (board), 25 (legal/court), 30 (condemned/prosecution) |
| **Vacancy** | 25 | Vacancy/abandonment citation detected |
| **Recency** | 40 | 40 (7 days), 20 (30 days) |
| **Water shutoff** | 55 | 40-55 depending on concurrent violations |
| **Score cap: all closed** | -cap | Max 20 (normal) or 35 (escalated) if no open violations |

### Distress Signals Array Values

| Signal String | Meaning |
|--------------|---------|
| `extended_enforcement` | Open violations > 180 days |
| `fire_citation` | Fire safety violations detected |
| `structural_citation` | Structural violations detected |
| `recurring_enforcement` | 3+ total violations |
| `multiple_citations` | 2+ total violations |
| `extreme_enforcement_load` | 200+ open violations |
| `massive_enforcement_load` | 50-199 open violations |
| `high_violation_volume` | 10-49 open violations |
| `active_enforcement_load` | 3-9 open violations |
| `coordinated_enforcement` | 3+ enforcement categories |
| `multi_department` | 2+ enforcement categories |
| `enforcement_escalation` | Condemned, legal, court, or board status |
| `vacancy_citation` | Vacancy/abandonment detected |
| `recent_activity` | Activity within 7 days |
| `current_enforcement` | Activity within 30 days |
| `water_shutoff_enforcement` | Water service disconnected |
| `maximum_enforcement_pressure` | Water shutoff + open code violations + repeat offender + recent activity |
| `active_enforcement_current` | Water shutoff + recent activity |
| `compounding_enforcement` | Water shutoff + open code violations |
| `direct_municipal_action` | Water shutoff only |
| `utility_enforcement` | Non-water utility violations |

### Multi-Violation Property Patterns

| Pattern | Detection | Investor Relevance |
|---------|-----------|-------------------|
| **Single violation** | `total_violations = 1` | Low distress indicator |
| **Multiple violations** | `total_violations >= 2` | Moderate distress |
| **Repeat offender** | `total_violations >= 3` (sets `repeat_offender = true`) | Strong distress signal |
| **Multi-department** | 2+ unique enforcement categories | Cross-agency involvement |
| **Escalated** | Status contains board/legal/court/condemned/prosecution | Severe enforcement action |
| **Water shutoff + violations** | `enforcement_type = 'water_shutoff'` AND open violations | Maximum distress indicator |

---

## 8. Data Outliers & Edge Cases

### Known Edge Cases That Could Break AI Interpretation

| Edge Case | Description | Impact | Recommendation |
|-----------|-------------|--------|----------------|
| **Empty violation_type** | Some CSVs have blank type columns | Falls to "Other" category | AI must handle empty/generic types |
| **Municipal code numbers as types** | "305.3", "605.3", "ICC 101.1" | Only partially mapped in category filter | Build code-to-category lookup table |
| **Status variations** | "OPEN", "Open", "open", "Active", "Investigating", "CLOSED", "Resolved" | Status normalization happens at scoring | AI prompt must normalize status strings |
| **Future dates** | Dates parsed as future (parser rejects > 30 days out but edge cases exist) | May show negative days_open | Clamp to current date |
| **Null days_open with no dates** | Violations with no opened_date, last_updated, or close_date | days_open defaults to 0 | Treat as "unknown duration" |
| **Concatenated CSV fields** | Addresses with embedded status ("816 E 2ND CLOSED 1/21/2026") | Parser filters these | Some may slip through |
| **OCR-sourced data** | PDFs converted to text; garbage characters | Parser has OCR filters | AI must handle garbled text |
| **Duplicate properties** | Same address uploaded from multiple CSV files | Deduplication by address match | May have inflated violation counts |
| **County-scope nulls** | County-level uploads have null city | Properties without city context | AI must handle missing city |
| **Empty string enforcement_type** | Default "" not null | Comparison must use empty string check | Use `enforcement_type = 'water_shutoff'` not null check |
| **Stale scores** | Properties not re-scored after new violations uploaded | Score/insight may be outdated | Check `last_analyzed_at` freshness |
| **Zero-violation properties** | Properties created but violations not yet processed | snap_score = null, empty arrays | AI should state "no violations on file" |
| **Very high violation counts** | Properties with 100-200+ open violations | Score scaling handles up to 200+ | AI must handle extreme counts gracefully |
| **Escaped/multi-line descriptions** | Raw CSV text with newlines, quotes | Papaparse handles; stored with spaces | AI should expect cleaned text |

### Invalid Address Patterns Filtered at Upload

| Pattern | Examples | Filter Reason |
|---------|---------|---------------|
| No street number | "Main Street" without number | `no_street_number` |
| Case number prefix | "CE-2026-04026 CE - INOPERATIVE..." | `case_number_prefix` |
| ATTN prefix | "ATTN: Building Department" | `attn_prefix` |
| Concatenated status | "816 E 2ND CLOSED 1/21/2026" | `concatenated_status` |
| Narrative text | "Neighbor called to report..." | `looks_like_description` |
| Legal descriptions | "SEC 12 LOT 3 LYG..." | `legal_description` |
| OCR garbage | Multiple pipes, random chars | `ocr_garbage` |
| Too long (>100 chars) | Full paragraphs | `too_long` |
| Too short (<5 chars) | "N/A" | `too_short` |

---

## 9. Investor-Relevant Signals

### Fields That Signal Motivated Sellers / Financial Distress

| Signal | Fields Used | Weight | Interpretation |
|--------|-----------|--------|----------------|
| **Water Shutoff** | `enforcement_type = 'water_shutoff'` | HIGHEST | Direct utility disconnection = severe financial distress or vacancy |
| **Condemned/Unsafe** | `escalated = true` + description keywords | VERY HIGH | Property deemed uninhabitable; owner under legal obligation |
| **High Snap Score (70+)** | `snap_score >= 70` | HIGH | Multi-factor enforcement pressure indicates distressed owner |
| **Repeat Offender** | `repeat_offender = true` (3+ violations) | HIGH | Pattern of non-compliance suggests inability/unwillingness to maintain |
| **Multi-Department** | `multi_department = true` | HIGH | Multiple agencies involved; coordinated enforcement pressure |
| **Extended Enforcement** | `avg_days_open > 180` | HIGH | Long-standing unresolved issues; deferred maintenance |
| **Recent Activity** | `newest_violation_date` within 30 days | MEDIUM | Active enforcement; time-sensitive opportunity |
| **Multiple Open Violations** | `open_violations >= 5` | HIGH | Active enforcement load creates motivation |
| **Vacancy Citation** | vacancy_citation in `distress_signals` | MEDIUM | Property may be vacant/abandoned; owner may be motivated |
| **Fire Damage** | fire_citation in `distress_signals` | HIGH | Major damage; potential insurance/financial distress |
| **Structural Issues** | structural_citation in `distress_signals` | HIGH | Major repair costs may exceed property value |
| **Legal/Court Referral** | enforcement_escalation in `distress_signals` | HIGH | Legal pressure creates urgency |

### Opportunity Classification Matrix

| Class | Score Range | Signals Required | Investor Action |
|-------|-----------|-----------------|-----------------|
| **Distressed** | 70-100 | Critical activity class; water shutoff, condemned, 10+ violations, escalation | Immediate outreach; highest motivation |
| **Value-Add** | 40-69 | Elevated activity class; multiple violations, structural issues, vacancy | Strong opportunity; moderate urgency |
| **Watch** | 0-39 | Monitoring activity class; minor/resolved violations | Monitor for escalation |

### Urgency Indicators for Investor Insight AI

| Urgency Level | Indicators | AI Response Should Include |
|--------------|-----------|--------------------------|
| **IMMEDIATE** | Water shutoff + open violations + recent activity | Fines accumulating, utility service disrupted, municipal deadlines |
| **HIGH** | Condemned/legal referral, 5+ open violations | Legal proceedings, board hearing dates, condemnation orders |
| **MODERATE** | 3+ violations, structural issues, vacancy | Maintenance backlog, code compliance timeline, violation categories |
| **LOW** | 1-2 resolved violations | Historical record, compliance history, no current action |

---

## 10. AI Prompt System Recommendations

### Data Fields the AI Prompt MUST Reference

For every property analyzed by Investor Insight AI, the prompt should include:

```
REQUIRED CONTEXT:
- address, city, state, zip
- snap_score (0-100)
- opportunity_class (distressed / value_add / watch)
- total_violations, open_violations
- violation_types[] (array of categories)
- distress_signals[] (array of signal keywords)
- enforcement_type ('' or 'water_shutoff')
- repeat_offender (boolean)
- multi_department (boolean)
- escalated (boolean)
- avg_days_open
- oldest_violation_date, newest_violation_date
- snap_insight (existing AI/rule-based summary)

OPTIONAL BUT VALUABLE:
- Individual violation records (violation_type, status, days_open, raw_description, opened_date)
- property_contacts (name, email, phone)
- jurisdiction enforcement_profile (JSON)
- jurisdiction ai_summary
```

### Edge Cases the AI Prompt Must Handle

1. **No violations on file** → "No enforcement actions currently documented"
2. **All violations closed** → Focus on historical record, compliance timeline
3. **Null snap_score** → Property not yet scored; state this clearly
4. **Empty distress_signals array** → No active distress indicators
5. **enforcement_type = ''** → Standard code violation, NOT water shutoff
6. **Municipal code numbers** → Don't interpret as meaningful without context
7. **Very long raw_descriptions** → Truncated to 2000 chars; may end mid-sentence
8. **County-scope with null city** → Use county + state for location context
9. **Future dates** → Reject or flag as data error
10. **Zero days_open with open status** → Date data unavailable, not "just opened"
11. **Extremely high violation counts (100+)** → Likely systematic/portfolio enforcement
12. **Stale last_analyzed_at** → Score may not reflect latest violations

### Recommended AI Prompt Structure for Investor Insight

```
SYSTEM: You are an Investor Insight AI that analyzes municipal code
enforcement data to identify real estate investment opportunities.

RULES:
1. Always cite specific data: violation counts, categories, dates, scores
2. Clearly state the opportunity_class and what it means
3. Highlight the TOP distress signals and their investor implications
4. For water_shutoff properties, always mention utility disconnection
5. For escalated properties, specify the escalation type
6. Include a recommended action (contact owner, monitor, skip)
7. If data is incomplete (null scores, no descriptions), say so

PROPERTY DATA:
{Insert structured property + violations data}

OUTPUT: Provide a 3-section investor brief:
1. ENFORCEMENT SUMMARY (what's happening)
2. DISTRESS INDICATORS (why this matters to investors)
3. RECOMMENDED ACTION (what to do next)
```

### Data Quality Improvements Needed Before Launch

| Priority | Improvement | Impact |
|----------|------------|--------|
| P0 | Ensure all properties have snap_score (run bulk-rescore) | Eliminates null score edge case |
| P0 | Backfill zip codes for all properties (run backfill-zips) | Completes location data |
| P1 | Standardize violation_type values into canonical taxonomy | Enables accurate categorization |
| P1 | Ensure raw_description is preserved for all violations | Richest data source for AI |
| P1 | Geocode all properties with null lat/lng | Enables map features |
| P2 | Add owner name / mailing address to properties table | Critical for investor outreach |
| P2 | Track fine amounts from FOIA data (currently not in violations table) | Key urgency indicator |
| P2 | Add enforcement_deadline field to violations | Time-sensitive opportunity indicator |
| P3 | Build violation_type normalization lookup table | Reduce "Other" category |
| P3 | Add property_value_estimate field | ROI calculation support |

---

## Summary Statistics

| Metric | Value |
|--------|-------|
| Total database tables | 61 |
| Core property/violation tables | 4 (properties, violations, clean_leads, property_contacts) |
| Database views | 9 |
| Edge functions | 38+ |
| SQL migrations | 229 |
| Violation classification categories | 10 (Structural, Fire, Utility, Vacancy, Safety, Zoning, Maintenance, Exterior, General Enforcement, Other) |
| Distress signal types | 21 unique signal strings |
| CSV column mappings | 10 data fields with 2-6 name variations each |
| Score range | 0-100 (3 tiers: monitoring/elevated/critical) |
| Opportunity classes | 3 (watch, value_add, distressed) |
| Known address filter patterns | 12+ invalid patterns |
| State coverage (parser) | CA, NV (50 known cities pre-compiled) |

---

*This audit was generated from static analysis of the codebase including TypeScript types (4,353 lines), edge functions (process-upload, generate-insights, bulk-rescore), SQL migrations (229 files), and service layer code. For live data counts and actual violation type distribution, connect directly to the Supabase database and run analytical queries.*
