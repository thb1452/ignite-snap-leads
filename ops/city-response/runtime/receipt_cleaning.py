"""Extend the existing receipt worker. Reuse its originals, archive and request proof.

A saved import envelope is immutable and is the only payload retried after an
uncertain response. No mailbox, arbitrary link, provider AI or public write calls.
"""
import hashlib
import json
from pathlib import Path
from record_privacy import canonical, clean_madison, MADISON_VERSION, require
import cleaned_import

PENDING="""WITH latest AS (
 SELECT DISTINCT ON (o.receipt_id) o.*,j.id AS source_job_id,p.id AS request_id,a.id AS submission_attempt_id,p.outlet_id,p.agency_key
 FROM public.collection_receipt_observations o
 JOIN public.collection_receipt_jobs j ON j.receipt_id=o.receipt_id AND j.observation_sha256=o.observation_sha256
 JOIN public.mailbox_processing_results m ON m.inbox_id=o.inbox_id AND m.message_id=o.message_id AND m.match_state='matched'
  AND m.input_digest=o.message_digest AND m.link_revision=o.link_revision
  AND m.result->'city_response'->>'document_action'='preserve_and_process'
 JOIN public.foia_preparations p ON p.id=m.request_job_id AND p.agency_key='us:mi:madisonheights' AND p.record_type='code_violations'
 JOIN public.foia_submission_attempts a ON a.preparation_id=p.id AND a.state='confirmed'
 WHERE o.scope='unverified_incoming' AND (j.next_attempt_at IS NULL OR j.next_attempt_at<=now()) ORDER BY o.receipt_id,o.recorded_at DESC,j.created_at DESC
) SELECT to_jsonb(o) FROM latest o
WHERE NOT EXISTS(SELECT 1 FROM public.collection_receipt_cleaning_v1 c WHERE c.receipt_id=o.receipt_id AND c.adapter_version=%s)
ORDER BY o.recorded_at,o.receipt_id LIMIT 2"""
RETRY="""SELECT jsonb_build_object('receipt_id',receipt_id,'adapter_version',adapter_version,'import_payload_text',import_payload_text,
 'import_payload_sha256',import_payload_sha256) FROM public.collection_receipt_cleaning_v1
 WHERE adapter_version=%s AND state IN ('ready_to_import','import_unconfirmed') ORDER BY updated_at,receipt_id LIMIT 2"""

def query(connect,sql,args=(),*,write=False):
    conn=connect()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute("SET LOCAL statement_timeout='20s'; SET LOCAL lock_timeout='4s'")
                if not write:cur.execute('SET TRANSACTION READ ONLY')
                cur.execute(sql,args);return cur.fetchall()
    finally:conn.close()

def prepare(connect,http,original,o):
    import receipt_code_staging as staging
    import receipt_restore
    import code_request_reader as reader
    staging.dependencies();receipt=staging.receipt
    keys={k:o[k] for k in ('receipt_id','receipt_sha256','observation_sha256')}
    backup=receipt_restore.restore_receipt(receipt=receipt,storage=staging.storage,http=http,receipt_root=original,
        **keys,scope=o['scope'],archive_id=o['archive_id'],manifest_sha256=o['archive_manifest_sha256'],apply=True)
    require(backup.get('archive_verified') is True and backup.get('local_restored') is True,'original_backup_unverified')
    handoff=receipt.verify_handoff(original,**{'receipt_id':o['receipt_id'],'expected_receipt_sha256':o['receipt_sha256'],'observation_sha256':o['observation_sha256']})
    require(handoff['scope']=='unverified_incoming'
        and set(handoff['review_reasons'])<= {'source_semantics_and_mapping_unreviewed'},'received_file_binding_requires_review')
    conn=connect()
    try:proof=reader.read_request_evidence(conn,receipt_api=receipt,receipt_root=original,**keys,apply=True).evidence()
    finally:conn.close()
    require(proof['version']=='code-request-evidence-v1','confirmed_request_required')
    p=proof['preparation'];require(p['id']==o['request_id'] and proof['attempt']['id']==o['submission_attempt_id'] and p['outlet_id']==o['outlet_id'],'original_request_changed')
    raw=receipt.read_file(Path(original)/o['receipt_id']/'original.bin',receipt.MAX_FILE)
    require(hashlib.sha256(raw).hexdigest()==o['original_sha256'],'original_hash_mismatch')
    try:
        report=clean_madison(raw,agency_key=p['agency_key'],expected_agency_key='us:mi:madisonheights',request_id=p['id'],receipt_id=o['receipt_id'],
            period_start=p['period_start'],period_end=p['period_end'])
    except ValueError:
        # Record the exception without copying the unexpected source text into logs.
        report=dict(version='record-privacy-v1',adapter_version=MADISON_VERSION,original_sha256=o['original_sha256'],input_records=0,
            passed_records=0,held_records=0,records=[],count_status='not_extracted',file_review_reason='source_layout_or_row_accounting_requires_review')
    payload=cleaned_import.envelope(report,observation=o,source_job_id=o['source_job_id'],proof=proof,backup=backup) if report['passed_records'] else None
    context={k:o[k] for k in ('receipt_id','request_id','submission_attempt_id','outlet_id','source_job_id','agency_key','observation_sha256')}
    return context,report,payload

