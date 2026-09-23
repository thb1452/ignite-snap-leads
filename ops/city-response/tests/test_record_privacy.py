import csv,io,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'runtime'))
from record_privacy import *

def fixture(cases=None):
    cases=cases or [['E26-00001','123 FIXTURE ST','WEEDS','09/01/2026','VIOLATION','','','']]
    rows=[['Enforcement List','','','','','','','09/23/2026'],HEADER,[' ','','','','','','','']]
    for case in cases:rows.extend([case,['','44-25-14-226-043','','','','','','']])
    rows.extend([['Records:',str(len(cases)),'','','','','',''],['Population:','All Records','','','','','',''],['Enforcement.DateFiled  Between  8/23/2026 12:00:00 AM AND 9/23/2026 11:59:59 PM','','','','','','','']])
    f=io.StringIO(newline='');csv.writer(f).writerows(rows);return f.getvalue().encode()

def process(raw):return clean_madison(raw,agency_key='us:mi:madisonheights',expected_agency_key='us:mi:madisonheights',request_id='fixture-request',receipt_id='fixture-receipt',period_start='2026-08-22',period_end='2026-09-20')

class PrivacyTests(unittest.TestCase):
    def test_all_physical_rows_accounted(self):
        r=process(fixture());self.assertEqual((r['physical_rows'],r['input_records'],r['passed_records']),(8,1,1))
        self.assertEqual(r['records'][0]['evidence']['source_rows'],[4,5])
        self.assertEqual(r['records'][0]['record_kind'],'case')
        self.assertIsNone(r['records'][0]['violation_id'])

    def test_every_unreviewed_narrative_held(self):
        for narrative in ['Complaint by Jane Fixture, 555-1212, j@example.test; weeds.','Tenant health diagnosis; account 12345.','SSN 123-45-6789.','Weeds reported by Alice.','Weeds in yard.','',None]:
            with self.subTest(narrative=narrative):
                p=privacy_check(narrative);self.assertEqual(p['status'],'needs_review');self.assertIsNone(p['cleaned_description'])
                self.assertNotIn('Jane',canonical(p));self.assertNotIn('555-1212',canonical(p))

    def test_unknown_labels_cannot_smuggle_personal_text(self):
        for value,index in [('WEEDS. Complainant Jane Fixture',2),('VIOLATION call 555-1212',4)]:
            case=['E26-00001','123 FIXTURE ST','WEEDS','09/01/2026','VIOLATION','','',''];case[index]=value
            row=process(fixture([case]))['records'][0]
            self.assertEqual(row['accuracy_status'],'needs_review');self.assertIsNone(row['cleaned_description'])
            self.assertNotIn('Jane Fixture',canonical(row))

    def test_row_count_schema_and_parcel_fail_closed(self):
        for raw in [fixture().replace(b'Records:,1',b'Records:,2'),fixture().replace(b'Category',b'Description'),fixture().replace(b'44-25-14-226-043',b'Parcel unknown')]:
            with self.assertRaises(ValueError):process(raw)

    def test_affected_records_only(self):
        cases=[['E26-00001','123 FIXTURE ST','WEEDS','09/01/2026','VIOLATION','','',''],['E26-00002','456 FIXTURE ST','OTHER','invalid','PHONE CALL','','','']]
        r=process(fixture(cases));self.assertEqual((r['passed_records'],r['held_records']),(1,1))

    def test_missing_facts_stay_missing(self):
        row=process(fixture([['E26-00001','123 FIXTURE ST','WEEDS','09/01/2026','','','','']]))['records'][0]
        self.assertEqual(row['status'],'not_supplied');self.assertIsNone(row['closed_date'])
        self.assertIn('did not supply',row['cleaned_description'])

    def test_repeat_deterministic_and_internal_duplicates_held(self):
        self.assertEqual(process(fixture()),process(fixture()))
        case=['E26-00001','123 FIXTURE ST','WEEDS','09/01/2026','VIOLATION','','','']
        r=process(fixture([case,case]));self.assertEqual((r['passed_records'],r['held_records']),(1,1))
        self.assertIn('duplicate_source_case',r['records'][1]['review_reasons'])

    def test_date_errors(self):
        for filed,closed,reason in [('09/21/2026','','outside_original_request_period'),('09/01/2026','08/30/2026','closed_before_filed')]:
            row=process(fixture([['E26-00001','123 FIXTURE ST','WEEDS',filed,'VIOLATION','','',closed]]))['records'][0]
            self.assertIn(reason,row['review_reasons'])

    def test_conflicting_duplicates_hold_every_version(self):
        a=['E26-00001','123 FIXTURE ST','WEEDS','09/01/2026','VIOLATION','','','']
        b=a.copy();b[4]='COMPLIED'
        result=process(fixture([a,b,a]))
        self.assertEqual(result['passed_records'],0)
        self.assertTrue(all('conflicting_source_case' in r['review_reasons'] for r in result['records']))

    def test_report_period_is_validated(self):
        for source in [fixture().replace(b'8/23/2026',b'13/23/2026'),fixture().replace(b'9/23/2026 11:',b'9/24/2026 11:')]:
            with self.assertRaises(ValueError):process(source)

    def test_property_match_requires_unique_city_state_address(self):
        r={'address':'123 Fixture ST','city':'Madison Heights','state':'MI'};p=dict(r,id='one')
        self.assertEqual(exact_property_match(r,[p])['status'],'matched')
        self.assertEqual(exact_property_match(r,[p,dict(p,id='two')])['reason'],'ambiguous_property_match')
        self.assertEqual(exact_property_match(r,[dict(p,state='WI')])['status'],'needs_review')
        self.assertEqual(exact_property_match(r,[dict(p,address='123 Fixture Street')])['status'],'needs_review')

    def test_raw_fallback_never_allowed(self):
        row=process(fixture())['records'][0]
        with self.assertRaises(ValueError):insight_evidence(row)
        row['import_status']='imported';e=insight_evidence(row);self.assertFalse(e['documented_condition'])
        row.update(cleaned_description=None,raw_description='sensitive original',description='legacy original')
        with self.assertRaises(ValueError):insight_evidence(row)

    def test_changed_cleaned_or_missing_citation_rejected(self):
        row=process(fixture())['records'][0];row['import_status']='imported';row['cleaned_description']='Changed'
        with self.assertRaises(ValueError):insight_evidence(row)
        row=process(fixture())['records'][0];row['import_status']='imported';row['evidence'].pop('receipt_id')
        with self.assertRaises(ValueError):insight_evidence(row)

if __name__=='__main__':unittest.main()
