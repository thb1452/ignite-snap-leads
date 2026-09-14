export const MAX_RESERVED_EXPORT_ROWS = 1000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type ExportRequest = { city: string | null; minScore: number | null; maxScore: number | null;
  jurisdictionId: string | null; propertyIds: string[] | null };

export function normalizeExportRequest(input: Record<string, unknown>): ExportRequest {
  const text = (value: unknown, uuid = false): string | null => {
    if (value == null || value === '') return null;
    if (typeof value !== 'string' || value.length > 200 || (uuid && !UUID.test(value))) throw Error('Invalid export filter');
    return uuid ? value.toLowerCase() : value.trim();
  };
  const score = (value: unknown): number | null => {
    if (value == null || value === '') return null;
    const n = typeof value === 'string' ? Number(value) : value;
    if (typeof n !== 'number' || !Number.isSafeInteger(n)) throw Error('Invalid export score');
    return n;
  };
  let propertyIds: string[] | null = null;
  if (input.propertyIds != null) {
    if (!Array.isArray(input.propertyIds) || input.propertyIds.length < 1 || input.propertyIds.length > MAX_RESERVED_EXPORT_ROWS ||
        input.propertyIds.some(id => typeof id !== 'string' || !UUID.test(id))) throw Error('Select between 1 and 1000 valid properties');
    propertyIds = [...new Set((input.propertyIds as string[]).map(id => id.toLowerCase()))].sort();
  }
  return { city: text(input.city), minScore: score(input.minScore), maxScore: score(input.maxScore),
    jurisdictionId: text(input.jurisdictionId, true), propertyIds };
}

export async function exportRequestFingerprint(request: ExportRequest): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(request)));
  return [...new Uint8Array(hash)].map(value => value.toString(16).padStart(2, '0')).join('');
}

export function getOrCreateExportAttempt(storage: Pick<Storage, 'getItem' | 'setItem'>, userId: string, fingerprint: string): { key: string; requestId: string } {
  if (!UUID.test(userId) || !/^[0-9a-f]{64}$/.test(fingerprint)) throw Error('Invalid export account or selection');
  const key = `snap-export-attempt-v1:${userId}:${fingerprint}`;
  const prior = storage.getItem(key);
  if (prior !== null) {
    let parsed;
    try { parsed = JSON.parse(prior); } catch { throw Error('Saved export attempt needs review before retrying'); }
    if (parsed?.userId !== userId || parsed?.fingerprint !== fingerprint || !UUID.test(parsed?.requestId ?? '')) {
      throw Error('Saved export attempt needs review before retrying');
    }
    return { key, requestId: parsed.requestId };
  }
  const requestId = crypto.randomUUID();
  storage.setItem(key, JSON.stringify({ userId, fingerprint, requestId }));
  return { key, requestId };
}

export function completeExportAttempt(storage: Pick<Storage, 'getItem' | 'removeItem'>, key: string, requestId: string): void {
  // A slower duplicate response must not erase a newer attempt from another tab.
  const current = storage.getItem(key);
  if (current !== null && JSON.parse(current)?.requestId === requestId) storage.removeItem(key);
}
