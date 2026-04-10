

# Plan: "Request Your Market" Feature

## What We're Building
A new "Request a Market" section on the Settings page where users can submit city/state requests for data coverage expansion. Requests are stored in a database table and users see their past requests with status updates.

## Steps

### 1. Create `market_requests` database table
- Columns: `id` (uuid PK), `user_id` (uuid, not null), `market_name` (text, not null), `status` (text, default `'pending'`), `created_at` (timestamptz, default now()), `notified_at` (timestamptz, nullable)
- RLS policies: users can INSERT and SELECT their own rows; admins get full access

### 2. Create `MarketRequestSection` component
- New file: `src/components/settings/MarketRequestSection.tsx`
- A Card matching the existing settings design with:
  - A text input for "City, State"
  - A submit button that inserts directly into `market_requests` via Supabase client
  - A success toast: "Request received! We'll email you when [market] is available."
  - Below the form, a list of the user's past requests showing market name, status badge, and date

### 3. Add section to Settings page
- Import and render `MarketRequestSection` between `PrivacySection` and `HelpSection`

### 4. Add contextual prompt on Leads page (optional secondary touchpoint)
- When search returns zero results, show a "Don't see your market? Request it" link pointing to `/settings?tab=market-request`

## Technical Details
- No edge function needed; the insert goes directly via the Supabase JS client with RLS protecting writes to `user_id = auth.uid()`
- The admin console already exists for managing data; admins can query and update `market_requests.status` directly
- Table types will auto-generate after migration

