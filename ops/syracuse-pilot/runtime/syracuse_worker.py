"""Drain registered Syracuse captures into private Snap intake; never publish.

Run under the collector's existing archive lock after collection, including on
replay. All transport capabilities are explicit; no account/session discovery.
"""
import json
from datetime import datetime
import os
import stat
from pathlib import Path
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError, URLError
from clean_syracuse import canonical, sha, require
from intake_handoff import prepare_handoff, save_outbox, deliver_saved, validate_receipt

ENDPOINT = 'https://ojyxblegxpdgaqiscxpz.supabase.co/rest/v1/rpc/fn_import_syracuse_private_v1'

class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *_args, **_kwargs): return None

def send_private(envelope, *, public_key, receipt_token):
    require(isinstance(public_key,str) and public_key and isinstance(receipt_token,str)
        and len(receipt_token)==64 and all(c in '0123456789abcdef' for c in receipt_token), 'private_import_configuration_missing')
    text=canonical(envelope)
    body=canonical(dict(p_envelope_text=text,p_envelope_sha256=sha(text.encode()))).encode()
    require(len(body)<2_000_000,'private_import_oversized')
    headers={'Content-Type':'application/json','Accept':'application/json','apikey':public_key,
        'Authorization':'Bearer '+public_key,'x-snap-receipt-token':receipt_token}
    request=None
    try:
        request=Request(ENDPOINT,data=body,headers=headers,method='POST')
        with build_opener(NoRedirect).open(request,timeout=45) as response:
            require(response.status==200,'private_import_unconfirmed')
            raw=response.read(16385); require(len(raw)<=16384,'private_import_receipt_oversized')
        return validate_receipt(json.loads(raw),envelope)
    except (HTTPError,URLError,TimeoutError,UnicodeError,json.JSONDecodeError):
        raise ValueError('private_import_unconfirmed') from None
    finally:
        headers.clear()
        if request is not None: request.headers.clear()

def checked(path,root,maximum):
    path=Path(path).absolute(); root=Path(root).absolute()
    require(path.is_relative_to(root) and not any(p.is_symlink() for p in (path,*path.parents)), 'unsafe_intake_artifact')
    require(path.is_file() and path.stat().st_size<=maximum,'invalid_intake_artifact')
    return path.read_bytes()

def process_attempt(attempt, *, root, identities, connection, send):
    """No import before the actual source registration is verified."""
    bundle=json.loads(checked(Path(attempt)/'bundle.json',root,2_000_000))
    d,r=bundle['delivery'],bundle['processing_run']
    with connection.cursor() as cursor:
        cursor.execute('SELECT d.payload_sha256,r.payload_sha256 FROM public.collection_deliveries d '
            'JOIN public.collection_processing_runs r ON r.delivery_id=d.id WHERE d.id=%s AND r.id=%s',(d['id'],r['id']))
        registered=cursor.fetchone()
    connection.rollback()
    # Registry hashes omit mutable review_state, as in DeliveryRegistry._insert.
    require(registered is not None and tuple(registered)==(sha({k:v for k,v in d.items() if k!='review_state'}),sha({k:v for k,v in r.items() if k!='review_state'})), 'registered_collection_unconfirmed')
    original=checked(Path(attempt)/'records-for-staging.json',root,16_000_000)
    artifacts=[a for a in bundle['artifacts'] if a['role']=='staging_artifact' and a['artifact_key'].endswith(':candidates.jsonl')]
    require(len(artifacts)==1,'candidate_artifact_ambiguous')
    artifact=artifacts[0]
    candidates=checked(artifact['storage_ref'],root,32_000_000)
    require(sha(candidates)==artifact['sha256'],'candidate_bytes_changed')
    envelope=prepare_handoff(input_bytes=original,candidates_bytes=candidates,bundle=bundle,identities=identities)
    path=Path(attempt)/'customer-intake-outbox.json'
    save_outbox(path,envelope)
    envelope=json.loads(checked(path,root,1_000_000))
    def link(receipt):
        try:
            with connection.cursor() as cursor:
                cursor.execute('SELECT public.fn_link_customer_intake_receipt_v1(%s::jsonb)',(canonical(receipt),))
                linked=cursor.fetchone()[0]
            connection.commit()
            return linked
        except Exception:
            connection.rollback()
            raise ValueError('source_receipt_link_unconfirmed') from None
    receipt=deliver_saved(envelope,send=send,record_receipt=link)
    # Stable durable acknowledgement: a replay status does not change identity.
    save_outbox(Path(attempt)/'customer-intake-receipt.json',{**receipt,'status':'staged'})
    return receipt

def drain_registered(*,root,identities,connection,send,not_before):
    """Bounded catch-up closes the registration/outbox crash gap across days.

    Run under the existing service lock. Skipping a period or empty source does
    not delete prior events or infer a closure. Failed receipt links stay pending.
    """
    cutover=datetime.fromisoformat(not_before.replace('Z','+00:00'))
    require(cutover.utcoffset() is not None,'intake_cutover_timezone_required')
    attempts=[]
    for file in (Path(root)/'attempts').glob('*/bundle.json'):
        bundle=json.loads(checked(file,root,2_000_000))
        collected=datetime.fromisoformat(bundle['delivery']['collected_at'].replace('Z','+00:00'))
        if collected>=cutover: attempts.append((collected,file.parent))
    require(len(attempts)<=100,'intake_backlog_needs_review')
    receipts=[]
    for _,attempt in sorted(attempts):
        receipts.append(process_attempt(attempt,root=root,identities=identities,connection=connection,send=send))
    return dict(attempts=len(receipts),events=sum(r['events'] for r in receipts),customer_accepted=False)

def _private_config(path):
    path=Path(path)
    require(not any(p.is_symlink() for p in (path,*path.parents)),'private_config_unavailable')
    info=path.stat()
    require(stat.S_ISREG(info.st_mode) and info.st_uid in (0,os.geteuid())
        and not info.st_mode&0o037 and info.st_size<=65536,'private_config_unavailable')
    return path.read_bytes()

def run_pending(root,connection):
    """Fixed host paths only; called by the existing scheduled service."""
    configuration=json.loads(_private_config('/etc/snap-receipt-processing/syracuse-pilot.json'))
    require(set(configuration)=={'not_before','identity_sha256'},'private_config_invalid')
    identities_bytes=_private_config(Path(__file__).parent/'syracuse-pilot-identities.json')
    require(sha(identities_bytes)==configuration['identity_sha256'],'private_identity_pin_changed')
    credentials=json.loads(_private_config('/etc/snap-receipt-processing/private-snap-import.json'))
    require(set(credentials)=={'public_key','receipt_token'},'private_credentials_invalid')
    try:
        return drain_registered(root=root,connection=connection,identities=json.loads(identities_bytes),
            not_before=configuration['not_before'],send=lambda e:send_private(e,**credentials))
    finally: credentials.clear()
