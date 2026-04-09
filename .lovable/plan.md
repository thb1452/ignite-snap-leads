

## Fix: Onboarding Modal Popping Up Twice

### Root Cause
When the user completes onboarding, `markOnboardingComplete` fires a mutation that on success calls `queryClient.invalidateQueries`. This triggers a refetch of the onboarding profile. During that brief refetch window, the query data can momentarily return the old `false` value, causing the `useEffect` to fire again and re-show the modal.

Additionally, `OnboardingFlow.tsx` line 243 sets a legacy `localStorage` key (`snap_onboarding_completed`) that doesn't match the user-specific key the hook checks.

### Fix (2 changes in 2 files)

**1. `src/hooks/useOnboarding.ts`**
- Add a local `dismissed` ref that gets set to `true` immediately when `markOnboardingComplete` is called
- Guard the useEffect so it never re-shows the modal once dismissed
- Remove `invalidateQueries` from the mutation's `onSuccess` (unnecessary since `staleTime: Infinity` and the local state already hides the modal)
- Set localStorage **before** the async DB call so there's no race window

**2. `src/components/onboarding/OnboardingFlow.tsx`**
- Remove the redundant `localStorage.setItem('snap_onboarding_completed', 'true')` line in `handleComplete` (the hook already handles this with the correct user-specific key)

### Result
The onboarding modal will close once and stay closed. No double-popup.

