"""Deterministic city correspondence triage. No I/O or authority from mail text."""
from __future__ import annotations

from datetime import datetime
import hashlib
import json
import re

VERSION = 'city-response-policy-v1'
POLICY = 'existing-code-requests-routine-replies-20260923-v1'


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, ensure_ascii=False,
                                    separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def current_body(body):
    """Exclude quoted requests: their fee disclaimer is not an incoming fee quote."""
    body = (body or '')[:32000].replace('\r\n', '\n')
    body = re.split(r'(?im)^\s*(?:On [\s\S]{1,300}?wrote:|-{2,}\s*(?:Original|Forwarded) [Mm]essage\s*-{2,}|From:\s*[^\n]+\n(?:[^\n]*\n){0,2}\s*(?:Sent|Date):)', body)[0]
    return '\n'.join(x for x in body.splitlines() if not x.lstrip().startswith('>')).strip()


PATTERNS = {
    'fee_quote': r'\b(?:fee (?:estimate|quote)|estimated (?:cost|fee)|cost estimate|payment required|invoice|deposit required|(?:cost|fee|charge|pay(?:ment)?)\s*(?:is|of|:|will be)?\s*\$\s*[0-9])',
    'legal_declaration': r'\b(?:certify|under (?:oath|penalty)|affidavit|sworn|residen(?:cy|t of)|commercial purpose|intended use|purpose of (?:your|the) request)\b',
    'terms_or_credentials': r'\b(?:accept (?:our |the )?terms|agree to|password|credit card|social security|bank account|sign (?:the|this)|consent to|waive)\b',
    'agency_form': r'\b(?:fill out|complete (?:the |this |our )?(?:attached |request )?form|attached (?:public records |open records )?request form)\b',
    'scope_change': r'\b(?:narrow|limit your request|change (?:the |your )?scope|withdraw|cancel your request|different date range)\b',
    'denied': r'\b(?:request (?:is |has been )?denied|unable to provide|records are exempt|withhold(?:ing)? (?:the )?records|no responsive records|no records (?:were )?found)\b',
    'closed': r'\b(?:request (?:is |has been )?(?:closed|withdrawn)|closed due to)\b',
    'referral': r'\b(?:forward (?:your|this) request to|re-?submit|submit (?:your|this|a new) request (?:to|through|via|at)|contact .{0,90} instead|wrong (?:department|agency|office)|does not hold (?:those|the) requested records)\b',
    'delivery_available': r'\b(?:attached|enclosed|records (?:are |now )?available|download (?:the |your )?records|here is (?:that|the) report)\b',
    'confirmation': r'\b(?:(?:we have |we.ve )?received your (?:public records |records )?request|(?:records )?request (?:has been |was |is )?(?:received|submitted successfully)|request confirmation)\b',
    'processing': r'\b(?:request is (?:being processed|in progress)|currently processing|searching for (?:the |responsive )?records|working on your request|request has been (?:forwarded|entered)|will (?:review our files|get started on your request))\b',
    'out_of_office': r'\b(?:out of (?:the )?office|automatic reply|auto(?:matic)?[- ]response)\b',
    'bounce': r'\b(?:delivery status notification.*failure|undeliverable|delivery failure|failure notice|address not found|delivery has failed)\b',
}

QUESTION_PATTERNS = {
    'phone': r'\b(?:(?:please (?:provide|confirm|send)|(?:can|could|would) you (?:provide|confirm|send)) (?:us )?(?:with )?(?:your |a )?(?:contact )?(?:phone|telephone) number|what is your (?:phone|telephone) number)\b',
    'name': r'\b(?:(?:please (?:provide|confirm|send)|(?:can|could|would) you (?:provide|confirm|send)) (?:us )?(?:with )?(?:your |the requester.s )?(?:full |personal )?name|what is your (?:full )?name)\b',
    'mailing_address': r'\b(?:(?:please (?:provide|confirm|send)|(?:can|could|would) you (?:provide|confirm|send)) (?:us )?(?:with )?(?:your |a )?mailing address|what is your mailing address)\b',
    'format': r'\b(?:(?:would|will|is|are) (?:an? )?(?:electronic (?:copy|format)|csv|excel|spreadsheet)(?: (?:file|copy|format))? (?:be )?(?:acceptable|okay|ok)|(?:what|which) (?:file )?format (?:do|would) you (?:prefer|like))\b',
    'dates': r'\b(?:what (?:dates|date range)|which (?:dates|date range)|(?:please|you) (?:clarify|confirm|specify) (?:the |your )?(?:dates|date range|time ?frame|time period))\b',
    'scope': r'\b(?:please (?:clarify|confirm|specify) (?:the |which )?(?:records|record types)|what records (?:are you|do you) (?:requesting|want|need))\b',
}


