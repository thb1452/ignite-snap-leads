import { z } from 'zod';

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const time = z.string().datetime({ offset: true });
const source = 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer/0';
// City portal labels this source item's Published Date as November 13, 2024.
// It does not publish a separate publication date for each violation.
export const SYRACUSE_DATASET_PUBLICATION_DATE = '2024-11-13';
const text = z.string().min(1).max(1000);
const reviewedDescriptions = ["2025 FCNYS - Section 806.2 - Obstruction of Means of Egress", "2025 PMCNYS - Section 109.1.3 - Structure Unfit for Human Occupancy", "2025 PMCNYS - Section 301.3 - Vacant Structures and Land", "2025 PMCNYS - Section 304.13 - Window, Skylight and Door Frames", "2025 PMCNYS - Section 304.7 - Roofs and Drainage", "SPCC - Section 27-116 (E) - Vacant Property Registry ", "SPCC - Section 27-73 (a) - Exterior Surfaces", "SPCC-Sec. 27-133 Registration"] as const;
const reviewedLimits = ["Status describes the agency record at collection; present physical condition is unverified.", "The selected citation window is not the full property history. Absence from a later collection does not mean closed.", "Case opening and violation citation dates are different; a distinct violation opening date is unavailable.", "Affected unit, current occupancy, ownership, repair cost, market value and owner intent are unavailable.", "The portal dataset is informational and is not the official city record."] as const;
export const cleanEventSchema = z.object({
  record_key: hash, property_id: z.string().uuid(), parcel_id: z.string().regex(/^[0-9.-]+$/),
  government_violation_id: z.string().regex(/^[0-9]+$/), published_violation_number: z.string().regex(/^\d{4}-\d{4,8}$/),
  case_id: z.string().regex(/^V?\d{4}-\d{4,8}$/), address: z.string().regex(/^[0-9]+[A-Za-z]? [A-Za-z0-9 .#/-]{2,160}$/), city: z.literal('Syracuse'), state: z.literal('NY'), zip: z.string().regex(/^\d{5}$/),
  cleaned_description: z.enum(reviewedDescriptions), source_status: z.enum(['Open','Closed','Void']), normalized_status: z.enum(['open','closed','void']),
  case_opened_at: time.nullable(), citation_at: time, status_changed_at: time.nullable(), compliance_due_at: time.nullable(),
  revision_sha256: hash, cleaning_version: z.literal('syracuse-clean-events-v1'), cleaned_sha256: hash,
  citation: z.object({ delivery_id:z.string().uuid(), processing_run_id:z.string().uuid(), source_row:z.number().int().positive(),
    original_sha256:hash,input_sha256:hash,source_url:z.literal(source),collected_at:time,publication_date:time.nullable(),
    parcel_evidence_sha256:hash,parcel_retrieved_at:time }).strict(),
  source_attribution:z.literal('City of Syracuse Open Data, Code Violations V2'),source_notice:z.literal("The City of Syracuse makes no representation, warranty or guarantee relating to the data or analyses derived from these data."),terms_url:z.literal('https://data.syr.gov/pages/termsofuse'),
  record_grain:z.literal('source_violation'),limitations:z.array(z.enum(reviewedLimits)).length(reviewedLimits.length),
}).strict();
const cleanFactsSchema = z.object({as_of:time,events:z.array(cleanEventSchema).min(1).max(2000)}).strict();
export const acceptedEvidenceSchema = cleanFactsSchema.extend({
  version:z.literal('accepted-clean-investor-evidence-v1'),acceptance_id:z.string().uuid(),
  acceptance_revision:hash,
}).strict();
export type AcceptedCleanEvidence = z.infer<typeof acceptedEvidenceSchema>;

const canonical = (value:unknown):string => Array.isArray(value) ? '['+value.map(canonical).join(',')+']' :
  value!==null && typeof value==='object' ? '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical((value as Record<string,unknown>)[k])).join(',')+'}' : JSON.stringify(value);
const digest = async (value:string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))))
  .map(x=>x.toString(16).padStart(2,'0')).join('');
export async function parseAcceptedCleanEvidence(input:unknown):Promise<AcceptedCleanEvidence> {
  const evidence=acceptedEvidenceSchema.parse(input);
  await validateCleanFacts(evidence);
  return evidence;
}
async function validateCleanFacts(evidence:z.infer<typeof cleanFactsSchema>) {
  const keys=new Set<string>();
  for(const event of evidence.events){
    if(keys.has(event.record_key))throw Error('Duplicate native violation identity.');
    keys.add(event.record_key);
    const {revision_sha256,cleaning_version,cleaned_sha256,citation,source_attribution,source_notice,terms_url,record_grain,limitations,...facts}=event;
    if(await digest(canonical(facts))!==revision_sha256 || await digest(canonical(['city-of-syracuse-ny','source_violation',event.government_violation_id]))!==event.record_key ||
      new Set(event.limitations).size!==reviewedLimits.length)throw Error('Clean source identity or revision does not reconcile.');
    if(event.normalized_status!==event.source_status.toLowerCase() ||
      await digest(JSON.stringify(event.cleaned_description))!==event.cleaned_sha256 ||
      Date.parse(event.citation.collected_at)>Date.parse(evidence.as_of))throw Error('Clean source evidence does not reconcile.');
  }
}

