/** Explicit mode configuration keeps sandbox billing out of customer databases. */
export function expectedStripeMode(raw: string | undefined, key: string): boolean {
  if (raw !== "true" && raw !== "false") throw new Error("STRIPE_EXPECTED_LIVEMODE_REQUIRED");
  const expected = raw === "true";
  const match = /^(?:sk|rk|rkcs)_(live|test)_/.exec(key);
  if (!match || (match[1] === "live") !== expected) throw new Error("STRIPE_KEY_MODE_MISMATCH");
  return expected;
}

export function assertStripeObjectMode(object: { livemode?: boolean }, expected: boolean): void {
  if (typeof expected !== "boolean" || typeof object.livemode !== "boolean" || object.livemode !== expected) {
    throw new Error("STRIPE_OBJECT_MODE_MISMATCH");
  }
}
