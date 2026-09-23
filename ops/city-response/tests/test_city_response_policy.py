import sys
import unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime'))
from city_response_policy import classify, render_routine_reply, current_body

class PolicyTests(unittest.TestCase):
    def msg(self,body,**kw):
        return classify(dict(body_text=body,subject=kw.pop('subject','Re: Records'),attachments=kw.pop('attachments',[])),matched=kw.pop('matched',True),**kw)

    def test_categories(self):
        for body,expected in [('Records are attached.','no_reply'),('We received your public records request.','no_reply'),('Your request is being processed.','no_reply'),('Automatic reply: out of office.','no_reply'),('Please provide your phone number.','routine_candidate'),('What is your full name?','routine_candidate'),('Would CSV be acceptable?','routine_candidate'),('Please provide your mailing address.','routine_candidate'),('The fee is $25.','waiting_for_jd'),('Please certify your residency.','waiting_for_jd'),('We need to narrow the request.','waiting_for_jd'),('Your request is denied.','waiting_for_jd'),('What date range do you want?','waiting_for_jd'),('Would you like inspections instead?','waiting_for_jd'),('Delivery has failed.','delivery_failed_no_resend'),('Please submit your request through our portal.','waiting_for_jd')]:
            with self.subTest(body=body): self.assertEqual(self.msg(body)['reply_action'],expected)

    def test_mixed_delivery_question(self):
        m=self.msg('Attached are the records. Please provide your phone number.',attachments=[{'status':'saved'}])
        self.assertEqual(m['document_action'],'preserve_and_process')
        self.assertEqual(m['reply_action'],'routine_candidate')
        self.assertFalse(m['sending_authorized'])

    def test_mixed_extra_question_never_auto(self):
        for suffix in [' Can you accept the charges?',' Send us your consent.',' Please confirm that you are a resident.',' Will you agree to our terms?']:
            with self.subTest(suffix=suffix): self.assertEqual(self.msg('Please provide your phone number.'+suffix)['reply_action'],'waiting_for_jd')

    def test_original_quote_not_new_question(self):
        m=self.msg('We received your request.\nFrom: Requester <person@example.test>\nSent: Yesterday\nPlease provide your phone number. The fee is $9.')
        self.assertEqual(m['reply_action'],'no_reply')
        self.assertEqual(m['question_fields'],[])

    def test_wrapped_quote(self):
        b='Records are attached.\nOn Wed, Sep 23, 2026 at 8:43 AM Officer <\nclerk@example.test> wrote:\nPlease provide your phone number.'
        self.assertEqual(self.msg(b)['reply_action'],'no_reply')

    def test_seminole_never_reply(self):
        self.assertEqual(self.msg('Please provide your phone number.',prohibited_reply=True)['reply_action'],'no_reply')

    def test_no_match_no_reply_authority(self):
        self.assertEqual(self.msg('Please provide your phone number.',matched=False)['reply_action'],'needs_request_match')

    def test_attachment_form_is_not_records(self):
        m=self.msg('Please fill out the attached public records request.',attachments=[{'status':'saved'}])
        self.assertEqual(m['document_action'],'preserve_form_for_review')
        self.assertEqual(m['reply_action'],'waiting_for_jd')

    def test_partial_failed_attachment_kept_separate(self):
        m=self.msg('Please provide your phone number.',attachments=[{'status':'saved'},{'status':'failed'}])
        self.assertEqual(m['document_action'],'recover_attachment')
        self.assertEqual(m['reply_action'],'routine_candidate')

    def test_stated_date(self):
        m=self.msg('We received your request. We will respond by Wednesday, October 7, 2026.')
        self.assertEqual(m['stated_dates'][0]['date'],'2026-10-07')

    def test_render_uses_only_trusted_original(self):
        original=dict(confirmed_receipt=True,record_type='code_violations',person_name='Fixture Requester',phone_number='555-0100',mailbox='fixture@example.test',signature_text='Fixture Requester\nPublication')
        reply=render_routine_reply(self.msg('Please provide your phone number.'),original)
        self.assertIn('555-0100',reply)
        self.assertTrue(reply.endswith(original['signature_text']))
        with self.assertRaises(ValueError):render_routine_reply(self.msg('Please provide your mailing address.'),original)
        with self.assertRaises(ValueError):render_routine_reply(self.msg('What date range do you want?'),original)
        with self.assertRaises(ValueError):render_routine_reply(self.msg('Please provide your phone number.'),dict(original,confirmed_receipt=False))

if __name__=='__main__': unittest.main()
