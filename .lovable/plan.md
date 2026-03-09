

## Update Trial Export Limit from 25 to 500

### Frontend Files (UI copy changes)

1. **`src/pages/Landing.tsx`**
   - Line 269: `25 property exports` → `500 property exports`
   - Line 1007: FAQ answer — change "25 property exports" → "500 property exports"

2. **`src/pages/Pricing.tsx`**
   - Line 549: `25 property exports` → `500 property exports`

3. **`src/pages/CheckoutSuccess.tsx`**
   - Line 105: `25 property exports` → `500 property exports`

4. **`src/components/trial/TrialSignupModal.tsx`**
   - Line 238: `25 property exports` → `500 property exports`
   - Line 257: `25 total property exports` → `500 total property exports`

5. **`src/components/trial/TrialExportGate.tsx`**
   - Line 44: `all 25 trial exports` → `all 500 trial exports`

6. **`src/hooks/useTrialStatus.ts`**
   - Lines 52, 71, 173: Default fallback `25` → `500`

### Backend Files (enforcement logic)

7. **`supabase/functions/export-csv/index.ts`**
   - Line 255: Fallback `|| 25` → `|| 500`

8. **`supabase/functions/verify-subscription/index.ts`**
   - Line 188: `trial_exports_limit = 25` → `500`

9. **`supabase/functions/stripe-webhook/index.ts`**
   - Line 209: `trial_exports_limit = 25` → `500`

### Database Migration

10. **New migration** to:
    - Update `fn_get_trial_status` default from 25 to 500
    - Update `fn_increment_trial_exports` default from 25 to 500
    - Update `fn_start_trial` to set limit to 500
    - Update any existing active trial users: `UPDATE user_subscriptions SET trial_exports_limit = 500 WHERE status IN ('trial', 'trialing') AND trial_exports_limit = 25`

Total: 9 files + 1 DB migration. All changes are simple find-and-replace of the number 25 to 500 in trial-export contexts.

