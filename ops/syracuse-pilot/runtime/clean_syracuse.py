"""Syracuse pilot: closed source vocabulary, native violation identity, no raw fallback.

This is an ingestion boundary, independent of investor accounts. Source intake,
privacy qualification, and customer authorization are separate receipts.
"""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import re
import uuid

VERSION = 'syracuse-clean-events-v1'
SOURCE = 'https://services6.arcgis.com/bdPqSfflsdgFRVVM/arcgis/rest/services/Code_Violations_V2/FeatureServer/0'
TERMS = 'https://data.syr.gov/pages/termsofuse'
NOTICE = 'The City of Syracuse makes no representation, warranty or guarantee relating to the data or analyses derived from these data.'
AUTHORITY = 'city-of-syracuse-ny'
# Exact published code labels reviewed for this bounded pilot. A matching prefix,
# regex absence of a phone number, or a model judgement cannot approve narrative.
DESCRIPTIONS = frozenset([
    'SPCC - Section 27-116 (E) - Vacant Property Registry ',
    '2025 PMCNYS - Section 109.1.3 - Structure Unfit for Human Occupancy',
    'SPCC-Sec. 27-133 Registration',
    'SPCC - Section 27-73 (a) - Exterior Surfaces',
    '2025 PMCNYS - Section 304.7 - Roofs and Drainage',
    '2025 PMCNYS - Section 304.13 - Window, Skylight and Door Frames',
    '2025 PMCNYS - Section 301.3 - Vacant Structures and Land',
    '2025 FCNYS - Section 806.2 - Obstruction of Means of Egress',
])
STATUSES = {'Open': 'open', 'Closed': 'closed', 'Void': 'void'}
PILOT_PARCELS = ('002.-15-10.0', '003.-13-11.0', '007.-14-07.0')
LIMITS = [
    'Status describes the agency record at collection; present physical condition is unverified.',
    'The selected citation window is not the full property history. Absence from a later collection does not mean closed.',
    'Case opening and violation citation dates are different; a distinct violation opening date is unavailable.',
    'Affected unit, current occupancy, ownership, repair cost, market value and owner intent are unavailable.',
    'The portal dataset is informational and is not the official city record.',
]

def canonical(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False, allow_nan=False)

def sha(value):
    return hashlib.sha256(value if isinstance(value, bytes) else canonical(value).encode()).hexdigest()

def require(value, code):
    if not value:
        raise ValueError(code)