def complete_saved(connect,saved,configuration,*,transport=cleaned_import.import_once):
    payload=json.loads(saved['import_payload_text'])
    require(hashlib.sha256(saved['import_payload_text'].encode()).hexdigest()==saved['import_payload_sha256']
        and canonical(payload)==saved['import_payload_text'],'saved_import_envelope_changed')
    outcome=None;error=None
    try:
        require(configuration is not None,'import_configuration_unavailable')
        outcome=transport(payload,**configuration)
        cleaned_import.validate_result(outcome,payload)
    except Exception as exc:
        error=str(exc) if str(exc) in ('import_configuration_unavailable','private_snap_import_unconfirmed') else 'import_receipt_unconfirmed'
    answer=query(connect,'SELECT public.city_receipt_finish_cleaning_v1(%s::uuid,%s,%s,%s::jsonb,%s)',
        (saved['receipt_id'],MADISON_VERSION,saved['import_payload_sha256'],canonical(outcome) if outcome is not None and error is None else None,error),write=True)[0][0]
    return dict(receipt_id=saved['receipt_id'],state=answer['state'],reason=error,
        insight_ready=sum(i['status']=='insight_ready' for i in outcome['items']) if outcome and not error else 0)

def run_once(connect,http,original,configuration,*,prepare_file=prepare,transport=cleaned_import.import_once):
    result=dict(scanned=0,processed=0,needs_review=0,unconfirmed=0,insight_ready=0,failed=0,items=[],sends=0,provider_calls=0)
    work=[r[0] for r in query(connect,RETRY,(MADISON_VERSION,))]
    for row in query(connect,PENDING,(MADISON_VERSION,)):
        o=row[0];result['scanned']+=1
        try:
            ctx,report,payload=prepare_file(connect,http,original,o)
            saved=query(connect,'SELECT public.city_receipt_save_cleaning_v1(%s::jsonb,%s,%s)',
                (canonical(ctx),canonical(report),canonical(payload) if payload else None),write=True)[0][0]
            result['needs_review']+=report['held_records']+int(bool(report.get('file_review_reason')))
            if saved['state'] in ('ready_to_import','import_unconfirmed'):work.append(saved)
            else:result['items'].append(dict(receipt_id=o['receipt_id'],state=saved['state']))
        except Exception:
            try:query(connect,'SELECT public.city_receipt_defer_cleaning_v1(%s::uuid,%s)',(o['source_job_id'],o['observation_sha256']),write=True)
            except Exception:pass
            result['failed']+=1;result['items'].append(dict(receipt_id=o['receipt_id'],state='needs_review',reason='receipt_preservation_or_binding_unconfirmed'))
    for saved in work:
        try:
            out=complete_saved(connect,saved,configuration,transport=transport)
            result['processed']+=int(out['state']=='imported');result['unconfirmed']+=int(out['state']=='import_unconfirmed')
            result['insight_ready']+=out['insight_ready'];result['items'].append(out)
        except Exception:
            # Saved payload remains available after an Ops write timeout. Retrying
            # reconciles the Snap receipt, never constructs a replacement payload.
            result['unconfirmed']+=1;result['items'].append(dict(receipt_id=saved['receipt_id'],state='import_unconfirmed',reason='import_receipt_unconfirmed'))
    return result


def write_health(connect,result,version):
    from datetime import datetime,timezone
    safe={k:result[k] for k in ('scanned','processed','needs_review','unconfirmed','insight_ready','failed','sends','provider_calls')}
    require(all(type(v) is int and 0<=v<=100000 for v in safe.values()),'invalid_cleaning_health')
    safe.update(checked_at=datetime.now(timezone.utc).isoformat(),status='partial' if safe['failed'] or safe['unconfirmed'] else 'complete',
        version='private-receipt-cleaning-health-v1')
    query(connect,"""INSERT INTO public.collection_worker_health(worker_name,version,last_success_at,last_error_code,last_result)
      VALUES('receipt_cleaning',%s,CASE WHEN %s THEN now() ELSE NULL END,%s,%s::jsonb)
      ON CONFLICT(worker_name) DO UPDATE SET version=excluded.version,last_success_at=coalesce(excluded.last_success_at,collection_worker_health.last_success_at),
      last_error_code=excluded.last_error_code,last_result=excluded.last_result RETURNING worker_name""",
      (version,safe['status']=='complete','private_receipt_cleaning_requires_review' if safe['status']=='partial' else None,canonical(safe)),write=True)
