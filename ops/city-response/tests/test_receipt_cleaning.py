import copy,hashlib,json,sys,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime'))
from record_privacy import canonical
import cleaned_import as ci
import receipt_cleaning as rc

class Recovery(unittest.TestCase):
 def setUp(self):
  self.payload={'receipt_id':'fixture','input_count':2,'passing_count':1,'records':[{'record_key':'k'}]}
  self.saved={'receipt_id':'fixture','import_payload_text':canonical(self.payload),'import_payload_sha256':hashlib.sha256(canonical(self.payload).encode()).hexdigest()}
  self.result=dict(version='cleaned-receipt-import-v1',status='imported',receipt_id='fixture',payload_sha256=self.saved['import_payload_sha256'],input_count=2,passing_count=1,imported=1,reused=0,held=0,provider_calls=0,items=[dict(record_key='k',status='insight_ready',version_id='a'*64)])
 def test_timeout_keeps_same_payload_and_recovery_validates_receipt(self):
  saved=copy.deepcopy(self.saved);calls=[]
  def query(_c,sql,args=(),**kw):
   calls.append(args);return [[dict(state='imported' if args[3] else 'import_unconfirmed')]]
  def timeout(*a,**kw):raise TimeoutError()
  with patch.object(rc,'query',query):
   self.assertEqual(rc.complete_saved(None,self.saved,{},transport=timeout)['state'],'import_unconfirmed')
   self.assertEqual(rc.complete_saved(None,self.saved,{},transport=lambda p,**kw:self.result)['state'],'imported')
  self.assertEqual(self.saved,saved);self.assertEqual(calls[0][2],calls[1][2])
 def test_wrong_response_never_marks_imported(self):
  bad={**self.result,'payload_sha256':'b'*64};calls=[]
  def query(_c,sql,args=(),**kw):calls.append(args);return [[dict(state='import_unconfirmed')]]
  with patch.object(rc,'query',query):rc.complete_saved(None,self.saved,{},transport=lambda p,**kw:bad)
  self.assertIsNone(calls[0][3]);self.assertEqual(calls[0][4],'import_receipt_unconfirmed')
 def test_changed_stored_payload_does_not_send(self):
  with self.assertRaisesRegex(ValueError,'saved_import_envelope_changed'):
   rc.complete_saved(None,{**self.saved,'import_payload_text':'{}'},None,transport=lambda *a: self.fail('must not send'))
 def test_missing_configuration_records_actionable_failure(self):
  with patch.object(rc,'query',lambda c,s,args,**kw:[[dict(state='import_unconfirmed')]]):
   self.assertEqual(rc.complete_saved(None,self.saved,None)['reason'],'import_configuration_unavailable')
 def test_bad_file_does_not_stop_another_file_or_import_recovery(self):
  calls=[]
  def query(_c,sql,args=(),**kw):
   calls.append(sql)
   if sql==rc.RETRY:return [[self.saved]]
   if sql==rc.PENDING:return [[{'receipt_id':'bad','source_job_id':'bad','observation_sha256':'bad'}],[{'receipt_id':'good'}]]
   if 'defer' in sql:return [[True]]
   if 'save' in sql:return [[{'state':'needs_review'}]]
   if 'finish' in sql:return [[dict(state='imported')]]
   self.fail('unexpected SQL')
  def prepare(c,h,o,item):
   if item['receipt_id']=='bad':raise ValueError('do not log sensitive source')
   return {},{'held_records':2},None
  with patch.object(rc,'query',query):
   result=rc.run_once(None,None,None,{},prepare_file=prepare,transport=lambda p,**kw:self.result)
  self.assertEqual((result['failed'],result['needs_review'],result['processed']),(1,2,1))
  self.assertNotIn('sensitive source',canonical(result));self.assertTrue(any('defer' in s for s in calls))
 def test_response_counts_and_duplicate_keys_are_verified(self):
  for bad in [{**self.result,'imported':2},{**self.result,'items':[]},{**self.result,'held':1}]:
   with self.assertRaises(ValueError):ci.validate_result(bad,self.payload)
 def test_redirects_cannot_forward_bridge_key(self):
  self.assertIsNone(ci.NoRedirect().redirect_request(None,None,None,None,None,None))
if __name__=='__main__':unittest.main()
