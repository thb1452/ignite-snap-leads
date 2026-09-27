import { z } from 'zod';
import { cleanEventSchema, parseAcceptedCleanEvidence, buildCleanPropertyInsights } from '../../supabase/functions/_shared/cleanInvestorEvidence.ts';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const itemSchema = z.object({
  acceptance_id: z.string().uuid(),
  acceptance_revision: hash,
  customer_property_id: z.string().uuid(),
  event: cleanEventSchema,
}).strict();
const catalogSchema = z.object({
  version: z.literal('accepted-clean-syracuse-catalog-v1'),
  as_of: z.string().datetime({ offset: true }),
  items: z.array(itemSchema).max(2000),
  observations: z.array(itemSchema).max(2000),
}).strict();

export type CleanSyracuseItem = z.infer<typeof itemSchema>;
export type CleanSyracuseProperty = {
  id: string; address: string; city: string; state: string; zip: string;
  events: CleanSyracuseItem[]; observations: CleanSyracuseItem[]; openCount: number; newestCollection: string;
  stale: boolean; acceptanceIds: string[];
  insight?: Awaited<ReturnType<typeof buildCleanPropertyInsights>>[number];
};

/** The server returns accepted clean evidence only. No legacy property/narrative fallback. */
export async function parseCleanSyracuseCatalog(input: unknown): Promise<CleanSyracuseProperty[]> {
  const response = catalogSchema.parse(input);
  const byAcceptance = new Map<string, CleanSyracuseItem[]>();
  const propertyMap = new Map<string, CleanSyracuseProperty>();
  const sourceToCustomer = new Map<string, string>();
  const customerToSource = new Map<string, string>();
  const seen = new Set<string>();

  for (const item of response.observations) {
    const sourceId = item.event.property_id;
    if ((sourceToCustomer.has(sourceId) && sourceToCustomer.get(sourceId) !== item.customer_property_id) ||
        (customerToSource.has(item.customer_property_id) &&
          customerToSource.get(item.customer_property_id) !== sourceId))
      throw new Error('Accepted property mapping disagrees across violations.');
    sourceToCustomer.set(sourceId, item.customer_property_id);
    customerToSource.set(item.customer_property_id, sourceId);
    const key = item.event.citation.delivery_id + ':' + item.event.record_key;
    if (seen.has(key)) throw new Error('Duplicate accepted violation.');
    seen.add(key);
    const group = byAcceptance.get(item.acceptance_id) ?? [];
    group.push(item);
    byAcceptance.set(item.acceptance_id, group);
  }
  for (const [acceptanceId, items] of byAcceptance) {
    await parseAcceptedCleanEvidence({
      version: 'accepted-clean-investor-evidence-v1',
      acceptance_id: acceptanceId,
      acceptance_revision: items[0].acceptance_revision,
      as_of: response.as_of,
      events: items.map(item => {
        if (item.acceptance_revision !== items[0].acceptance_revision) throw new Error('Acceptance revision changed.');
        return item.event;
      }),
    });
  }
  const latestKeys = new Set<string>();
  for (const item of response.items) {
    const key = item.customer_property_id + ':' + item.event.record_key;
    if (latestKeys.has(key)) throw new Error('Duplicate accepted violation.');
    latestKeys.add(key);
    if (!response.observations.some(observed => JSON.stringify(observed) === JSON.stringify(item)) ||
      response.observations.some(observed => observed.event.record_key === item.event.record_key &&
        Date.parse(observed.event.citation.collected_at) > Date.parse(item.event.citation.collected_at)))
      throw new Error('Latest violation does not reconcile with accepted history.');
    const e = item.event;
    const previous = propertyMap.get(item.customer_property_id);
    if (previous && (previous.address !== e.address || previous.zip !== e.zip ||
      previous.city !== e.city || previous.state !== e.state))
      throw new Error('Accepted property identity disagrees across violations.');
    const property = previous ?? {
      id: item.customer_property_id, address: e.address, city: e.city, state: e.state, zip: e.zip,
      events: [], observations: [], openCount: 0, newestCollection: e.citation.collected_at, stale: false, acceptanceIds: [],
    };
    property.events.push(item);
    if (e.normalized_status === 'open') property.openCount++;
    if (Date.parse(e.citation.collected_at) > Date.parse(property.newestCollection)) property.newestCollection = e.citation.collected_at;
    if (Date.parse(response.as_of) - Date.parse(e.citation.collected_at) > 48 * 60 * 60 * 1000) property.stale = true;
    if (!property.acceptanceIds.includes(item.acceptance_id)) property.acceptanceIds.push(item.acceptance_id);
    propertyMap.set(property.id, property);
  }
  for (const observation of response.observations) {
    const property = propertyMap.get(observation.customer_property_id);
    if (!property || !latestKeys.has(observation.customer_property_id + ':' + observation.event.record_key) ||
      property.address !== observation.event.address || property.zip !== observation.event.zip)
      throw new Error('History and current property identity disagree.');
    property.observations.push(observation);
  }
  for (const property of propertyMap.values()) {
    [property.insight] = await buildCleanPropertyInsights({as_of:response.as_of,events:property.events.map(item=>item.event)});
  }
  return [...propertyMap.values()].map(p => ({
    ...p, events: p.events.sort((a, b) => a.event.citation_at.localeCompare(b.event.citation_at)),
  })).sort((a, b) => a.address.localeCompare(b.address));
}
