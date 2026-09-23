"""Compile routine reply material for the existing protected reply ledger.

This module has no transport, credential, database or approval interface. The
host must obtain the policy, original receipt, current roster and message match
from trusted storage in one transaction. A compiled result is NOT permission
to send; the native ledger must validate and reserve the same material.
"""
from datetime import datetime, timezone
from email.utils import getaddresses
import hashlib
import json
from uuid import UUID, uuid5

from city_response_policy import POLICY, VERSION, classify, digest, render_routine_reply

NAMESPACE = UUID('383f8ef6-d00f-5cda-88d4-556121280eaf')
FIELDS = frozenset(('name', 'phone', 'mailing_address', 'format', 'scope'))


def require(ok, reason):
    if not ok:
        raise ValueError(reason)


def instant(value):
    try:
        result = datetime.fromisoformat(value.replace('Z', '+00:00'))
        require(result.utcoffset() is not None, 'dated_policy_required')
        return result
    except (TypeError, AttributeError, ValueError):
        raise ValueError('dated_policy_required') from None


def header_values(headers, name):
    if isinstance(headers, dict):
        return [str(v) for k, v in headers.items() if k.lower() == name]
    if isinstance(headers, list):
        return [str(h.get('value', '')) for h in headers if isinstance(h, dict)
                and str(h.get('name', '')).lower() == name]
    return []


def compile_routine_reply(*, policy, original, message, binding, roster, now=None):
    now = now or datetime.now(timezone.utc)
    require(policy.get('id') == POLICY and policy.get('enabled') is True
            and policy.get('record_type') == 'code_violations'
            and set(policy.get('allowed_fields', [])) == FIELDS
            and policy.get('authority_kind') == 'standing_user_policy'
            and policy.get('source_instruction_ref'), 'routine_policy_not_active')
    require(instant(policy.get('starts_at')) <= now < instant(policy.get('expires_at')),
            'routine_policy_expired')
    require(original.get('request_id') in policy.get('original_request_ids', [])
            and original.get('record_type') == 'code_violations'
            and original.get('state') == 'confirmed'
            and original.get('provider_message_id') and original.get('provider_thread_id')
            and original.get('receipt_ref'), 'confirmed_original_request_required')
    require(str(original.get('jurisdiction', '')).strip().lower() not in ('seminole', 'seminole county'),
            'seminole_reply_prohibited')
    require(original.get('inbox_id') == message.get('inbox_id')
            and binding.get('request_id') == original['request_id']
            and binding.get('message_id') == message.get('message_id')
            and binding.get('inbox_id') == message['inbox_id']
            and binding.get('match_state') == 'matched'
            and binding.get('evidence_ref')
            and binding.get('method') in ('exact_reference', 'recorded_provider_thread', 'verified_contact_reference'),
            'verified_original_message_match_required')
    require(message.get('thread_id') and message.get('message_id')
            and message['message_id'] != original['provider_message_id'], 'incoming_thread_required')
    sender = message.get('sender', '')
    require(isinstance(sender, str) and '\n' not in sender and '\r' not in sender,
            'sender_requires_review')
    addresses = getaddresses([sender])
    require(len(addresses) == 1 and addresses[0][1], 'single_sender_required')
    recipient = addresses[0][1].lower()
    if recipient != original.get('recipient', '').lower():
        contact = binding.get('verified_contact') or {}
        require(binding['method'] == 'verified_contact_reference'
                and contact.get('agency_key') == original.get('agency_key')
                and contact.get('address') == recipient and contact.get('evidence_ref')
                and contact.get('source_url') and contact.get('revoked') is False
                and instant(contact.get('verified_at')) <= now < instant(contact.get('expires_at')),
                'changed_sender_requires_verified_contact')
    # Auto responses cannot start a loop even if they quote an eligible question.
    automatic = header_values(message.get('headers'), 'auto-submitted')
    require(not any(v.strip().lower() != 'no' for v in automatic), 'automatic_response_no_reply')
    require(not any(v.lower() in ('bulk', 'list', 'junk') for v in header_values(message.get('headers'), 'precedence')),
            'automatic_response_no_reply')
    people = roster if isinstance(roster, list) else []
    require(len(people) == 6 and len({r.get('mailbox') for r in people}) == 6
            and len({r.get('outlet_id') for r in people}) == 6
            and all(r.get('version') == 'requester-identity-v2' and r.get('person_name')
                    and r.get('phone_number') and r.get('registration_verified') is True
                    and r.get('updated_by') for r in people), 'complete_verified_roster_required')
    current = [r for r in people if r.get('outlet_id') == original.get('outlet_id')
               and r.get('mailbox') == original['inbox_id']]
    identity = original.get('identity') or {}
    require(len(current) == 1 and identity.get('kind') == 'person'
            and identity.get('version') == 'requester-identity-v2'
            and all(identity.get(k) == current[0].get(k) for k in ('person_name', 'phone_number', 'mailbox')),
            'original_requester_must_match_current_roster')
    signature = identity.get('signature_text')
    require(isinstance(signature, str) and signature.strip()
            and original.get('text', '').endswith('\n\n' + signature), 'original_signature_required')
    classification = classify(message, matched=True)
    require(classification['reply_action'] == 'routine_candidate'
            and not classification['review_reasons'], 'routine_question_not_eligible')
    # Scope text comes from the original sent message; an incoming message cannot
    # select new dates, record types, legal assertions or recipients.
    scope = original['text'].split('\n\n' + signature)[0]
    scope = scope.split('If available,')[0].strip()
    trusted = dict(confirmed_receipt=True, record_type=original['record_type'],
                   **{k: identity[k] for k in ('person_name', 'phone_number', 'mailbox', 'signature_text')},
                   approved_mailing_address=policy.get('approved_mailing_address'), scope_excerpt=scope)
    body = render_routine_reply(classification, trusted)
    logical = [original['inbox_id'], message['message_id']]
    reply_id = str(uuid5(NAMESPACE, digest(logical)))
    material = dict(version='routine-reply-material-v1', reply_id=reply_id,
        original_request_id=original['request_id'], original_receipt_ref=original['receipt_ref'],
        source_message_key=digest(logical), message_sha256=digest(message), binding_sha256=digest(binding),
        original_sha256=digest(original), roster_sha256=digest(roster),
        policy_id=policy['id'], policy_sha256=digest(policy), classification_version=VERSION,
        question_fields=classification['question_fields'],
        authorization=dict(kind='standing_user_policy', source_instruction_ref=policy['source_instruction_ref']),
        envelope=dict(inbox_id=original['inbox_id'], display_name=original['display_name'],
            recipient=recipient, text=body, idempotency_key='reply-v1.' + reply_id,
            reply_message_id=message['message_id'], expected_thread_id=message['thread_id']))
    return dict(status='material_compiled_not_authorized', material=material,
                material_sha256=digest(material), provider_calls=0, sends=0)
