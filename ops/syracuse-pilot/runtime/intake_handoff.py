"""Build the existing private intake contract and reconcile a durable receipt.

No consumer identity is accepted here. The injected server transport must use
the private import capability; customer review/access remains a separate step.
"""
from copy import deepcopy
import json
from pathlib import Path
import os
import uuid
from clean_syracuse import VERSION, SOURCE, TERMS, NOTICE, canonical, sha, require, clean_collection

HOLD_REASONS = ['confidentiality_not_provided', 'distribution_review_pending',
    'current_private_original_proof_not_bound', 'customer_property_mapping_missing',
    'customer_entitlement_not_connected', 'customer_release_approval_missing',
    'current_building_and_unit_scope_unverified', 'unit_not_provided']

def prepare_handoff(*, input_bytes, candidates_bytes, bundle, identities):
    """All source rows reconcile, while only the bounded cohort enters intake."""
    rows = json.loads(input_bytes)
    require(sha(input_bytes) == bundle['processing_run']['input_sha256'], 'source_bytes_changed')
    candidates = [json.loads(line) for line in candidates_bytes.splitlines() if line.strip()]
    require(len(candidates) == bundle['processing_run']['candidate_rows'], 'candidate_count_changed')
    by_row = {c['source_row']: c for c in candidates}
    require(len(by_row) == len(candidates), 'candidate_rows_ambiguous')
    report = clean_collection(rows, bundle=bundle, expected_input_sha256=sha(input_bytes), parcel_evidence=identities)
    require(report['records'], 'no_clean_selected_records')
    events = []; parcels = {}; refs = []; selected_identities = []
    d, run = bundle['delivery'], bundle['processing_run']
    for record in report['records']:
        n = record['citation']['source_row']; raw = rows[n-1]; a = raw['raw_government_attributes']; c = by_row[n]
        require(c['original'] == raw and c['customer_accepted'] is False and not c['reasons'], 'candidate_binding_changed')
        original_text = canonical(raw)
        reference = dict(source_row=n, record_key=record['record_key'], original_sha256=sha(original_text.encode()),
            canonical_sha256=sha(c['canonical']), source_parcel_reference=record['parcel_id'],
            customer_property_id=None, review_reasons=HOLD_REASONS)
        refs.append(reference)
        e = dict(reference, delivery_id=d['id'], processing_run_id=run['id'],
            source_numeric_violation_id=record['government_violation_id'], source_object_id=str(a['ObjectId']),
            case_id=record['case_id'], published_violation_number=record['published_violation_number'],
            source_address=record['address'], city='Syracuse', state='NY', zip=record['zip'], source_unit='',
            original_description=record['cleaned_description'], source_status=record['source_status'],
            normalized_status=record['normalized_status'], opened_date=(record['case_opened_at'] or '')[:10],
            violation_date=record['citation_at'][:10], violation_timestamp_utc=record['citation_at'],
            status_changed_utc=record['status_changed_at'], compliance_due_utc=record['compliance_due_at'],
            source_original_json=original_text, code_source_url=SOURCE, code_collected_at=d['collected_at'],
            source_attribution=record['source_attribution'], source_notice=NOTICE, terms_url=TERMS,
            source_publication_date='', customer_accepted='false', usable_records='false', published='false',
            customer_export_authorized='false')
        e['source_row'] = str(n); e['review_reasons'] = canonical(HOLD_REASONS); e['customer_property_id'] = ''
        events.append(e)
        parcels[record['parcel_id']] = dict(source_parcel_reference=record['parcel_id'], source_address=record['address'],
            city='Syracuse', state='NY', zip=record['zip'], customer_property_id='', customer_accepted='false',
            usable_records='false', customer_export_authorized='false', published='false')
    # Preserve acquisition/processing receipt hashes, not an invented email receipt.
    preparation = dict(version='syracuse-review-preparation-v1', purpose='private_review_only', items=refs,
        delivery_id=d['id'], processing_run_id=run['id'], source_event_id=d['source_event_id'],
        delivery_payload_sha256=sha(d), processing_payload_sha256=sha(run),
        code_collected_at=d['collected_at'], violation_records=len(events), assessed_parcels=len(parcels),
        source_input_rows=len(rows), row_reconciliation=report['counts'],
        customer_accepted=False, usable_records=False, published=False, customer_export_authorized=False,
        approved_property_mappings=0, cleaning_version=VERSION)
    preparation_text = canonical(preparation); prep = sha(preparation_text.encode())
    for identity in identities:
        if identity['source_parcel_reference'] not in parcels: continue
        item = deepcopy(identity); evidence = json.loads(item['evidence_text'])
        # The same dated parcel evidence is associated with a new observation.
        evidence['prior_preparation_sha256'] = evidence['preparation_sha256']
        evidence['preparation_sha256'] = prep
        evidence['identity_evidence'] = 'Exact SBL, address and ZIP agree with the previously retrieved parcel evidence. No new parcel lookup is claimed.'
        item['evidence_text'] = canonical(evidence); item['evidence_sha256'] = sha(item['evidence_text'].encode())
        selected_identities.append(item)
    payload = dict(version='customer-intake-v1', source_project_ref='dqwolscmceelqpkfclgi',
        customer_project_ref='ojyxblegxpdgaqiscxpz', preparation_sha256=prep, preparation_text=preparation_text,
        events=events, parcels=list(parcels.values()))
    text = canonical(payload)
    return dict(version='syracuse-private-handoff-v1', preparation_sha256=prep, payload_text=text,
        payload_sha256=sha(text.encode()), identities=selected_identities, cleaning=report,
        delivery_id=d['id'], processing_run_id=run['id'], input_sha256=sha(input_bytes))

