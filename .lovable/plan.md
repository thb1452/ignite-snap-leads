

## Problem
The card for "4●● Hidden Brook CT" shows "Home Occupation,Illi..." as the violation type — this is a partial/garbled zoning sub-type that looks nonsensical to users.

## Fix
Add "home occupation" to the `isValidViolationType` rejection list or, better, add a blocklist of confusing/unhelpful violation fragments. The string "Home Occupation,Illi..." passes the current filter because "occupy" matches `VIOLATION_KEYWORDS`. 

### Changes — `src/components/live-feed/TopPressureProperties.tsx`

1. Add a blocklist regex for noisy/confusing violation types that technically match keywords but produce poor labels:
   ```ts
   const NOISY_TYPES = /home occupation|illegal occupancy certificate|^illi/i;
   ```

2. Update `isValidViolationType` to reject entries matching `NOISY_TYPES` before the keyword check:
   ```ts
   if (NOISY_TYPES.test(v)) return false;
   ```

This will cause the card to fall back to the generic "Code Violation" label, which is cleaner. No other files need changes.

