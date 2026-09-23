"""Hermes intake: evidence-based matching and review suggestions only.

No send, reply, portal, LLM, attachment-fetch, parser or property-write interface.
Incoming content is untrusted. Even matched messages remain pending review.
"""
from __future__ import annotations

import argparse
from collections import Counter
from html.parser import HTMLParser
import json
import os
import re
import sys
from city_response_policy import classify, VERSION as CLASSIFIER_VERSION

VERSION = 'hermes-intake-v1'
MAX_BODY = 32000


class TextOnly(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.hidden = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style'):
            self.hidden += 1
        elif tag in ('br', 'p', 'div', 'li'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style'):
            self.hidden = max(0, self.hidden - 1)
        elif tag in ('p', 'div', 'li'):
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.hidden:
            self.parts.append(data)


def visible_text(message):
    text = message.get('body_text')
    if not text and message.get('body_html'):
        parser = TextOnly()
        parser.feed(message['body_html'][:MAX_BODY * 4])
        text = ''.join(parser.parts)
    text = (text or '')[:MAX_BODY]
    # Avoid treating a quoted older response as the current agency response.
    text = re.split(r'(?im)^\s*(?:On .{1,200}wrote:|-{2,}\s*Original Message\s*-{2,})', text)[0]
    return '\n'.join(line for line in text.splitlines() if not line.lstrip().startswith('>'))


def header_values(headers, name):
    if isinstance(headers, dict):
        values = [v for k, v in headers.items() if k.lower() == name.lower()]
    elif isinstance(headers, list):
        values = [h.get('value', h.get('Value', '')) for h in headers if isinstance(h, dict)
                  and str(h.get('name', h.get('Name', ''))).lower() == name.lower()]
    else:
        values = []
    return [str(item) for value in values for item in (value if isinstance(value, list) else [value])]


def reference_ids(message):
    values = [message.get('in_reply_to') or '']
    for name in ('in-reply-to', 'references'):
        values += header_values(message.get('headers'), name)
    result = set()
    for value in values:
        # Exact IDs only. Never search subject/body for a request identifier.
        for token in re.findall(r'<([^<>\s]+)>|([^<>\s,]+)', str(value)):
            item = token[0] or token[1]
            if len(item) <= 998:
                result.add(item)
    return result


def normalize_id(value):
    return str(value or '').strip().strip('<>')


def match_request(message, links):
    """Links are trusted receipts/reviewer decisions, never inferred sender data."""
    refs = reference_ids(message)
    candidates = set()
    reasons = set()
    for link in links:
        if link.get('inbox_id') != message.get('inbox_id'):
            continue
        if link.get('link_source') not in ('send_receipt', 'portal_confirmation', 'owner_review'):
            continue
        if not link.get('evidence_ref') or not link.get('request_job_id'):
            continue
        link_id = normalize_id(link.get('message_id'))
        by_reference = bool(link_id) and link_id in refs
        by_current_message = (bool(link_id)
                              and link.get('link_source') in ('owner_review', 'portal_confirmation')
                              and link_id == normalize_id(message.get('message_id')))
        by_thread = bool(message.get('thread_id')) and message['thread_id'] == link.get('thread_id')
        if by_reference or by_current_message or by_thread:
            candidates.add(str(link['request_job_id']))
            if by_reference:
                reasons.add('exact_reference')
            if by_current_message:
                reasons.add('explicit_current_message')
            if by_thread:
                reasons.add('recorded_provider_thread')
    ids = sorted(candidates)
    return {
        'match_state': 'matched' if len(ids) == 1 else ('ambiguous' if ids else 'unmatched'),
        'request_job_id': ids[0] if len(ids) == 1 else None,
        'candidate_job_ids': ids,
        'match_evidence': sorted(reasons),
    }


SIGNALS = {
    'fee_quote': r'\b(?:fee estimate|estimated (?:cost|fee)|cost estimate|payment required|invoice|pay(?:ment of)?\s+\$)',
    'clarification': r'\b(?:please (?:clarify|specify|confirm|narrow)|clarification (?:required|needed)|need (?:you to|additional information))\b',
    'denied': r'\b(?:request (?:is |has been )?denied|unable to provide|records are exempt|withhold(?:ing)? the records)\b',
    'closed': r'\b(?:request (?:is |has been )?(?:closed|withdrawn)|closed due to)\b',
    'delivery_available': r'\b(?:records (?:are |now )?available|responsive records (?:are )?attached|attached (?:are )?(?:the )?responsive records|download (?:the |your )?records)\b',
    'confirmation': r'\b(?:(?:we have |we.ve )?received your (?:public records |records )?request|request (?:has been |was )?(?:received|submitted successfully))\b',
    'processing': r'\b(?:request is (?:being processed|in progress)|currently processing|searching for (?:the |responsive )?records)\b',
}


def analyze(message, links, request=None):
    if message.get('review_state') == 'internal_test':
        return {'processor_version': VERSION, 'review_state': 'internal_test',
                'match_state': 'excluded', 'request_job_id': None, 'signals': [],
                'next_action': 'none_internal_test', 'usable_records': False}
    matched = match_request(message, links)
    body = visible_text(message)
    signals = sorted(name for name, pattern in SIGNALS.items() if re.search(pattern, body, re.I))
    attachments = message.get('attachments') or []
    saved = sum(a.get('status') == 'saved' and a.get('content_disposition') != 'inline' for a in attachments)
    failed = sum(a.get('status') != 'saved' and a.get('content_disposition') != 'inline' for a in attachments)
    if matched['match_state'] != 'matched':
        action = 'review_request_match'
    elif 'fee_quote' in signals:
        action = 'review_fee_and_deadline'
    elif 'clarification' in signals:
        action = 'review_clarification_and_deadline'
    elif 'denied' in signals or 'closed' in signals:
        action = 'review_agency_decision'
    elif failed:
        action = 'recover_attachment_then_review'
    elif saved or 'delivery_available' in signals:
        action = 'review_delivery_before_parsing'
    elif 'confirmation' in signals or 'processing' in signals:
        action = 'review_confirmation_and_set_portal_check'
    else:
        action = 'review_message'
    # Keep the receipt matching contract at v1. Classification is independently
    # versioned and cannot grant sending or record acceptance authority.
    trusted_request = request or {}
    prohibited = (trusted_request.get('state') == 'FL' and
                  'seminole' in str(trusted_request.get('jurisdiction','')).lower())
    city_response = classify(message, matched=matched['match_state']=='matched',prohibited_reply=prohibited)
    return dict(matched, processor_version=VERSION, review_state='pending_review',
                signals=signals, suggested_type=signals[0] if len(signals) == 1 else ('mixed' if signals else 'unknown'),
                saved_attachments=saved, attachment_problems=failed, next_action=action,
                deadline_requires_review=True, usable_records=False,city_response=city_response)


# The header checks deliberately over-select candidate receipts; match_request()
# accepts only exact References/In-Reply-To tokens, trusted current-message links,
# or recorded provider threads. Neither subjects nor bodies select candidates.
# A link change invalidates only messages with potentially relevant evidence.
PENDING_SQL = """select to_jsonb(m),md5(to_jsonb(m)::text),e.links,e.revision
    from public.mailbox_received_messages m
    join public.mailbox_sync_state s using(inbox_id)
    left join public.mailbox_processing_results r using(inbox_id,message_id)
    cross join lateral (
        select coalesce(jsonb_agg(to_jsonb(l) order by l.message_id),'[]'::jsonb) as links,
               md5(coalesce(jsonb_agg(to_jsonb(l) order by l.message_id),'[]'::jsonb)::text) as revision
        from public.foia_message_links l
        join public.foia_request_jobs j on j.id=l.request_job_id
            and j.credential_id=s.press_account_id
        where l.inbox_id=m.inbox_id
          and l.link_source in ('send_receipt','portal_confirmation','owner_review')
          and length(btrim(l.evidence_ref))>0
          and length(trim(both '<>' from btrim(l.message_id)))>0
          and (
            (l.link_source in ('owner_review','portal_confirmation')
             and trim(both '<>' from btrim(l.message_id))=trim(both '<>' from btrim(m.message_id)))
            or (m.thread_id is not null and m.thread_id<>'' and l.thread_id=m.thread_id)
            or position(trim(both '<>' from btrim(l.message_id)) in coalesce(m.in_reply_to,''))>0
            or position(trim(both '<>' from btrim(l.message_id)) in coalesce(m.headers::text,''))>0
          )
    ) e
    where s.enabled and m.review_state <> 'internal_test'
      and (r.message_id is null or r.input_digest<>md5(to_jsonb(m)::text)
           or r.link_revision<>e.revision or r.processor_version<>%s
           or r.result->'city_response'->>'version' is distinct from %s)
    order by (r.message_id is not null),r.processed_at nulls first,
             m.stored_at,m.inbox_id,m.message_id limit %s"""


def process_pending(conn, *, limit=100, apply=False):
    if not 1 <= limit <= 500:
        raise ValueError('limit_out_of_range')
    counts = Counter(processed=0, matched=0, unmatched=0, ambiguous=0)
    if apply:
        with conn.cursor() as cur:
            cur.execute("select pg_try_advisory_lock(810207,2)")
            if not cur.fetchone()[0]:
                conn.rollback()
                return {'status': 'another_intake_running'}
        conn.commit()
    try:
        with conn.cursor() as cur:
            cur.execute("select value from public.ops_control where key='hermes_intake_enabled'")
            row = cur.fetchone()
            if apply and (not row or row[0] is not True):
                return {'status': 'disabled'}
            # New messages are first; changed older results are revisited fairly.
            cur.execute(PENDING_SQL, (VERSION, CLASSIFIER_VERSION, limit))
            rows = cur.fetchall()
            job_ids=sorted({str(link['request_job_id']) for row in rows for link in row[2] if link.get('request_job_id')})
            cur.execute('select id::text,jurisdiction,state from public.foia_request_jobs where id=any(%s::uuid[])',(job_ids,))
            requests={row[0]:dict(jurisdiction=row[1],state=row[2]) for row in cur.fetchall()}
        for message, digest, links, revision in rows:
            matched=match_request(message,links)
            result = analyze(message, links,requests.get(matched['request_job_id']))
            if apply:
                with conn.cursor() as cur:
                    cur.execute("""insert into public.mailbox_processing_results
                        (inbox_id,message_id,input_digest,link_revision,processor_version,
                         request_job_id,match_state,result,processed_at)
                        values(%s,%s,%s,%s,%s,%s,%s,%s::jsonb,now())
                        on conflict(inbox_id,message_id) do update set
                         input_digest=excluded.input_digest,link_revision=excluded.link_revision,
                         processor_version=excluded.processor_version,request_job_id=excluded.request_job_id,
                         match_state=excluded.match_state,result=excluded.result,processed_at=now()""",
                        (message['inbox_id'],message['message_id'],digest,revision,VERSION,
                         result['request_job_id'],result['match_state'],json.dumps(result)))
                conn.commit()
            counts['processed'] += 1
            counts[result['match_state']] += 1
            counts['reply:'+result['city_response']['reply_action']] += 1
            counts['file:'+result['city_response']['document_action']] += 1
        if apply:
            with conn.cursor() as cur:
                cur.execute("""insert into public.collection_worker_health(worker_name,version,last_success_at,last_result)
                    values('hermes-intake',%s,now(),%s::jsonb)
                    on conflict(worker_name) do update set version=excluded.version,
                    last_success_at=excluded.last_success_at,last_error_code=null,
                    last_result=excluded.last_result""", (VERSION,json.dumps(dict(counts))))
            conn.commit()
        return dict(counts,status='completed' if apply else 'preview')
    finally:
        conn.rollback()
        if apply:
            with conn.cursor() as cur:
                cur.execute('select pg_advisory_unlock(810207,2)')
            conn.commit()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply',action='store_true',help='Write review suggestions; requires intake enable flag')
    parser.add_argument('--limit',type=int,default=100)
    args = parser.parse_args()
    try:
        from incoming_database import get_connection
        conn = get_connection('snap-ignite/hermes-intake')
    except Exception:
        print(json.dumps({'status':'error','error_code':'database_unavailable'}))
        raise SystemExit(1) from None
    try:
        if not args.apply:
            conn.set_session(readonly=True)
        print(json.dumps(process_pending(conn,limit=args.limit,apply=args.apply)))
    except Exception as exc:
        conn.rollback()
        # Log no message body, headers, provider URL, database URL or exception text.
        code = type(exc).__name__
        if args.apply:
            with conn.cursor() as cur:
                cur.execute("""insert into public.collection_worker_health(worker_name,version,last_error_code)
                    values('hermes-intake',%s,%s) on conflict(worker_name) do update
                    set last_error_code=excluded.last_error_code""",(VERSION,code))
            conn.commit()
        print(json.dumps({'status':'error','error_code':code}))
        raise SystemExit(1)
    finally:
        conn.close()


if __name__ == '__main__':
    main()
