/** Local synthetic fixture only. Never run with a remote adapter or credentials. */
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createTenancyDb,asRole,newUser} from '../../../tests/helpers/tenancy-db.mjs';
export {asRole,newUser};
export const root=new URL('../../../',import.meta.url);
export const id=n=>`55555555-5555-4555-8555-${String(n).padStart(12,'0')}`;
export const sha=x=>createHash('sha256').update(x).digest('hex');
export async function createReceiptDb({applyAdapter=true}={}){
 const db=new PGlite();let managed;
 try {
  await createTenancyDb({applyMigration:false,database:{exec:async sql=>{if(sql.trimStart().startsWith('CREATE ROLE anon NOLOGIN;'))managed=sql.slice(0,sql.indexOf('CREATE TYPE public.app_role'));}}});
  if(!managed)throw Error('Local managed Auth test double missing');
  await db.exec(managed);await db.exec('CREATE TABLE auth.identities(id uuid PRIMARY KEY,user_id uuid REFERENCES auth.users(id))');
  const manifest=JSON.parse(await readFile(new URL('scripts/tests/release-hosted/manifest.json',root),'utf8'));
  for(const path of manifest.apply_order)await db.exec(await readFile(new URL(path,root),'utf8'));
  if(applyAdapter)await db.exec(await readFile(new URL('scripts/tests/release-hosted-source/01_receipt_case_adapter.sql',root),'utf8'));
  return db;
 } catch(error){await db.close();throw error;}
}
export function syntheticSnapshot({seed=100,report='2026-08-10',parent=null,status='VIOLATION',addresses=['100 Example Street','100 Example Street Suite 2','100 Example Street Suite 3']}={}){
 const snapshot={agency_key:'us:mi:madisonheights',archive_id:id(seed+1),archive_manifest_sha256:sha(`synthetic-manifest-${seed}`),
  archive_verification_sha256:sha(`synthetic-verification-${seed}`),evidence_kind:'synthetic',held_count:2,id:id(seed),original_count:addresses.length+2,
  original_sha256:sha(`synthetic-original-${seed}`),parent_snapshot_id:parent,period_end:report,period_start:'2026-08-01',receipt_id:id(seed+2),
  received_at:`${report}T15:00:00Z`,report_date:report,request_id:id(seed+3),reviewed_count:addresses.length,selection_sha256:'',source_job_id:id(seed+4)};
 const records=addresses.map((address,i)=>{
  const case_id=`E26-${String(i+1).padStart(5,'0')}`,category='OTHER',cleaning_rule_version='record-privacy-v1:madison-heights-enforcement-list-v1';
  const source_status=i===0?status:'COMPLIED',description=`Agency enforcement case category: ${category}. Agency status: ${source_status}.`;
  const record_key=sha(JSON.stringify([snapshot.agency_key,'case',case_id])),source_row_sha256=sha(`synthetic-row-${seed}-${i}`),parcel='00-00-00-000-000';
  return {address,case_id,category,city:'Madison Heights',cleaned_description:description,cleaned_sha256:sha(JSON.stringify(description)),cleaning_rule_version,
   closed_date:source_status==='COMPLIED'?'2026-08-05':null,filed_date:'2026-08-02',record_key,source_parcel_reference:parcel,
   source_property_key:sha([snapshot.agency_key,parcel,address.trim().replace(/\s+/g,' ').toUpperCase()].join('\x1f')),
   source_row_sha256,source_rows:[4+i*2,5+i*2],source_status,state:'MI',version_id:sha(record_key+snapshot.original_sha256+source_row_sha256+cleaning_rule_version)};
 });
 snapshot.selection_sha256=sha([...records].sort((a,b)=>a.record_key.localeCompare(b.record_key)).map(r=>r.version_id).join('\n'));
 return {snapshot,records};
}
export async function register(db,scope){return (await db.query('SELECT snap_receipt.register_snapshot($1,$2) id',[JSON.stringify(scope.snapshot),JSON.stringify(scope.records)])).rows[0].id;}
export async function grant(db,{grantId=id(20),snapshotId,operator,until=new Date(Date.now()+86400000).toISOString()}={}){
 await db.query('SELECT snap_receipt.grant_authority($1,$2,$3,$4,$5)',[grantId,snapshotId,operator,sha('Synthetic authorized test operator instruction'),until]);return grantId;
}
export async function reviewAndAccept(db,{scope,operator,consumer,reviewId=id(30),acceptanceId=id(31),until=new Date(Date.now()+3600000).toISOString()}={}){
 await asRole(db,'authenticated',operator,async()=>{
  await db.query("SELECT public.fn_review_receipt_case_snapshot_v1($1,$2,$3,'reviewed',$4)",[reviewId,scope.snapshot.id,scope.snapshot.selection_sha256,sha('Synthetic review proof')]);
  await db.query("SELECT public.fn_accept_receipt_case_snapshot_v1($1,$2,$3,'crm',$4,$5)",[acceptanceId,reviewId,consumer,until,sha('Synthetic bounded CRM acceptance proof')]);
 });return acceptanceId;
}
