export interface RecordIngestionStats {
  count: number;
  formattedCount: string;
  windowStart: string;
  checkedAt: string;
}

/** created_at describes arrival in Snap, never the original filing date. */
export function recordIngestionWindow(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError("A valid check date is required");
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
}

/** Missing and malformed counts are unavailable, not successful zero measurements. */
export function recordIngestionStats(count: number | null, now: Date): RecordIngestionStats {
  if (count === null || !Number.isSafeInteger(count) || count < 0) {
    throw new Error("Record count unavailable");
  }
  return { count, formattedCount: count.toLocaleString("en-US"), windowStart: recordIngestionWindow(now), checkedAt: now.toISOString() };
}
