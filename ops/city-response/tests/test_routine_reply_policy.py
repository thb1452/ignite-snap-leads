from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime'))
from routine_reply_policy import compile_routine_reply, POLICY, FIELDS


def inputs():
    roster=[dict(outlet_id=f'outlet-{i}',mailbox=f'records-{i}@publication.example',
        person_name=f'Fixture Person {i}',phone_number='555-0100',version='requester-identity-v2',
        registration_verified=True,updated_by='fixture-owner') for i in range(6)]
    identity={**roster[0],'kind':'person','signature_text':'Fixture Person 0\nPublication\nrecords-0@publication.example\n555-0100'}
    return dict(policy=dict(id=POLICY,enabled=True,record_type='code_violations',allowed_fields=sorted(FIELDS),
        authority_kind='standing_user_policy',source_instruction_ref='fixture-instruction',
        original_request_ids=['request-1'],starts_at='2026-09-23T00:00:00Z',expires_at='2026-10-23T00:00:00Z',
        approved_mailing_address='123 Fixture St\nFixture City'),
        original=dict(request_id='request-1',record_type='code_violations',state='confirmed',
            provider_message_id='original-message',provider_thread_id='thread-1',receipt_ref='fixture-receipt',
            jurisdiction='Fixture City',agency_key='us:xy:fixture',inbox_id=roster[0]['mailbox'],recipient='clerk@city.example',
            display_name='Fixture Publication',outlet_id='outlet-0',identity=identity,
            text='Hello,\n\nPlease provide code records for the most recent 30 days.\n\nIf available, CSV is preferred.\n\n'+identity['signature_text']),
        message=dict(inbox_id=roster[0]['mailbox'],message_id='incoming-1',thread_id='thread-1',
            sender='City Clerk <clerk@city.example>',body_text='Please provide your phone number.',subject='Re: Request',headers={}),
        binding=dict(request_id='request-1',message_id='incoming-1',inbox_id=roster[0]['mailbox'],
            match_state='matched',evidence_ref='fixture-reference',method='exact_reference'),
        roster=roster,now=datetime(2026,9,23,12,tzinfo=timezone.utc))


class RoutinePolicyTests(unittest.TestCase):
    def test_original_mailbox_identity_and_thread_without_individual_approval(self):
        result=compile_routine_reply(**inputs());m=result['material']
        self.assertEqual(result['status'],'material_compiled_not_authorized')
        self.assertEqual(result['sends'],0)
        self.assertEqual(m['authorization']['kind'],'standing_user_policy')
        self.assertNotIn('owner_approval',m)
        self.assertNotIn('sending_release',m)
        self.assertEqual(m['envelope']['reply_message_id'],'incoming-1')
        self.assertIn('555-0100',m['envelope']['text'])

    def test_replay_same_logical_reply(self):
        a=inputs();b=deepcopy(a)
        b['now']=datetime(2026,9,23,13,tzinfo=timezone.utc)
        self.assertEqual(compile_routine_reply(**a),compile_routine_reply(**b))
        b['policy']['source_instruction_ref']='revised-fixture-policy'
        self.assertEqual(compile_routine_reply(**a)['material']['reply_id'],compile_routine_reply(**b)['material']['reply_id'])
        self.assertNotEqual(compile_routine_reply(**a)['material_sha256'],compile_routine_reply(**b)['material_sha256'])

    def test_fees_dates_legal_scope_and_uncertain_questions_cannot_compile(self):
        for body in ['Can you accept the $20 fee?', 'Please clarify your date range.',
                     'Please certify your residency.', 'Please narrow the request.',
                     'Please provide your phone number. Also send your bank account.',
                     'Attached are the records.', 'We received your request.']:
            a=inputs();a['message']['body_text']=body
            with self.subTest(body=body),self.assertRaises(ValueError):compile_routine_reply(**a)

    def test_boundaries(self):
        changes=[('original','jurisdiction','Seminole County'),('original','record_type','water_shutoff'),
                 ('original','state','uncertain'),('original','inbox_id','other@example.test'),
                 ('binding','match_state','ambiguous'),('binding','request_id','request-2'),
                 ('message','thread_id',None),('policy','enabled',False),
                 ('policy','expires_at','2026-09-23T00:00:00Z'),('policy','original_request_ids',[]),
                 ('policy','authority_kind','individual_owner_approval')]
        for section,key,value in changes:
            a=inputs();a[section][key]=value
            with self.subTest(change=(section,key)),self.assertRaises(ValueError):compile_routine_reply(**a)

    def test_changed_identity_and_missing_roster_block(self):
        for change in ('missing','name','signature'):
            a=inputs()
            if change=='missing':a['roster'].pop()
            elif change=='name':a['roster'][0]['person_name']='Different Person'
            else:a['original']['identity']['signature_text']='Different Signature'
            with self.subTest(change=change),self.assertRaises(ValueError):compile_routine_reply(**a)

    def test_forwarded_and_auto_messages_cannot_start_loop(self):
        for headers,subject in [({'Auto-Submitted':'auto-replied'},'Re: Request'),({'Precedence':'bulk'},'Re: Request'),({},'FW: Request')]:
            a=inputs();a['message'].update(headers=headers,subject=subject)
            with self.assertRaises(ValueError):compile_routine_reply(**a)

    def test_new_sender_needs_recorded_contact_proof(self):
        a=inputs();a['message'].update(sender='other@city.example',thread_id='new-thread')
        with self.assertRaises(ValueError):compile_routine_reply(**a)
        a['binding'].update(method='verified_contact_reference',verified_contact=dict(
            agency_key='us:xy:fixture',address='other@city.example',source_url='https://city.example/clerk',
            evidence_ref='fixture-verified-contact',verified_at='2026-09-23T00:00:00Z',expires_at='2026-10-23T00:00:00Z',revoked=False))
        m=compile_routine_reply(**a)['material']
        self.assertEqual(m['envelope']['recipient'],'other@city.example')
        self.assertEqual(m['envelope']['expected_thread_id'],'new-thread')
        a['binding']['verified_contact']['revoked']=True
        with self.assertRaises(ValueError):compile_routine_reply(**a)

    def test_scope_restates_original_without_new_dates(self):
        a=inputs();a['message']['body_text']='What records are you requesting?'
        body=compile_routine_reply(**a)['material']['envelope']['text']
        self.assertIn('Please provide code records for the most recent 30 days.',body)
        self.assertNotIn('2026-',body)

    def test_multisender_and_injected_contact_hold(self):
        for sender in ['clerk@city.example, attacker@elsewhere.example','clerk@city.example\nBcc: attacker@example.test']:
            a=inputs();a['message']['sender']=sender
            with self.assertRaises(ValueError):compile_routine_reply(**a)


if __name__=='__main__':unittest.main()