def classify(message, *, matched=False, prohibited_reply=False):
    body = current_body(message.get('body_text'))
    subject = message.get('subject') or ''
    signals = {k for k, v in PATTERNS.items() if re.search(v, subject+'\n'+body, re.I)}
    attachments = [a for a in (message.get('attachments') or []) if isinstance(a,dict) and a.get('content_disposition') != 'inline']
    saved = any(a.get('status') == 'saved' for a in attachments)
    failed = any(a.get('status') != 'saved' for a in attachments)
    questions = {k for k, v in QUESTION_PATTERNS.items() if re.search(v, body, re.I)}
    request_sentence = re.compile(r'\b(?:please (?:provide|confirm|clarify|specify|send|complete|answer|fill|submit)|(?:can|could|would) you|we (?:need|require|request)|you (?:must|need to)|(?:send|provide|confirm|accept|authorize) (?:us |your |the |our ))\b', re.I)
    sentences = re.split(r'(?<=[.!?])\s+|\n+', body)
    unresolved = []
    for sentence in sentences:
        if '?' not in sentence and not request_sentence.search(sentence):
            continue
        # Polite offers are not questions the requester needs to answer.
        if re.search(r'\b(?:if you have (?:any )?questions|please (?:let (?:us|me) know|contact (?:us|me)) if)\b', sentence, re.I):
            continue
        residual = sentence
        for pattern in QUESTION_PATTERNS.values():
            residual = re.sub(pattern, '', residual, flags=re.I)
        residual = re.sub(r'^\s*(?:hello|hi|good morning|thank you|thanks)[,!\s]*', '', residual, flags=re.I)
        residual = re.sub(r'\b(?:please|thank you|thanks|and|also|to process (?:your|the) request)\b', '', residual, flags=re.I)
        if re.sub(r'[\s,.!?;:—–-]', '', residual):
            unresolved.append('unrecognized_question')
    if questions or unresolved:
        signals.add('clarification')
    if saved:
        signals.add('delivery_available')
    if re.search(r'https?://', body) and 'delivery_available' in signals:
        signals.add('download_link')
    blockers = sorted(signals & {'fee_quote','legal_declaration','scope_change','denied','closed','referral','terms_or_credentials','agency_form'})
    blockers += sorted(set(unresolved))
    if len(message.get('body_text') or '') > 32000:
        blockers.append('full_message_review_required')
    if not message.get('body_text') and message.get('body_html'):
        blockers.append('html_only_question_review')
    if 'dates' in questions:
        blockers.append('original_date_interpretation_required')
    if re.match(r'(?i)\s*(?:FW|FWD):',subject) and questions:
        blockers.append('forwarded_question_requires_review')
    if prohibited_reply:
        reply = 'no_reply'
    elif 'bounce' in signals:
        reply = 'delivery_failed_no_resend'
    elif 'out_of_office' in signals and not questions and not unresolved:
        reply = 'no_reply'
    elif not matched:
        reply = 'needs_request_match'
    elif blockers:
        reply = 'waiting_for_jd'
    elif questions:
        reply = 'routine_candidate'
    elif saved or signals & {'delivery_available','confirmation','processing','out_of_office'}:
        reply = 'no_reply'
    else:
        reply = 'needs_message_review'
    document = ('needs_request_match' if not matched else
                'recover_attachment' if failed else
                'preserve_form_for_review' if saved and 'agency_form' in signals else
                'preserve_and_process' if saved else
                'verify_download_route' if 'download_link' in signals else 'none')
    deadlines=[]
    for match in re.finditer(r'(?i)\b(?:by|until)\s+(?:(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),?\s+)?([A-Z][a-z]+\s+\d{1,2},?\s+20\d{2})',body):
        try: value=datetime.strptime(match[1].replace(',',''),'%B %d %Y').date().isoformat()
        except ValueError: continue
        deadlines.append({'date':value,'meaning':'agency_stated_by_date','source_offset':match.start()})
    return dict(version=VERSION, policy_id=POLICY, signals=sorted(signals),
                question_fields=sorted(questions), reply_action=reply,
                document_action=document, review_reasons=sorted(set(blockers)),
                stated_dates=deadlines[:8],
                sending_authorized=False, usable_records=False)


def render_routine_reply(classification, original):
    """Use trusted original receipt/identity only; this is not a sending authorization."""
    if classification.get('reply_action') != 'routine_candidate' or classification.get('review_reasons'):
        raise ValueError('routine_reply_not_eligible')
    fields = classification['question_fields']
    if not fields or set(fields) - {'phone','name','mailing_address','format','scope'}:
        raise ValueError('routine_reply_fields_not_allowed')
    signature = original.get('signature_text')
    if not signature or not original.get('confirmed_receipt') or original.get('record_type') != 'code_violations':
        raise ValueError('original_code_request_receipt_required')
    if any(not isinstance(original.get(k),str) or not original[k].strip() for k in ('person_name','phone_number','mailbox')):
        raise ValueError('original_requester_required')
    lines = ['Hello,', '']
    for field in fields:
        if field == 'phone': lines.append('My phone number is '+original['phone_number']+'.')
        elif field == 'name': lines.append('The requester is '+original['person_name']+'.')
        elif field == 'mailing_address':
            if not original.get('approved_mailing_address'): raise ValueError('approved_address_required')
            lines.append('My mailing address is:\n'+original['approved_mailing_address'])
        elif field == 'format': lines.append('An electronic copy is preferred. Excel or CSV is preferred when available.')
        elif field == 'scope':
            if not original.get('scope_excerpt'): raise ValueError('original_scope_excerpt_required')
            lines.append('The records requested in my original email are:\n'+original['scope_excerpt'])
    lines += ['', 'Thank you.', '', signature]
    return '\n'.join(lines)