/** Only call after the server's current acceptance/access checks. Never accepts a property/raw narrative fallback. */
export async function buildInvestorOutput(input:unknown) {
  const evidence=await parseAcceptedCleanEvidence(input);
  const insights=await buildCleanPropertyInsights({as_of:evidence.as_of,events:evidence.events});
  return insights.map(insight=>({...insight,acceptance_id:evidence.acceptance_id}));
}

/** Account authorization is checked by the reader; this boundary revalidates every clean fact. */
export async function buildCleanPropertyInsights(input:unknown) {
  const evidence=cleanFactsSchema.parse(input);
  await validateCleanFacts(evidence);
  const groups=new Map<string,typeof evidence.events>();
  for(const event of evidence.events)groups.set(event.property_id,[...(groups.get(event.property_id)??[]),event]);
  return [...groups].map(([property_id,events])=>({
    property_id,as_of:evidence.as_of,
    title:'Documented enforcement history',generation_method:'deterministic_clean_source_facts',
    source_dataset_publication_date:SYRACUSE_DATASET_PUBLICATION_DATE,
    source_dataset_url:'https://data.syr.gov/datasets/107745f070b049feb38273a7ab200487_0/about',
    source_attribution:'City of Syracuse Open Data, Code Violations V2',
    source_notice:'The City of Syracuse makes no representation, warranty or guarantee relating to the data or analyses derived from these data.',
    events:events.map(e=>({record_key:e.record_key,case_id:e.case_id,violation_id:e.government_violation_id,
      description:e.cleaned_description,status_as_collected:e.source_status,case_opened_at:e.case_opened_at,
      citation_at:e.citation_at,status_changed_at:e.status_changed_at,compliance_due_at:e.compliance_due_at,citation:e.citation})),
    documented_open_count:events.filter(e=>e.normalized_status==='open').length,
    documented_open_count_basis:'Number of separate selected agency violations marked Open when collected; not a validated investment score or current physical-condition finding.',
    score:{value:null,status:'unavailable',reason:'No validated investment score or current-condition model is supported by this source selection.'},
    implications:events.map(e=>({text:e.normalized_status==='open'
      ? 'The agency recorded this violation as open at collection. Verify its current disposition before estimating repairs or considering a transaction.'
      : `The agency recorded this violation as ${e.normalized_status} at collection. This does not establish the current physical condition.`,
      basis:'interpretation',record_key:e.record_key,citation:e.citation})),
    freshness:{oldest_collection:events.map(e=>e.citation.collected_at).sort()[0],
      newest_collection:events.map(e=>e.citation.collected_at).sort().at(-1),
      stale:events.some(e=>Date.parse(evidence.as_of)-Date.parse(e.citation.collected_at)>48*60*60*1000),
      stale_after_hours:48,source_dataset_updated_at:null,
      note:'Collection age is known. The City dataset update time was not bound to these event records.'},
    limitations:[...new Set([...events.flatMap(e=>e.limitations),
      'The City dataset update time was not bound to these event records; collection age alone does not prove upstream freshness.'])],
    market_value:null,owner_intent:null,private_contacts:null,
  }));
}

function csvCell(value:unknown){
  let s=String(value??'');
  if(/^[\s]*[=+\-@|]/.test(s) || /^[\t\r\n]/.test(s))s="'"+s;
  return '"'+s.replace(/"/g,'""')+'"';
}
export async function cleanedInvestorCsv(input:unknown):Promise<string>{
  const evidence=await parseAcceptedCleanEvidence(input);
  const openByProperty=new Map<string,number>();
  for(const event of evidence.events)if(event.normalized_status==='open')
    openByProperty.set(event.property_id,(openByProperty.get(event.property_id)??0)+1);
  const columns=['property_id','case_id','government_violation_id','published_violation_number','address','city','state','zip',
    'cleaned_description','source_status','case_opened_at','citation_at','status_changed_at','compliance_due_at',
    'record_key','revision_sha256','source_url','collected_at','publication_date','delivery_id','processing_run_id','source_row',
    'original_sha256','input_sha256','cleaning_version','source_attribution','source_notice','terms_url',
    'source_access_date','dataset_publication_date','record_publication_date_note','export_as_of',
    'freshness_target_hours','older_than_freshness_target','source_update_time_note','selection_history_limit',
    'documented_open_count_in_selection','investment_score_status'];
  return [columns.join(','),...evidence.events.map(e=>{
    const row:Record<string,unknown>={...e,...e.citation,
      source_access_date:e.citation.collected_at,
      dataset_publication_date:SYRACUSE_DATASET_PUBLICATION_DATE,
      record_publication_date_note:e.citation.publication_date ? 'Source-supplied' : 'Individual record publication date not supplied',
      export_as_of:evidence.as_of,
      freshness_target_hours:48,
      older_than_freshness_target:Date.parse(evidence.as_of)-Date.parse(e.citation.collected_at)>48*60*60*1000,
      source_update_time_note:'City dataset update time not bound to this event; collection age is not upstream freshness',
      selection_history_limit:'Selected citation window only; missing later rows do not prove closure',
      documented_open_count_in_selection:openByProperty.get(e.property_id)??0,
      investment_score_status:'unavailable'};
    return columns.map(k=>csvCell(row[k])).join(',');
  })].join('\r\n');
}
