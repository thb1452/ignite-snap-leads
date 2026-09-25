import { z } from 'zod';
import { parseReceiptCaseDetail } from './receiptCaseContract.ts';
import type { QueryClient } from '@tanstack/react-query';

export const RECEIPT_PAGE_SIZE = 25;
const uuid = z.string().uuid();
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const text = z.string().trim().min(1);
const count = z.number().int().nonnegative().safe();
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
});
const timestamp = z.string().datetime({offset: true});
const acceptanceSchema = z.object({
  acceptance_id: uuid, snapshot_id: uuid, report_date: day, valid_until: timestamp,
  evidence_kind: z.enum(['synthetic', 'original_backed']), original_count: count.positive(),
  reviewed_count: count.positive(), held_count: count, coverage: z.literal('reviewed_subset'),
  freshness: z.literal('dated_snapshot'), cadence: z.literal('unverified'),
}).strict().refine(row => row.original_count - row.reviewed_count === row.held_count);
const listSchema = z.object({version: z.literal('receipt-case-acceptances-v1'), acceptances: z.array(acceptanceSchema).max(1000)}).strict();
const propertySchema = z.object({source_property_key: hash, property_id: uuid, address: text, city: text,
  state: text, case_count: count.positive(), report_date: day, existing_lead_id: uuid.nullable()}).strict();
const pageSchema = z.object({version: z.literal('receipt-case-properties-v1'), acceptance_id: uuid,
  snapshot_id: uuid, total: count, properties: z.array(propertySchema).max(RECEIPT_PAGE_SIZE)}).strict();
const handoffSchema = z.object({lead_id: uuid, activity_id: uuid, source_link_id: uuid, created: z.boolean(), replayed: z.boolean()}).strict();
export type ReceiptAcceptance = z.infer<typeof acceptanceSchema>;
export type ReceiptPropertyPage = z.infer<typeof pageSchema>;
export type ReceiptProperty = z.infer<typeof propertySchema>;
export type ReceiptHandoff = {requestId: string; acceptanceId: string; propertyKey: string; stageId: string};
export function receiptHandoffPlan(property: ReceiptProperty, acceptanceId: string, stageId: string, attempts: Map<string, ReceiptHandoff>, nextId = () => crypto.randomUUID()): {kind: 'open'; leadId: string} | {kind: 'handoff'; command: ReceiptHandoff} {
  if (property.existing_lead_id) return {kind: 'open', leadId: property.existing_lead_id};
  const key = `${acceptanceId}:${property.source_property_key}`;
  if (!attempts.has(key)) attempts.set(key, {requestId: nextId(), acceptanceId, propertyKey: property.source_property_key, stageId});
  return {kind: 'handoff', command: attempts.get(key)!};
}
type RpcName = 'fn_my_receipt_case_acceptances_v1' | 'fn_list_receipt_case_properties_v1' | 'fn_handoff_receipt_case_to_crm_v1' | 'fn_get_receipt_case_crm_detail_v1';
export type ReceiptRpc = {rpc(name: RpcName, args?: Record<string, unknown>): {abortSignal(signal: AbortSignal): PromiseLike<{data: unknown; error: unknown}>}};
type VerifyActor = (actor: string) => Promise<void>;
const failure = () => new Error('Reviewed case access could not be verified. Check access again.');
export const receiptKey = (actor: string | undefined, ...parts: (string | number)[]) => ['crm', actor ?? 'signed-out', 'receipt-cases', ...parts] as const;
export const receiptIsCurrent = (deadline: string | undefined, now = Date.now()) => !!deadline && Number.isFinite(Date.parse(deadline)) && Date.parse(deadline) > now;
export function evictReceiptSourceCache(client: Pick<QueryClient, 'cancelQueries' | 'removeQueries'>, actor: string) {
  for (const queryKey of [receiptKey(actor), ['crm', actor, 'evidence'], ['crm', actor, 'property']]) {
    void client.cancelQueries({queryKey});
    client.removeQueries({queryKey});
  }
}
export function privateActivities<T extends {activity_type: string; payload?: Record<string, unknown>}>(rows: T[]): T[] {
  return rows.filter(row => !(row.activity_type === 'system' && row.payload?.event === 'source_snapshot_linked'));
}