def instant(value):
    if value is None:
        return None
    require(type(value) is int, 'source_timestamp_invalid')
    return datetime.fromtimestamp(value / 1000, timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')

def source_property_id(parcel):
    return str(uuid.uuid5(uuid.NAMESPACE_URL, 'urn:snapignite:property:' + AUTHORITY + ':sbl:' + parcel))

def clean_collection(rows, *, bundle, expected_input_sha256, parcel_evidence, source_publication_date=None):
    """Clean complete input; select a fixed parcel cohort without truncating cases.

    parcel_evidence is the pre-existing exact parcel snapshot, with its original
    retrieval date. It is not represented as a new property lookup.
    """
    d, run = bundle['delivery'], bundle['processing_run']
    require(d['source_url'] == SOURCE and d['record_type'] == 'code_violations', 'source_binding_invalid')
    require(d['id'] == run['delivery_id'] and d['source_rows'] == run['input_rows'] == len(rows), 'input_count_mismatch')
    require(run['input_sha256'] == expected_input_sha256, 'input_pin_mismatch')
    require(run['input_rows'] == run['candidate_rows'] + run['duplicate_rows'] + run['held_rows'], 'stage_count_mismatch')
    require(d['customer_accepted'] is False and run['customer_accepted'] is False, 'unexpected_release_state')
    evidence = {x['source_parcel_reference']: x for x in parcel_evidence}
    require(len(evidence) == len(parcel_evidence) and set(PILOT_PARCELS) <= set(evidence), 'parcel_evidence_incomplete')
    for sbl in PILOT_PARCELS:
        e = evidence[sbl]
        require(sha(e['evidence_text'].encode()) == e['evidence_sha256'], 'parcel_hash_mismatch')
        p = json.loads(e['evidence_text'])
        require(e['property_id'] == p['property_id'] == source_property_id(sbl)
                and p['source_parcel_reference'] == sbl and p['source_authority'] == AUTHORITY,
                'parcel_identity_mismatch')
    versions = defaultdict(set)
    for row in rows:
        a = row.get('raw_government_attributes') or {}
        versions[str(a.get('violation_id'))].add(sha(a))
    counts = Counter(); cleaned = []; held = []; seen = set()
    for n, row in enumerate(rows, 1):
        a = row.get('raw_government_attributes') or {}
        sbl = a.get('SBL')
        if sbl not in PILOT_PARCELS:
            counts['outside_selection'] += 1
            continue
        reasons = []
        vid = a.get('violation_id')
        if type(vid) is not int or vid <= 0: reasons.append('invalid_native_violation_id')
        if len(versions[str(vid)]) != 1: reasons.append('conflicting_native_violation_id')
        if a.get('violation') not in DESCRIPTIONS: reasons.append('unreviewed_source_description')
        if a.get('status_type_name') not in STATUSES: reasons.append('unmapped_source_status')
        if not re.fullmatch(r'V?\d{4}-\d{4,8}', str(a.get('complaint_number', ''))): reasons.append('invalid_case_id')
        if not re.fullmatch(r'\d{4}-\d{4,8}', str(a.get('violation_number', ''))): reasons.append('invalid_published_violation_id')
        p = json.loads(evidence[sbl]['evidence_text'])
        pa = p['source_feature']['attributes']
        # Exact source parcel/address/ZIP, never a fuzzy match or contact lookup.
        if (str(a.get('complaint_address', '')).strip().upper() != str(pa['FullAddres']).strip().upper()
                or str(a.get('complaint_zip')) != str(pa['Zip'])): reasons.append('parcel_address_mismatch')
        dates = {}
        try:
            dates = {k: instant(a.get(k)) for k in ('open_date','violation_date','status_date','comply_by_date')}
            if dates['violation_date'] is None: reasons.append('missing_citation_date')
            elif not d['period']['start_inclusive'] <= dates['violation_date'][:10] < d['period']['end_exclusive']:
                reasons.append('citation_outside_collection_window')
            collected = datetime.fromisoformat(d['collected_at'].replace('Z', '+00:00'))
            for key in ('open_date', 'violation_date', 'status_date'):
                if dates[key] and datetime.fromisoformat(dates[key].replace('Z', '+00:00')) > collected:
                    reasons.append('event_after_collection')
        except (ValueError, TypeError, OverflowError): reasons.append('source_timestamp_invalid')
        if reasons:
            counts['held'] += 1
            held.append({'source_row': n, 'original_sha256': sha(row), 'reasons': sorted(set(reasons))})
            continue
        if vid in seen:
            counts['duplicates'] += 1
            continue
        seen.add(vid)
        key = sha([AUTHORITY, 'source_violation', str(vid)])
        facts = dict(record_key=key, property_id=source_property_id(sbl), parcel_id=sbl,
            government_violation_id=str(vid), published_violation_number=a['violation_number'],
            case_id=a['complaint_number'], address=a['complaint_address'], city='Syracuse', state='NY',
            zip=str(a['complaint_zip']), cleaned_description=a['violation'], source_status=a['status_type_name'],
            normalized_status=STATUSES[a['status_type_name']], case_opened_at=dates['open_date'],
            citation_at=dates['violation_date'], status_changed_at=dates['status_date'], compliance_due_at=dates['comply_by_date'])
        # Facts revision excludes retrieval time, IDs and row order. A repeat
        # observation can link a fresh receipt without duplicating a violation.
        revision = sha(facts)
        citation = dict(delivery_id=d['id'], processing_run_id=run['id'], source_row=n,
            original_sha256=sha(row), input_sha256=expected_input_sha256,
            source_url=SOURCE, collected_at=d['collected_at'], publication_date=source_publication_date,
            parcel_evidence_sha256=evidence[sbl]['evidence_sha256'], parcel_retrieved_at=p['source_retrieved_at'])
        cleaned.append(dict(**facts, revision_sha256=revision, cleaning_version=VERSION,
            cleaned_sha256=sha(a['violation']), citation=citation,
            source_attribution='City of Syracuse Open Data, Code Violations V2', source_notice=NOTICE,
            terms_url=TERMS, record_grain='source_violation', limitations=LIMITS))
        counts['cleaned'] += 1
    require(sum(counts.values()) == len(rows), 'row_reconciliation_failed')
    return dict(version=VERSION, delivery_id=d['id'], processing_run_id=run['id'],
        source_rows=len(rows), counts={k:counts[k] for k in ('cleaned','held','duplicates','outside_selection')},
        records=cleaned, held=held, customer_accepted=False)

def reconcile(previous, current):
    """No missing-row closure inference; distinguish updates from observations."""
    old = {r['record_key']: r for r in previous['records']}
    new = {r['record_key']: r for r in current['records']}
    require(len(old) == len(previous['records']) and len(new) == len(current['records']), 'duplicate_clean_identity')
    return dict(new=sum(k not in old for k in new),
        updated=sum(k in old and old[k]['revision_sha256'] != r['revision_sha256'] for k,r in new.items()),
        unchanged=sum(k in old and old[k]['revision_sha256'] == r['revision_sha256'] for k,r in new.items()),
        not_observed=sum(k not in new for k in old), inferred_closures=0)
