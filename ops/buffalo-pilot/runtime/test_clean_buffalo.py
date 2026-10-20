import copy
import datetime as dt
import unittest

from clean_buffalo import address_keys, case_key, clean_text, prepare_records, property_summary, inventory_summary, SOURCE_ID


def record(**updates):
    row = {'uniquekey':'00539000','case_number':'RRG26-0000123','date':'2026-10-01T00:00:00.000','status':'ACTIVE','code':'2025PMCNYS-304.7','code_section':'Exterior Structure','description':'Roofs and drainage','comments':'Roof shingles loose','violation_location':'Exterior','propclass':'210','sbl':'00000123','address':'10 NORTH MAIN STREET APT 2','city':'BUFFALO','state':'NY','zip':'01234','latitude':'42.91','longitude':'-78.81','audit_source_id':SOURCE_ID,':id':'row-first'}
    row.update(updates)
    return row


def run(rows, keys=None):
    return prepare_records(rows,dt.date(2026,10,20),30,keys or set(),'2026-10-19T23:43:46.001147+00:00','abc')


class CleanerTests(unittest.TestCase):
    def test_address_variants_match_existing_only(self):
        self.assertTrue(address_keys('10 North Main Street Apt 2') & address_keys('10 N Main St'))
        selected,cleaned,held,stats=run([record()],address_keys('10 N Main St'))
        self.assertEqual(len(cleaned),0)
        self.assertIn('matches_existing_address_key',held[0]['hold_reasons'])

    def test_same_case_code_different_defects_survive(self):
        _,cleaned,held,_=run([record(),record(uniquekey='00539001',comments='Gutter detached',violation_location='Side wall',**{':id':'row-second'})])
        self.assertEqual(len(cleaned),2)
        self.assertEqual(held,[])

    def test_exact_business_duplicates_both_held(self):
        _,cleaned,held,_=run([record(),record(uniquekey='00539001',**{':id':'row-second'})])
        self.assertEqual(cleaned,[])
        self.assertEqual(len(held),2)
        self.assertTrue(all('same_business_content' in r['hold_reasons'] for r in held))

    def test_duplicate_id_conflicting_revisions_held(self):
        _,cleaned,held,_=run([record(),record(comments='Different finding')])
        self.assertEqual(cleaned,[])
        self.assertEqual(len(held),2)
        self.assertTrue(all('conflicting_revisions' in r['hold_reasons'] for r in held))

    def test_conflicting_inactive_revision_also_holds_active(self):
        _,cleaned,held,stats=run([record(),record(status='COMPLIED')])
        self.assertEqual(cleaned,[])
        self.assertEqual(len(held),1)
        self.assertEqual(stats['skipped_rows']['status_not_active'],1)

    def test_identical_same_id_repeated_once(self):
        _,cleaned,held,_=run([record(),record()])
        self.assertEqual(len(cleaned),1)
        self.assertEqual(len(held),1)
        self.assertEqual(held[0]['hold_reasons'],'repeated_identical_agency_record')

    def test_missing_status_is_not_active(self):
        selected,cleaned,held,stats=run([record(status=''),record(uniquekey='2',status='NULL')])
        self.assertEqual(selected,[])
        self.assertEqual(stats['skipped_rows']['status_not_active'],2)

    def test_preserve_identifier_zip_and_date(self):
        _,cleaned,_,_=run([record()])
        self.assertEqual(cleaned[0]['agency_record_id'],'00539000')
        self.assertEqual(cleaned[0]['zip'],'01234')
        self.assertEqual(cleaned[0]['parcel_id'],'00000123')
        self.assertEqual(cleaned[0]['violation_date'],'2026-10-01')

    def test_invalid_date_held_not_invented(self):
        _,cleaned,held,_=run([record(date='2026-02-30'),record(uniquekey='2',date='')])
        self.assertEqual(cleaned,[])
        self.assertEqual(len(held),2)
        self.assertTrue(all(r['violation_date']=='' for r in held))

    def test_date_boundaries(self):
        rows=[record(uniquekey=str(i),date=d,comments=str(i)) for i,d in enumerate(['2026-09-19','2026-09-20','2026-10-20','2026-10-21'])]
        _,cleaned,held,stats=run(rows)
        self.assertEqual([r['violation_date'] for r in cleaned],['2026-09-20','2026-10-20'])
        self.assertEqual(stats['skipped_rows']['date_outside_window'],2)

    def test_property_units_remain_distinct(self):
        _,cleaned,_,_=run([record(),record(uniquekey='2',address='10 NORTH MAIN STREET APT 3')])
        self.assertEqual(len(property_summary(cleaned)),2)

    def test_bad_coordinates_and_nonresidential_are_held(self):
        _,cleaned,held,_=run([record(latitude='nan'),record(uniquekey='2',propclass='411')])
        self.assertEqual(cleaned,[])
        self.assertEqual(len(held),2)

    def test_html_removed_but_detail_preserved(self):
        self.assertEqual(clean_text('<table><tr><td>Loose&nbsp;gutter</td></tr></table><script>bad()</script>'),'Loose gutter')

    def test_case_punctuation_normalization(self):
        self.assertEqual(case_key('RRG26-0000123'),case_key('rrg26 0000123'))

    def test_combined_inventory_uses_current_scope(self):
        metadata={'scope':'Both operations and customer inventories checked','checked_at':'2026-10-20T16:13:12Z','returned':12075,'inventories':[{'project_id':'ops','checked_at':'2026-10-20T16:06:32Z','returned':12071,'scope':'Customer not yet checked at this earlier time'},{'project_id':'customer','checked_at':'2026-10-20T16:12:56Z','returned':12075}]}
        result=inventory_summary(metadata)
        self.assertEqual(result['projects_checked'],['ops','customer'])
        self.assertEqual(result['scope'],'Both operations and customer inventories checked')
        self.assertNotIn('scope',result['inventories'][0])


if __name__=='__main__':
    unittest.main()