export function parseReceiptAcceptances(value: unknown): ReceiptAcceptance[] {
  const parsed = listSchema.safeParse(value);
  if (!parsed.success || new Set(parsed.data.acceptances.map(row => row.acceptance_id)).size !== parsed.data.acceptances.length) throw failure();
  return parsed.data.acceptances;
}
export function parseReceiptProperties(value: unknown, acceptance: ReceiptAcceptance, offset: number): ReceiptPropertyPage {
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw failure();
  const page = parsed.data;
  if (page.acceptance_id !== acceptance.acceptance_id || page.snapshot_id !== acceptance.snapshot_id ||
      page.total > acceptance.reviewed_count || page.properties.length !== Math.min(RECEIPT_PAGE_SIZE, Math.max(0, page.total - offset)) ||
      new Set(page.properties.map(row => row.source_property_key)).size !== page.properties.length ||
      new Set(page.properties.map(row => row.property_id)).size !== page.properties.length ||
      page.properties.some(row => row.report_date !== acceptance.report_date || row.case_count > acceptance.reviewed_count)) throw failure();
  return page;
}

/** Exact caller checked before and after reads, parsing and writes. No fallback reader. */
export function receiptCaseService(client: ReceiptRpc, verifyActor: VerifyActor) {
  async function call(actor: string, name: RpcName, args: Record<string, unknown> | undefined, signal: AbortSignal) {
    if (!uuid.safeParse(actor).success || signal.aborted) throw failure();
    await verifyActor(actor);
    if (signal.aborted) throw failure();
    const response = await client.rpc(name, args).abortSignal(signal);
    await verifyActor(actor);
    if (signal.aborted || response.error) throw failure();
    return response.data;
  }
  return {
    async acceptances(actor: string, signal: AbortSignal) {
      return parseReceiptAcceptances(await call(actor, 'fn_my_receipt_case_acceptances_v1', undefined, signal)).filter(row => receiptIsCurrent(row.valid_until));
    },
    async properties(actor: string, acceptance: ReceiptAcceptance, offset: number, signal: AbortSignal) {
      if (!receiptIsCurrent(acceptance.valid_until) || !Number.isInteger(offset) || offset < 0 || offset > 1000) throw failure();
      const page = parseReceiptProperties(await call(actor, 'fn_list_receipt_case_properties_v1', {
        p_acceptance_id: acceptance.acceptance_id, p_limit: RECEIPT_PAGE_SIZE, p_offset: offset,
      }, signal), acceptance, offset);
      if (!receiptIsCurrent(acceptance.valid_until)) throw failure();
      return page;
    },
    async detail(actor: string, leadId: string, propertyId: string, signal: AbortSignal) {
      if (!uuid.safeParse(leadId).success) throw failure();
      const detail = await parseReceiptCaseDetail(await call(actor, 'fn_get_receipt_case_crm_detail_v1', {p_lead_id: leadId}, signal));
      await verifyActor(actor);
      if (signal.aborted || detail.lead_id !== leadId || detail.property.id !== propertyId || !receiptIsCurrent(detail.snapshot.valid_until)) throw failure();
      return detail;
    },
    async handoff(actor: string, command: ReceiptHandoff) {
      if (![command.requestId, command.acceptanceId, command.stageId].every(value => uuid.safeParse(value).success) || !hash.safeParse(command.propertyKey).success) throw failure();
      const parsed = handoffSchema.safeParse(await call(actor, 'fn_handoff_receipt_case_to_crm_v1', {
        p_request_id: command.requestId, p_acceptance_id: command.acceptanceId,
        p_source_property_key: command.propertyKey, p_stage_id: command.stageId,
      }, new AbortController().signal));
      if (!parsed.success || parsed.data.created && parsed.data.replayed) throw failure();
      return parsed.data;
    },
  };
}

/** Bounded timer rechecks absolute time after sleep; never extends an acceptance. */
export function scheduleReceiptExpiry(deadline: string, expire: () => void, timers = {
  now: () => Date.now(), set: (callback: () => void, ms: number) => setTimeout(callback, ms), clear: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
}) {
  let cancelled = false, timer: ReturnType<typeof setTimeout>;
  function check() {
    if (cancelled) return;
    const left = Date.parse(deadline) - timers.now();
    if (!Number.isFinite(left) || left <= 0) { expire(); return; }
    timer = timers.set(check, Math.min(left, 60000));
  }
  check();
  return () => {cancelled = true; timers.clear(timer);};
}

/** A failed/pending refetch never exposes the previous successful response. */
export function visibleReceiptData<T>(state: {data?: T; isSuccess: boolean; isFetching: boolean; isError: boolean; fetchStatus?: string}, deadline?: string, now = Date.now()): T | undefined {
  return state.isSuccess && !state.isFetching && !state.isError && state.fetchStatus !== 'paused' && (!deadline || receiptIsCurrent(deadline, now)) ? state.data : undefined;
}

// A denied/failed refresh replaces cached evidence with a content-free result.
// React Query's normal error behavior would retain the last successful payload.
export async function readReceiptWithoutFallback<T>(read: () => Promise<T>): Promise<{ok: true; value: T} | {ok: false}> {
  try {return {ok: true, value: await read()};} catch {return {ok: false};}
}