def validate_receipt(receipt, envelope):
    require(isinstance(receipt, dict) and set(receipt) == {'version','status','preparation_sha256','payload_sha256',
        'delivery_id','processing_run_id','events','parcels','customer_accepted'}, 'handoff_receipt_shape_invalid')
    require(receipt['version'] == envelope['version'] and receipt['status'] in ('staged','replayed')
        and receipt['customer_accepted'] is False, 'handoff_receipt_state_invalid')
    for field in ('preparation_sha256','payload_sha256','delivery_id','processing_run_id'):
        require(receipt[field] == envelope[field], 'handoff_receipt_binding_invalid')
    require(type(receipt['events']) is int and type(receipt['parcels']) is int
        and receipt['events'] == len(envelope['cleaning']['records'])
        and receipt['parcels'] == len(envelope['identities']), 'handoff_receipt_count_invalid')
    return receipt

def deliver_saved(envelope, *, send, record_receipt):
    """Retry the same bytes after either a destination or receipt-link timeout.

    Source health can report success only after destination validation AND the
    source-side receipt link. No new request ID or regenerated payload on retry.
    """
    receipt = validate_receipt(send(envelope), envelope)
    linked = record_receipt(receipt)
    require(linked == receipt, 'source_receipt_link_unconfirmed')
    return receipt

def save_outbox(path, envelope):
    path = Path(path)
    require(not any(p.is_symlink() for p in (path,*path.parents)), 'outbox_symlink')
    text = canonical(envelope).encode()
    if path.exists():
        require(path.read_bytes() == text, 'outbox_identity_conflict')
        return
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary=path.parent/('.intake-'+uuid.uuid4().hex)
    try:
        with os.fdopen(os.open(temporary,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600),'wb') as stream:
            stream.write(text); stream.flush(); os.fsync(stream.fileno())
        try: os.link(temporary,path,follow_symlinks=False)
        except FileExistsError:
            require(not path.is_symlink() and path.read_bytes()==text,'outbox_identity_conflict')
        fd=os.open(path.parent,os.O_RDONLY)
        try: os.fsync(fd)
        finally: os.close(fd)
    finally: temporary.unlink(missing_ok=True)
