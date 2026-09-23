"""Narrow private receipt import. No public property writes or AI transport.

The caller supplies an actually verified backup and original-request proof from
the existing receipt library. This module never accepts arbitrary destinations.
"""
from copy import deepcopy
import hashlib
import json
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from uuid import UUID

from record_privacy import canonical, require, sha, MADISON_VERSION

POLICY='existing-code-receipts-20260923-v1'
ENDPOINT='https://ojyxblegxpdgaqiscxpz.supabase.co/rest/v1/rpc/fn_import_cleaned_receipt_v1'
RECORD_FIELDS='accuracy_status address case_id category city cleaned_description closed_date evidence filed_date parcel_id privacy record_key record_kind review_reasons source_status state'.split()

def envelope(report, *, observation, source_job_id, proof, backup):
    require(report['adapter_version']==MADISON_VERSION and report['version']=='record-privacy-v1','reviewed_adapter_required')
    require(proof.get('version')=='code-request-evidence-v1' and proof['attempt']['state']=='confirmed','confirmed_original_required')
    p=proof['preparation'];a=proof['attempt'];o=observation
    require(p['record_type']=='code_violations' and p['agency_key']=='us:mi:madisonheights','reviewed_agency_required')
    require(p['id']==proof['job']['id']==a['preparation_id'] and a.get('message_id') and a.get('evidence_ref'),'original_receipt_required')
    require(all(proof[k]==o[k] for k in ('receipt_id','receipt_sha256','observation_sha256')),'receipt_binding_changed')
    require(report['original_sha256']==o['original_sha256'] and o['scope']=='unverified_incoming','original_binding_changed')
    require(backup.get('archive_verified') is True,'verified_backup_required')
    require(str(UUID(source_job_id))==source_job_id,'source_job_id_required')
    selected=[]
    for r in report['records']:
        if r['accuracy_status']!='passed':continue
        require(r['privacy']['status']=='passed' and r['privacy']['cleaned_hash']==sha(r['cleaned_description'])
            and not r['review_reasons'],'cleaning_evidence_required')
        require(r['evidence']['receipt_id']==o['receipt_id'] and r['evidence']['request_id']==p['id']
            and r['evidence']['original_sha256']==o['original_sha256'],'record_lineage_changed')
        selected.append({k:deepcopy(r[k]) for k in RECORD_FIELDS})
    require(len(selected)==report['passed_records'] and len(selected)>0,'no_passing_records')
    require(report['input_records']==len(report['records'])==report['passed_records']+report['held_records'],'row_counts_do_not_reconcile')
    return dict(version='cleaned-receipt-import-v1',policy_id=POLICY,adapter_version=MADISON_VERSION,
        agency_key=p['agency_key'],receipt_id=o['receipt_id'],request_id=p['id'],source_job_id=source_job_id,
        original_sha256=o['original_sha256'],received_at=o['received_at'],archive_id=o['archive_id'],
        archive_manifest_sha256=o['archive_manifest_sha256'],archive_verified=True,
        period_start=p['period_start'],period_end=p['period_end'],report_date=report['report_date'],
        input_count=report['input_records'],passing_count=len(selected),records=selected)

def validate_result(result,payload):
    pin=hashlib.sha256(canonical(payload).encode()).hexdigest()
    require(isinstance(result,dict) and result.get('version')=='cleaned-receipt-import-v1'
        and result.get('status') in ('imported','replayed') and result.get('receipt_id')==payload['receipt_id']
        and result.get('payload_sha256')==pin and result.get('input_count')==payload['input_count']
        and result.get('passing_count')==payload['passing_count'] and result.get('provider_calls')==0,'import_receipt_unconfirmed')
    counts=[result.get(k) for k in ('imported','reused','held')]
    require(all(type(n) is int and n>=0 for n in counts) and sum(counts)==payload['passing_count'],'import_receipt_counts_invalid')
    items=result.get('items')
    require(isinstance(items,list) and len(items)==payload['passing_count']
        and {i.get('record_key') for i in items}=={r['record_key'] for r in payload['records']},'import_receipt_rows_invalid')
    for i in items:
        require(i.get('status') in ('insight_ready','needs_review'),'import_receipt_state_invalid')
        if i['status']=='insight_ready':
            require(isinstance(i.get('version_id'),str) and len(i['version_id'])==64
                and all(c in '0123456789abcdef' for c in i['version_id']),'import_version_required')
    require(sum(i['status']=='needs_review' for i in items)==result['held'],'import_receipt_counts_invalid')
    return result

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self,*_args,**_kwargs):return None

def import_once(payload, *, public_key, receipt_token):
    """An uncertain response is retried only with the same immutable envelope."""
    require(isinstance(public_key,str) and public_key and isinstance(receipt_token,str)
        and len(receipt_token)==64 and all(c in '0123456789abcdef' for c in receipt_token),'import_configuration_unavailable')
    text=canonical(payload)
    body=canonical(dict(p_payload_text=text,p_payload_sha256=hashlib.sha256(text.encode()).hexdigest())).encode()
    require(len(body)<=4_500_000,'import_envelope_too_large')
    headers={'Content-Type':'application/json','Accept':'application/json','apikey':public_key,
             'Authorization':'Bearer '+public_key,'x-snap-receipt-token':receipt_token}
    try:
        req=Request(ENDPOINT,data=body,headers=headers,method='POST')
        with build_opener(NoRedirect).open(req,timeout=45) as response:
            require(response.status==200,'import_response_unconfirmed')
            raw=response.read(1_000_001);require(len(raw)<=1_000_000,'import_response_too_large')
        result=json.loads(raw)
    except (HTTPError,URLError,TimeoutError,UnicodeError,json.JSONDecodeError):
        raise ValueError('private_snap_import_unconfirmed') from None
    finally:
        headers.clear()
        if 'req' in locals():req.headers.clear()
    return validate_result(result,payload)
