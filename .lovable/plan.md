

## Fix: Onboarding Modal Appearing Twice

**Root Cause**

The `OnboardingFlow` dialog passes `onOpenChange={setShowOnboarding}` directly. When a user closes the dialog via the X button or clicking outside, it only sets the state to `false` — it never calls `markOnboardingComplete()`, which means:
1. `dismissedRef` stays `false`
2. `onboarding_completed` is never saved
3. The `useEffect` timer in `useOnboarding` re-fires and opens the modal again

**Fix**

In `useOnboarding.ts`, wrap `setShowOnboarding` so that any call to close the modal also sets `dismissedRef = true` and triggers the completion mutation. This way, regardless of HOW the dialog is closed (Skip, Get Started, X button, click outside), the onboarding is marked complete.

**Changes**

1. **`src/hooks/useOnboarding.ts`** — Replace the raw `setShowOnboarding` export with a wrapper function:
   - When called with `false`, also set `dismissedRef = true` and call the mutation
   - This ensures every dismissal path marks onboarding complete

No other files need changes.

