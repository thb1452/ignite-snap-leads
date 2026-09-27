import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime'))
import syracuse_worker as w
from clean_syracuse import canonical,sha

class WorkerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve();self.attempt=self.root/'attempts'/'capture';self.attempt.mkdir(parents=True)
        (self.attempt/'records-for-staging.json').write_text('[]')
        candidates=self.attempt/'candidates.jsonl';candidates.write_text('{}\n')
        self.bundle={'delivery':{'id':'delivery'},'processing_run':{'id':'run','review_state':'pending_review'},
            'artifacts':[{'role':'staging_artifact','artifact_key':'test:candidates.jsonl','storage_ref':str(candidates),'sha256':sha(candidates.read_bytes())}]}
        (self.attempt/'bundle.json').write_text(canonical(self.bundle))
        self.envelope=dict(version='syracuse-private-handoff-v1',preparation_sha256='a'*64,payload_sha256='b'*64,
            delivery_id='delivery',processing_run_id='run',cleaning={'records':[1]},identities=[1])
        self.receipt={k:self.envelope[k] for k in ['version','preparation_sha256','payload_sha256','delivery_id','processing_run_id']}
        self.receipt.update(status='staged',events=1,parcels=1,customer_accepted=False)
        self.sent=[];self.registered=True;self.link_fails=False;self.linked=[]
        self.prepare=patch.object(w,'prepare_handoff',return_value=self.envelope);self.prepare.start();self.addCleanup(self.prepare.stop)
    def cursor(self):return self
    def __enter__(self):return self
    def __exit__(self,*_):pass
    def rollback(self):pass
    def commit(self):pass
    def execute(self,query,args):
        if 'fn_link_' in query:
            if self.link_fails:raise TimeoutError()
            r=json.loads(args[0]);self.linked.append(r);self.row=(r,)
        else:self.row=tuple(sha({k:v for k,v in self.bundle[t].items() if k!='review_state'}) for t in ['delivery','processing_run']) if self.registered else None
    def fetchone(self):return self.row
    def send(self,envelope):self.sent.append(canonical(envelope));return self.receipt
    def run_attempt(self):return w.process_attempt(self.attempt,root=self.root,identities=[],connection=self,send=self.send)
    def test_unregistered_capture_cannot_reach_destination(self):
        self.registered=False
        with self.assertRaisesRegex(ValueError,'registered_collection'):self.run_attempt()
        self.assertEqual(self.sent,[])
    def test_receipt_link_timeout_retries_identical_saved_bytes(self):
        self.link_fails=True
        with self.assertRaisesRegex(ValueError,'source_receipt_link'):self.run_attempt()
        self.assertTrue((self.attempt/'customer-intake-outbox.json').exists())
        self.assertFalse((self.attempt/'customer-intake-receipt.json').exists())
        self.link_fails=False;self.run_attempt()
        self.assertEqual(self.sent[0],self.sent[1]);self.assertTrue((self.attempt/'customer-intake-receipt.json').exists())
    def test_changed_candidate_bytes_are_not_sent(self):
        (self.attempt/'candidates.jsonl').write_text('changed')
        with self.assertRaisesRegex(ValueError,'candidate_bytes_changed'):self.run_attempt()
        self.assertEqual(self.sent,[])
    def test_mismatched_destination_receipt_never_links(self):
        self.receipt['events']=2
        with self.assertRaisesRegex(ValueError,'receipt_count'):self.run_attempt()
        self.assertEqual(self.linked,[])

if __name__=='__main__':unittest.main()
