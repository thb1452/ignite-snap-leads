import { normalizeExportRequest, exportRequestFingerprint, MAX_RESERVED_EXPORT_ROWS, UUID } from '../_shared/exportRequest.ts';
import { normalizeSourceExportRequest, validateSourceExportReceipt, sourceExportCsv, sourceExportHash, SOURCE_EXPORT_FORMAT } from '../_shared/sourceExport.ts';
export const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, idempotency-key',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Expose-Headers': 'X-Export-Request-Id, X-Export-Property-Count, X-Export-Event-Count, X-Export-Acceptance-Id, X-Export-Format, X-Export-Content-SHA256',
  'Cache-Control': 'no-store',
};
function json(status: number, code: string, error: string) {
  return new Response(JSON.stringify({ code, error }), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}
function csvValue(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@|\t\r]/.test(text)) text = '\t' + text;
  return /[,"\r\n]/.test(text) ? '"' + text.replaceAll('"', '""') + '"' : text;
}
function csv(rows: any[]): string {
  const result = ['address,city,state,zip,violation_type,opened_date,status,snap_summary,snap_score'];
  for (const p of rows) {
    const violations = Array.isArray(p.violations) ? p.violations : [];
    const open = violations.filter((v: any) => ['open', 'pending', 'active', 'in progress', 'new'].some(status => String(v.status ?? '').toLowerCase().includes(status))).length;
    const types = [...new Set(violations.map((v: any) => v.violation_type).filter(Boolean))].join('; ');
    const dates = violations.map((v: any) => v.opened_date).filter(Boolean).sort();
    result.push([p.address, p.city, p.state, p.zip, types, dates[0] ?? '', `${open} open / ${violations.length} total`, p.snap_insight, p.snap_score].map(csvValue).join(','));
  }
  return result.join('\n');
}
function validReceipt(data: any, requestId: string): boolean {
  return data && ['reserved', 'replayed'].includes(data.status) && data.request_id === requestId &&
    Number.isInteger(data.row_count) && data.row_count > 0 && data.row_count <= MAX_RESERVED_EXPORT_ROWS &&
    Array.isArray(data.rows) && data.rows.length === data.row_count &&
    Array.isArray(data.property_ids) && data.property_ids.length === data.row_count && new Set(data.property_ids).size === data.row_count &&
    data.property_ids.every((id: unknown) => typeof id === 'string' && UUID.test(id));
}
function failure(error: any): Response {
  if (error?.code === '42501') return json(403, 'EXPORT_ACCESS_DENIED', 'This account is not authorized for this export.');
  if (error?.code === '22023') return json(409, 'EXPORT_REQUEST_CONFLICT', 'This export identity conflicts with its saved request. Review the saved attempt before retrying.');
  if (error?.code === 'P0001') return json(403, 'EXPORT_LIMIT_EXCEEDED', 'The selected properties exceed the available export allowance. Nothing from this attempt was charged.');
  return json(503, 'EXPORT_UNCONFIRMED', 'The export receipt is unconfirmed. Retry the same selection to reconcile this attempt.');
}

