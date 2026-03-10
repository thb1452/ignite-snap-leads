

# Plan: Remove Municipal Court Dates + Build Real-Time Alerts

## 1. Remove Municipal Court Dates references

**Landing page (`src/pages/Landing.tsx`):**
- Remove the "Municipal Court Dates" card from the 8-item features grid (lines 511-516), making it a 7-item grid
- Remove the "Municipal court dates" row from the comparison table (line 889)

**Also remove from:**
- `src/pages/CodeEnforcementData.tsx` if referenced (checked — not present there)

---

## 2. Real-Time Alerts Feature

### Concept
When a user saves/tracks a property, they automatically get in-app alerts when new violations are filed against that property or its SnapScore changes significantly. Alerts appear via a bell icon in the app header with an unread count badge.

### Database

**New table: `user_alerts`**
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid | references auth.users |
| property_id | uuid | references properties |
| alert_type | text | `new_violation`, `score_change`, `status_change` |
| title | text | Short summary |
| body | text | Detail message |
| is_read | boolean | default false |
| created_at | timestamptz | default now() |

RLS: Users can only read/update their own alerts.

**Database trigger** on `violations` INSERT: for each new violation, look up users who have that property saved in `saved_properties`, then insert an alert row for each.

### Frontend Components

1. **`NotificationBell`** — bell icon in `AppLayout` header with unread count badge. Clicking opens a dropdown/popover listing recent alerts with property name, violation type, and time ago. "Mark all read" button.

2. **`useAlerts` hook** — queries `user_alerts` for current user, ordered by created_at desc, with unread count. Uses Supabase realtime subscription for instant updates.

3. **Alert settings toggle** — add an "Escalation Alerts" toggle to the existing `NotificationsSection` in Settings (alongside the weekly digest toggle) so users can opt in/out.

### Data Flow

```text
New violation inserted
       │
       ▼
DB trigger fires ──► For each user with property saved:
                        INSERT into user_alerts
       │
       ▼
Supabase Realtime ──► Frontend NotificationBell updates
                       badge count + shows new alert
```

### Files to Create/Modify

| File | Action |
|------|--------|
| `src/pages/Landing.tsx` | Remove municipal court dates card + comparison row |
| Migration SQL | Create `user_alerts` table + RLS + trigger function |
| `src/hooks/useAlerts.ts` | New hook: fetch alerts, mark read, realtime subscription |
| `src/components/layout/NotificationBell.tsx` | New: bell icon + dropdown popover |
| `src/components/layout/AppLayout.tsx` | Add NotificationBell to header |
| `src/components/settings/NotificationsSection.tsx` | Add escalation alerts toggle |
| `src/hooks/useEmailPreferences.ts` | Add `escalation_alerts_enabled` field |
| Migration SQL | Add `escalation_alerts_enabled` column to `email_preferences` |

