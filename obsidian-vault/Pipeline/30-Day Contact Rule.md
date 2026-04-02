# ⏱️ 30-Day Contact Rule

## The Rule
Never contact the same jurisdiction twice within 30 days.

## Why
- Protects Snap Ignite's sender reputation
- Avoids antagonizing FOIA officers
- Keeps us legally clean in jurisdictions with anti-harassment provisions

## How I Enforce It
1. Every request logged with `Last Contacted` date in jurisdiction note
2. `Next Eligible Contact` = Last Contacted + 30 days
3. Before any send — check this field
4. If within 30 days → **do not send**, flag for queue

## Follow-Up Timing
| Days Since Send | Action |
|---|---|
| 0–14 | Wait |
| 15–30 | Prepare follow-up draft |
| 30+ | Send follow-up or re-request |

## Exceptions
- Jurisdiction responded and explicitly invited resubmission
- Request was returned as undeliverable (technical failure — not a contact)
- JR explicitly approves early re-contact