export async function handleExport(req: Request, client: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (!['GET', 'POST'].includes(req.method)) return json(405, 'METHOD_NOT_ALLOWED', 'Use GET or POST.');
  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return json(401, 'UNAUTHORIZED', 'Sign in to export.');
  let auth;
  try { auth = await client.auth.getUser(token); } catch { return failure(null); }
  if (auth.error || !auth.data?.user?.id) return json(401, 'UNAUTHORIZED', 'Sign in to export.');
  const rawId = req.headers.get('idempotency-key');
  if (!rawId || !UUID.test(rawId)) return json(400, 'EXPORT_IDENTITY_REQUIRED', 'A saved export request identity is required. Reload the app and retry.');
  const requestId = rawId.toLowerCase();
  let input;
  try {
    input = req.method === 'POST' ? await req.json() : Object.fromEntries(new URL(req.url).searchParams);
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('Invalid export request');
  } catch { return json(400, 'INVALID_EXPORT', 'Invalid export request'); }
  if ('format' in input || 'acceptanceId' in input) {
    let sourceRequest;
    try {
      if (req.method !== 'POST') throw Error('Source detail exports require POST.');
      sourceRequest = normalizeSourceExportRequest(input);
    } catch { return json(400, 'INVALID_SOURCE_EXPORT', 'Select a supported source export and its reviewed acceptance.'); }
    try {
      // The user-scoped RPC repeats admin containment, exact consumer ownership,
      // current review/mapping and subscription checks on fresh calls and replay.
      const response = await client.rpc('fn_reserve_source_export_v1', {
        p_request_id: requestId, p_acceptance_id: sourceRequest.acceptanceId,
      });
      if (response.error) return failure(response.error);
      const receipt = await validateSourceExportReceipt(response.data, requestId, sourceRequest.acceptanceId);
      const body = sourceExportCsv(receipt);
      return new Response(body, { headers: { ...headers, 'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="snapignite_source_events_${requestId}.csv"`,
        'X-Export-Request-Id': requestId, 'X-Export-Property-Count': String(receipt.row_count),
        'X-Export-Event-Count': String(receipt.event_count), 'X-Export-Acceptance-Id': sourceRequest.acceptanceId,
        'X-Export-Format': SOURCE_EXPORT_FORMAT, 'X-Export-Content-SHA256': await sourceExportHash(body),
      } });
    } catch { return failure(null); }
  }
  let request;
  try {
    if (req.method === 'GET' && input.propertyIds) input.propertyIds = input.propertyIds.split(',');
    request = normalizeExportRequest(input);
  } catch (error) { return json(400, 'INVALID_EXPORT', error instanceof Error ? error.message : 'Invalid export request'); }
  const fingerprint = await exportRequestFingerprint(request);
  const reserve = (ids: string[] | null) => client.rpc('fn_reserve_export_v1', {
    p_request_id: requestId, p_request_fingerprint: fingerprint, p_property_ids: ids, p_enforce_code_violation_only: false,
  });
  try {
    // Reconcile before repeating filtering or accounting. The DB repeats current
    // user, admin containment, period and tier checks even for old receipts.
    let response = await reserve(null);
    if (response.error) return failure(response.error);
    if (response.data?.status === 'missing' && response.data?.request_id === requestId) {
      let ids = request.propertyIds;
      if (!ids) {
        const sub = await client.from('user_subscriptions').select('plan:subscription_plans(data_tier)')
          .eq('user_id', auth.data.user.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
        if (sub.error) return failure(sub.error);
        const tier = sub.data?.plan?.data_tier ?? 'basic';
        let query = client.from('properties').select('id');
        if (request.city) query = query.eq('city', request.city);
        if (request.jurisdictionId) query = query.eq('jurisdiction_id', request.jurisdictionId);
        if (request.minScore !== null) query = query.gte('snap_score', request.minScore);
        if (request.maxScore !== null) query = query.lte('snap_score', request.maxScore);
        if (tier === 'basic') query = query.eq('enforcement_type', 'code_violation');
        const selected = await query.order('snap_score', { ascending: false, nullsFirst: false }).order('id', { ascending: true }).limit(MAX_RESERVED_EXPORT_ROWS + 1);
        if (selected.error) return failure(selected.error);
        if (!Array.isArray(selected.data) || selected.data.length === 0) return json(404, 'EMPTY_EXPORT', 'No authorized properties matched this export.');
        if (selected.data.length > MAX_RESERVED_EXPORT_ROWS) return json(400, 'EXPORT_TOO_LARGE', 'Narrow this export to 1000 properties or fewer.');
        ids = selected.data.map((row: any) => row.id);
      }
      response = await reserve(ids);
      if (response.error) return failure(response.error);
    }
    if (!validReceipt(response.data, requestId)) return failure(null);
    return new Response(csv(response.data.rows), { headers: {
      ...headers, 'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="snapignite_export_${requestId}.csv"`,
      'X-Export-Request-Id': requestId, 'X-Export-Property-Count': String(response.data.row_count),
    } });
  } catch { return failure(null); }
}
