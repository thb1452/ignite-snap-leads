#!/usr/bin/env node
/** Explicit hosted synthetic proof runner. Importing this module performs no I/O. */
import {open,lstat,realpath,rename,unlink} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname,resolve,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import {syntheticSnapshot,sha} from './fixture.mjs';
import {parseReceiptCaseDetail} from '../../../src/services/receiptCaseContract.ts';

const repository=resolve(dirname(fileURLToPath(import.meta.url)),'../../..');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[a-f0-9]{64}$/;
const JWT=/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PHASES=['prepare-auth','initial','refresh'];
const LABELS=['O','A','B'];
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const isUuid=value=>typeof value==='string'&&UUID.test(value);
const isHash=value=>typeof value==='string'&&HASH.test(value);
const timestamp=()=>new Date().toISOString();
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:object(value)?`{${Object.keys(value).sort().map(key=>`${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`:JSON.stringify(value);
export class HostedProofError extends Error {
  constructor(code,{uncertain=false}={}) {super(code);this.name='HostedProofError';this.code=code;this.uncertain=uncertain;}
}
const check=(condition,code)=>{if(!condition)throw new HostedProofError(code);};
const equal=(actual,expected,code)=>check(canonical(actual)===canonical(expected),code);
export function requirePrivateLeadReadback(rows,leadId,patch) {
  check(Array.isArray(rows)&&rows.length===1&&rows[0].id===leadId,'PRIVATE_LEAD_WRITE_UNCONFIRMED');
  for(const [key,value] of Object.entries(patch)) {
    if(key==='next_follow_up_at') {
      check(typeof rows[0][key]==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(rows[0][key])===Date.parse(value),'PRIVATE_LEAD_CHANGED_INPUT');
    } else equal(rows[0][key],value,'PRIVATE_LEAD_CHANGED_INPUT');
  }
  return rows[0];
}
function keyMatches(value,role,ref) {
  if(typeof value!=='string')return false;
  if(new RegExp(`^sb_${role==='anon'?'publishable':'secret'}_[A-Za-z0-9_-]{16,}$`).test(value))return true;
  if(!JWT.test(value))return false;
  try{const claims=JSON.parse(Buffer.from(value.split('.')[1],'base64url'));return claims.role===role&&claims.ref===ref;}catch{return false;}
}

export function validateConfig(value) {
  check(object(value),'CONFIG_OBJECT_REQUIRED');
  equal(Object.keys(value).sort(),['anon_key','expected_fixture_nonce','operator_authority_reference_sha256','project_ref','service_role_key'],'CONFIG_FIELDS_INVALID');
  check(typeof value.project_ref==='string'&&/^[a-z]{20}$/.test(value.project_ref),'PROJECT_REFERENCE_INVALID');
  check(isUuid(value.expected_fixture_nonce)&&isHash(value.operator_authority_reference_sha256),'CONFIG_BINDING_INVALID');
  check(keyMatches(value.anon_key,'anon',value.project_ref)&&keyMatches(value.service_role_key,'service_role',value.project_ref)&&value.anon_key!==value.service_role_key,'CONFIG_KEYS_INVALID');
  return Object.freeze({...value});
}

function outsideRepository(path) {
  const rel=relative(repository,path);
  return rel==='..'||rel.startsWith('../')||isAbsolute(rel);
}
async function privatePath(path) {
  check(typeof path==='string'&&isAbsolute(path)&&outsideRepository(path),'PRIVATE_PATH_OUTSIDE_REPOSITORY_REQUIRED');
  const parent=await realpath(dirname(path));
  const stat=await lstat(parent);
  check(outsideRepository(parent)&&stat.isDirectory()&&(stat.mode&0o077)===0,'PRIVATE_DIRECTORY_REQUIRED');
  const result=resolve(parent,basename(path));
  check(result===path,'CANONICAL_PRIVATE_PATH_REQUIRED');
  return result;
}
async function readPrivateJson(path,{optional=false,limit=1024*1024}={}) {
  await privatePath(path);
  let stat;
  try{stat=await lstat(path);}catch(error){if(optional&&error.code==='ENOENT')return null;throw new HostedProofError('PRIVATE_FILE_UNAVAILABLE');}
  check(stat.isFile()&&!stat.isSymbolicLink()&&(stat.mode&0o077)===0&&stat.size>0&&stat.size<=limit,'PRIVATE_FILE_MODE_OR_SIZE_INVALID');
  const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
  try{
    const current=await file.stat();
    check(current.ino===stat.ino&&current.dev===stat.dev&&(current.mode&0o077)===0,'PRIVATE_FILE_CHANGED');
    return JSON.parse(await file.readFile('utf8'));
  }catch(error){if(error instanceof HostedProofError)throw error;throw new HostedProofError('PRIVATE_JSON_INVALID');}
  finally{await file.close();}
}
async function atomicPrivateWrite(path,text,{unchangedOnly=false}={}) {
  await privatePath(path);
  try{
    const existing=await lstat(path);
    check(existing.isFile()&&!existing.isSymbolicLink()&&(existing.mode&0o077)===0,'PRIVATE_OUTPUT_MODE_INVALID');
    if(unchangedOnly){
      const file=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);
      try{equal(await file.readFile('utf8'),text,'SQL_FILE_ALREADY_EXISTS_WITH_DIFFERENT_CONTENT');return;}finally{await file.close();}
    }
  }catch(error){if(error.code!=='ENOENT')throw error;}
  const temp=`${path}.${randomUUID()}.next`;
  const file=await open(temp,'wx',0o600);
  try{await file.writeFile(text);await file.sync();}finally{await file.close();}
  await rename(temp,path);
  const dir=await open(dirname(path),'r');try{await dir.sync();}finally{await dir.close();}
}

/** Three synthetic case identities, one fake parcel, three distinct addresses. */
export function buildSyntheticScopes(seed,runId) {
  check(Number.isInteger(seed)&&seed>=1000&&seed<=4294967000&&isUuid(runId),'SYNTHETIC_SEED_INVALID');
  const addresses=[`100 Synthetic ${runId} Street`,`100 Synthetic ${runId} Street Suite 2`,`100 Synthetic ${runId} Street Suite 3`];
  const first=syntheticSnapshot({seed,addresses});
  const second=syntheticSnapshot({seed:seed+10,report:'2026-08-12',parent:first.snapshot.id,status:'CANCELLED',addresses});
  for(const scope of [first,second]) {
    for(const [index,row] of scope.records.entries()) {
      row.case_id=`E00-${String(seed%99997+index).padStart(5,'0')}`;
      row.record_key=sha(JSON.stringify([scope.snapshot.agency_key,'case',row.case_id]));
      row.version_id=sha(row.record_key+scope.snapshot.original_sha256+row.source_row_sha256+row.cleaning_rule_version);
    }
    scope.snapshot.selection_sha256=sha([...scope.records].sort((a,b)=>a.record_key.localeCompare(b.record_key)).map(row=>row.version_id).join('\n'));
  }
  return {initial:first,refresh:second};
}

function newState(config) {
  const runId=randomUUID(),seed=1000+randomBytes(4).readUInt32BE(0)%4294965000;
  const commands=Object.fromEntries(['grant_initial','grant_refresh','review_initial','accept_initial','handoff_initial','review_refresh','accept_refresh','handoff_refresh','revoke_old','revoke_new','accept_expiry','handoff_expiry','note','task','contact','denied_command'].map(key=>[key,randomUUID()]));
  return {version:1,kind:'receipt_case_hosted_synthetic_proof',run_id:runId,seed,
    project_ref:config.project_ref,fixture_nonce:config.expected_fixture_nonce,
    authority_reference_sha256:config.operator_authority_reference_sha256,created_at:timestamp(),phase:'auth_pending',
    scopes:buildSyntheticScopes(seed,runId),commands,
    accounts:Object.fromEntries(LABELS.map(label=>[label,{email:`synthetic-receipt-${label.toLowerCase()}-${runId}@example.invalid`,password:`Synthetic-${randomBytes(32).toString('base64url')}-9!`}])) ,
    completed:{},checks:[],requests:0,pending:['short_expiry_http','hosted_browser','actual_original_backed_acceptance','concurrent_revocation_race']};
}
export function validateState(state,config) {
  check(object(state)&&state.version===1&&state.kind==='receipt_case_hosted_synthetic_proof'&&isUuid(state.run_id),'STATE_KIND_INVALID');
  check(state.project_ref===config.project_ref&&state.fixture_nonce===config.expected_fixture_nonce&&state.authority_reference_sha256===config.operator_authority_reference_sha256,'STATE_TARGET_BINDING_CHANGED');
  equal(state.scopes,buildSyntheticScopes(state.seed,state.run_id),'STATE_SYNTHETIC_SCOPE_CHANGED');
  check(object(state.commands)&&Object.values(state.commands).every(isUuid)&&new Set(Object.values(state.commands)).size===Object.values(state.commands).length,'STATE_COMMANDS_INVALID');
  check(object(state.accounts)&&object(state.completed)&&Array.isArray(state.checks)&&Array.isArray(state.pending),'STATE_COLLECTIONS_INVALID');
  for(const label of LABELS){
    const account=state.accounts[label];
    check(object(account)&&account.email===`synthetic-receipt-${label.toLowerCase()}-${state.run_id}@example.invalid`&&typeof account.password==='string'&&account.password.length>=32,'STATE_ACCOUNT_INVALID');
    if(account.id!==undefined)check(isUuid(account.id),'STATE_USER_INVALID');
    if(account.org_id!==undefined)check(isUuid(account.org_id),'STATE_WORKSPACE_INVALID');
    if(account.stage_ids!==undefined)check(Array.isArray(account.stage_ids)&&account.stage_ids.length>=2&&account.stage_ids.every(isUuid),'STATE_STAGES_INVALID');
  }
  return state;
}

const literal=value=>`'${String(value).replaceAll("'","''")}'`;
/** Returns SQL for reviewed manual application. This runner never executes SQL. */
export function registrationSql(config,state,phase) {
  check(['initial','refresh'].includes(phase),'SQL_PHASE_INVALID');validateState(state,config);
  const scope=state.scopes[phase],operator=state.accounts.O;
  check(isUuid(operator.id),'SQL_OPERATOR_MISSING');
  return `-- Private generated synthetic scope. Apply only to the nonce-bound staging project.
-- Registration/grant only; no customer acceptance or human signoff is asserted.
-- Reconcile an uncertain apply by reading stored IDs; do not blindly replay this file.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45s';
DO $guard$ BEGIN
 IF current_user<>'postgres' OR (SELECT count(*) FROM public.snap_hosted_fixture)<>1 OR NOT EXISTS(
   SELECT 1 FROM public.snap_hosted_fixture WHERE kind='snap_hosted_synthetic' AND schema_version=1
    AND state='ready' AND fixture_nonce=${literal(config.expected_fixture_nonce)}::uuid)
   OR public.fn_billing_checkout_enabled_v1() IS DISTINCT FROM false THEN
  RAISE EXCEPTION 'Exact ready staging marker with held checkout required'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users u JOIN public.profiles p ON p.user_id=u.id
   JOIN snap_security.workspace_owners w ON w.user_id=u.id AND w.org_id=p.org_id
   WHERE u.id=${literal(operator.id)}::uuid AND u.email=${literal(operator.email)}
    AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL AND u.is_anonymous IS FALSE
    AND(u.banned_until IS NULL OR u.banned_until<=clock_timestamp())) THEN
  RAISE EXCEPTION 'Recorded confirmed synthetic operator required'; END IF;
END $guard$;
SELECT snap_receipt.register_snapshot(${literal(JSON.stringify(scope.snapshot))}::jsonb,${literal(JSON.stringify(scope.records))}::jsonb);
SELECT snap_receipt.grant_authority(${literal(state.commands[`grant_${phase}`])}::uuid,${literal(scope.snapshot.id)}::uuid,
 ${literal(operator.id)}::uuid,${literal(config.operator_authority_reference_sha256)},clock_timestamp()+interval '7 days');
COMMIT;
`;
}

const TABLES=new Set(['snap_hosted_fixture','profiles','user_roles','pipeline_stages','properties','leads','lead_activities','crm_contacts']);
const RPCS=new Set(['fn_billing_checkout_enabled_v1','fn_customer_workspace_ready_v1','fn_owner_receipt_case_snapshot_v1','fn_review_receipt_case_snapshot_v1','fn_accept_receipt_case_snapshot_v1','fn_my_receipt_case_acceptances_v1','fn_list_receipt_case_properties_v1','fn_handoff_receipt_case_to_crm_v1','fn_get_receipt_case_crm_detail_v1','fn_revoke_receipt_case_decision_v1']);
export function createRuntime(config,state,save,{fetchImpl=globalThis.fetch}={}) {
  validateConfig(config);validateState(state,config);
  const origin=`https://${config.project_ref}.supabase.co`;
  let boundary=false;
  async function request(path,{actor,admin=false,method='GET',body,prefer}={}) {
    check(typeof path==='string'&&path.startsWith('/')&&!path.startsWith('//')&&!/[\\#\s]/.test(path)&&!path.includes('..'),'API_PATH_INVALID');
    const target=new URL(path,origin),parts=target.pathname.split('/');
    check(target.origin===origin&&!target.username&&!target.password,'API_ORIGIN_INVALID');
    const auth=['/auth/v1/admin/users','/auth/v1/token','/auth/v1/user'].includes(target.pathname);
    const rest=parts[1]==='rest'&&parts[2]==='v1'&&((parts.length===4&&TABLES.has(parts[3]))||(parts.length===5&&parts[3]==='rpc'&&RPCS.has(parts[4])));
    check(auth||rest,'API_ENDPOINT_OUT_OF_SCOPE');check(['GET','POST','PATCH'].includes(method),'HTTP_METHOD_OUT_OF_SCOPE');
    const boundaryRead=admin&&(
      method==='GET'&&target.pathname==='/rest/v1/snap_hosted_fixture'||
      method==='POST'&&target.pathname==='/rest/v1/rpc/fn_billing_checkout_enabled_v1'&&canonical(body)==='{}');
    check(boundary||boundaryRead,'STAGING_BOUNDARY_REQUIRED');check(!(actor&&admin),'MIXED_AUTH_MODES');
    if(admin)check(boundaryRead||target.pathname==='/auth/v1/admin/users'&&method==='POST','ADMIN_OPERATION_OUT_OF_SCOPE');
    if(actor)check(LABELS.includes(actor)&&JWT.test(state.accounts[actor].access_token??''),'REAL_USER_SESSION_REQUIRED');
    if(target.pathname==='/auth/v1/admin/users') {
      const account=LABELS.map(label=>state.accounts[label]).find(value=>value.email===body?.email);
      check(admin&&method==='POST'&&account&&body.email_confirm===true&&body.password===account.password&&body.user_metadata?.receipt_proof_run===state.run_id,'SYNTHETIC_AUTH_CREATE_REQUIRED');
    }
    if(target.pathname==='/auth/v1/token')check(!admin&&!actor&&method==='POST'&&['password','refresh_token'].includes(target.searchParams.get('grant_type')),'AUTH_TOKEN_OPERATION_INVALID');
    if(target.pathname==='/auth/v1/user')check(actor&&method==='GET','AUTH_USER_OPERATION_INVALID');
    if(rest&&method==='PATCH')check(actor==='A'&&parts[3]==='leads'&&state.initial_link&&target.searchParams.get('id')===`eq.${state.initial_link.lead_id}`,'PRIVATE_LEAD_PATCH_REQUIRED');
    if(rest&&method==='POST'&&parts.length===4)check(actor==='A'&&['lead_activities','crm_contacts'].includes(parts[3])&&body?.lead_id===state.initial_link?.lead_id&&body?.org_id===state.accounts.A.org_id&&[state.commands.note,state.commands.task,state.commands.contact].includes(body?.id),'PRIVATE_SYNTHETIC_CHILD_WRITE_REQUIRED');
    const key=admin?config.service_role_key:config.anon_key;
    const readRpc=parts[3]==='rpc'&&['fn_billing_checkout_enabled_v1','fn_customer_workspace_ready_v1','fn_owner_receipt_case_snapshot_v1','fn_my_receipt_case_acceptances_v1','fn_list_receipt_case_properties_v1','fn_get_receipt_case_crm_detail_v1'].includes(parts[4]);
    const mutates=method!=='GET'&&!readRpc;
    const headers={apikey:key,'Content-Type':'application/json'};
    if(JWT.test(key))headers.Authorization=`Bearer ${key}`;
    if(actor)headers.Authorization=`Bearer ${state.accounts[actor].access_token}`;
    if(prefer){check(prefer==='return=representation','PREFER_OUT_OF_SCOPE');headers.Prefer=prefer;}
    state.requests+=1;state.last_request={at:timestamp(),method,route:target.pathname,actor:actor??(admin?'service':'public'),state:'sent'};await save();
    let response,data;
    try{
      response=await fetchImpl(target.href,{method,headers,body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(15000)});
      const raw=await response.text();check(raw.length<=2*1024*1024,'HTTP_RESPONSE_TOO_LARGE');
      data=raw?JSON.parse(raw):null;
    }catch(error){
      state.last_request.state='uncertain';await save();
      if(error instanceof HostedProofError)throw error;
      throw new HostedProofError('HTTP_REQUEST_OR_RESPONSE_UNCERTAIN',{uncertain:mutates});
    }
    if(response.status>=500&&mutates){
      state.last_request.state='uncertain';state.last_request.http_status=response.status;await save();
      throw new HostedProofError('HTTP_WRITE_OUTCOME_UNCERTAIN',{uncertain:true});
    }
    state.last_request.state='acknowledged';state.last_request.http_status=response.status;await save();
    return {ok:response.ok,status:response.status,data};
  }
  const success=response=>{check(response.ok,'EXPECTED_HTTP_SUCCESS');return response.data;};
  const rpc=(name,actor,args={})=>request(`/rest/v1/rpc/${name}`,{actor,method:'POST',body:args});
  const rows=async(table,actor,query)=>{
    const result=success(await request(`/rest/v1/${table}?${query}`,{actor}));check(Array.isArray(result),'ROW_ARRAY_REQUIRED');return result;
  };
  async function verifyBoundary() {
    const markers=success(await request('/rest/v1/snap_hosted_fixture?select=kind,schema_version,fixture_nonce,state',{admin:true}));
    check(Array.isArray(markers)&&markers.length===1,'EXACT_STAGING_MARKER_REQUIRED');
    equal(markers[0],{kind:'snap_hosted_synthetic',schema_version:1,fixture_nonce:config.expected_fixture_nonce,state:'ready'},'STAGING_MARKER_MISMATCH');
    equal(success(await request('/rest/v1/rpc/fn_billing_checkout_enabled_v1',{admin:true,method:'POST',body:{}})),false,'CHECKOUT_MUST_REMAIN_HELD');
    boundary=true;
  }
  return {request,rpc,rows,success,verifyBoundary};
}

export function requireCustomerDenied(response) {
  check(response.status===403&&response.data?.code==='42501','EXPECTED_HTTP_403_POSTGRES_42501');
}
const uuidReceipt=(value,field)=>{
  if(!object(value)||!isUuid(value[field])||typeof value.replayed!=='boolean')throw new HostedProofError('ACTION_RECEIPT_INVALID',{uncertain:true});
  return value;
};
function deadline(state,phase) {
  if(!state[`accept_until_${phase}`])state[`accept_until_${phase}`]=new Date(Date.now()+3600000).toISOString();
  return state[`accept_until_${phase}`];
}

async function ensureAccounts(runtime,state,save,{prepare=false}={}) {
  const {request,success,rows,rpc}=runtime;
  for(const label of LABELS) {
    const account=state.accounts[label];
    let loggedIn=false;
    if(!account.id) {
      check(prepare,'PREPARE_AUTH_PHASE_REQUIRED');
      if(account.create_attempted) {
        // The email/password were committed privately before the uncertain create.
        // A real password session can reconcile that account without a second create.
        const recovered=await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:account.email,password:account.password}});
        check(recovered.ok,'AUTH_CREATE_OUTCOME_REQUIRES_RECONCILIATION');
        const session=recovered.data;check(isUuid(session.user?.id),'AUTH_CREATE_RECOVERY_IDENTITY_INVALID');
        account.id=session.user.id;storeSession(account,session);await save();loggedIn=true;
      }else{
        account.create_attempted=true;await save();
        const created=success(await request('/auth/v1/admin/users',{admin:true,method:'POST',body:{email:account.email,password:account.password,email_confirm:true,user_metadata:{full_name:`Synthetic receipt ${label}`,receipt_proof_run:state.run_id}}}));
        const user=created.user??created;check(isUuid(user.id),'AUTH_CREATE_RECEIPT_UNCERTAIN');account.id=user.id;await save();
      }
    }
    if(!loggedIn){
      let session;
      if(account.refresh_token){
        const renewed=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:account.refresh_token}});
        if(renewed.ok)session=renewed.data;
        else check([400,401,403].includes(renewed.status),'TOKEN_REFRESH_FAILED');
      }
      if(!session)session=success(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email:account.email,password:account.password}}));
      storeSession(account,session);await save();
    }
    const user=success(await request('/auth/v1/user',{actor:label}));
    check(user.id===account.id&&user.email===account.email&&user.email_confirmed_at&&!user.is_anonymous&&user.user_metadata?.receipt_proof_run===state.run_id&&Array.isArray(user.identities)&&user.identities.some(identity=>identity.provider==='email'),'REAL_CONFIRMED_AUTH_IDENTITY_REQUIRED');
    const profiles=await rows('profiles',label,`select=user_id,org_id&user_id=eq.${account.id}`);
    check(profiles.length===1&&profiles[0].user_id===account.id&&isUuid(profiles[0].org_id)&&profiles[0].org_id!=='00000000-0000-0000-0000-000000000001','PERSONAL_WORKSPACE_REQUIRED');
    if(account.org_id)equal(profiles[0].org_id,account.org_id,'ACCOUNT_WORKSPACE_CHANGED');
    account.org_id=profiles[0].org_id;
    equal((await rows('user_roles',label,'select=role')).map(row=>row.role).sort(),['user'],'ORDINARY_USER_ROLE_REQUIRED');
    equal(success(await rpc('fn_customer_workspace_ready_v1',label)),true,'PRIVATE_WORKSPACE_UNAVAILABLE');
    const stages=await rows('pipeline_stages',label,`select=id,org_id,sort_order&org_id=eq.${account.org_id}&order=sort_order,id`);
    check(stages.length>=2&&stages.every(stage=>isUuid(stage.id)&&stage.org_id===account.org_id),'PRIVATE_STAGES_REQUIRED');
    const next=stages.map(stage=>stage.id);
    if(account.stage_ids)equal(next,account.stage_ids,'PRIVATE_STAGES_CHANGED');
    account.stage_ids=next;await save();
  }
  check(new Set(LABELS.map(label=>state.accounts[label].id)).size===3&&new Set(LABELS.map(label=>state.accounts[label].org_id)).size===3,'THREE_DISTINCT_PRIVATE_ACCOUNTS_REQUIRED');
}
function storeSession(account,session) {
  check(object(session)&&session.user?.id===account.id&&JWT.test(session.access_token??'')&&typeof session.refresh_token==='string'&&session.refresh_token.length>10,'REAL_PASSWORD_OR_REFRESH_SESSION_REQUIRED');
  account.access_token=session.access_token;account.refresh_token=session.refresh_token;account.expires_at=session.expires_at??null;
}

async function readPrivate(runtime,state) {
  const leadId=state.initial_link.lead_id;
  const leads=await runtime.rows('leads','A',`id=eq.${leadId}&select=*`);
  check(leads.length===1&&leads[0].id===leadId&&leads[0].org_id===state.accounts.A.org_id&&leads[0].created_by===state.accounts.A.id,'OWNED_PRIVATE_LEAD_REQUIRED');
  return {lead:leads[0],notes_tasks:await runtime.rows('lead_activities','A',`lead_id=eq.${leadId}&activity_type=in.(note,task)&select=*&order=id`),contacts:await runtime.rows('crm_contacts','A',`lead_id=eq.${leadId}&select=*&order=id`)};
}
async function checkForeign(runtime,state) {
  const leadId=state.initial_link.lead_id;
  requireCustomerDenied(await runtime.rpc('fn_get_receipt_case_crm_detail_v1','B',{p_lead_id:leadId}));
  equal(await runtime.rows('leads','B',`id=eq.${leadId}&select=*`),[],'FOREIGN_LEAD_EXPOSED');
  for(const table of ['lead_activities','crm_contacts'])equal(await runtime.rows(table,'B',`lead_id=eq.${leadId}&select=*`),[],'FOREIGN_PRIVATE_CHILD_EXPOSED');
  equal(await runtime.rows('properties','B',`id=in.(${state.properties.map(row=>row.property_id).join(',')})&select=*`),[],'FOREIGN_PROPERTY_EXPOSED');
  equal(runtime.success(await runtime.rpc('fn_my_receipt_case_acceptances_v1','B')).acceptances,[],'FOREIGN_ACCEPTANCE_EXPOSED');
}

async function executePhase(phase,runtime,config,state,statePath,save) {
  const {rpc,success,request,rows}=runtime;
  const record=async(name,operation)=>{
    if(Object.hasOwn(state.completed,name))return state.completed[name];
    state.inflight=name;await save();
    const result=await operation();state.completed[name]=result??true;state.checks.push(name);delete state.inflight;await save();return result;
  };
  const readDetail=async()=>parseReceiptCaseDetail(success(await rpc('fn_get_receipt_case_crm_detail_v1','A',{p_lead_id:state.initial_link.lead_id})));
  const handoffArgs=which=>({p_request_id:state.commands[`handoff_${which}`],p_acceptance_id:state.commands[`accept_${which}`],p_source_property_key:state.scopes[which].records[0].source_property_key,p_stage_id:state.accounts.A.stage_ids[0]});
  const verifyFinalHeld=async()=>{
    check(isUuid(state.initial_link?.lead_id)&&isUuid(state.refresh_link?.activity_id)&&isUuid(state.expiry_link?.activity_id),'FINAL_STATE_INCOMPLETE');
    requireCustomerDenied(await rpc('fn_get_receipt_case_crm_detail_v1','A',{p_lead_id:state.initial_link.lead_id}));
    for(const which of ['initial','refresh','expiry'])requireCustomerDenied(await rpc('fn_list_receipt_case_properties_v1','A',{p_acceptance_id:state.commands[`accept_${which}`],p_limit:25,p_offset:0}));
    equal(await rows('properties','A',`id=in.(${state.properties.map(row=>row.property_id).join(',')})&select=*`),[],'FINAL_GENERIC_PROPERTY_EXPOSURE');
    equal(await rows('lead_activities','A',`id=in.(${state.initial_link.activity_id},${state.refresh_link.activity_id},${state.expiry_link.activity_id})&select=*`),[],'FINAL_SOURCE_ANNOTATION_EXPOSURE');
    equal(success(await rpc('fn_my_receipt_case_acceptances_v1','A')).acceptances,[],'FINAL_ACCEPTANCE_STILL_LISTED');
    equal(await readPrivate(runtime,state),state.expected_private,'FINAL_PRIVATE_CRM_CHANGED');await checkForeign(runtime,state);
  };
  const emitSql=async which=>{
    const sql=registrationSql(config,state,which);
    await atomicPrivateWrite(resolve(dirname(statePath),`${which}.sql`),sql,{unchangedOnly:true});
    state.sql??={};state.sql[which]={sha256:sha(sql),state:'awaiting_reviewed_manual_apply'};await save();
  };
  const reviewAccept=async which=>{
    const scope=state.scopes[which];
    await record(`${which}_operator_scope_matches_synthetic_snapshot`,async()=>{
      const summary=success(await rpc('fn_owner_receipt_case_snapshot_v1','O',{p_snapshot_id:scope.snapshot.id}));
      check(summary.version==='receipt-case-owner-scope-v1'&&summary.snapshot_id===scope.snapshot.id&&summary.grant_id===state.commands[`grant_${which}`]&&summary.selection_sha256===scope.snapshot.selection_sha256&&summary.evidence_kind==='synthetic'&&summary.review_method==='agent_original_crosscheck'&&summary.original_count===5&&summary.reviewed_count===3&&summary.held_count===2&&summary.property_count===3&&summary.archive_verification_sha256===scope.snapshot.archive_verification_sha256,'REGISTERED_SYNTHETIC_SCOPE_MISMATCH');
      return true;
    });
    if(!state[`review_proof_${which}`]){
      state[`review_proof_${which}`]={method:'agent_original_crosscheck',evidence_kind:'synthetic',checked_at:timestamp(),snapshot_id:scope.snapshot.id,selection_sha256:scope.snapshot.selection_sha256,reviewed_count:scope.records.length};
      state[`review_sha_${which}`]=sha(canonical(state[`review_proof_${which}`]));deadline(state,which);await save();
    }
    await record(`${which}_operator_review_recorded`,async()=>{
      const args={p_command_id:state.commands[`review_${which}`],p_snapshot_id:scope.snapshot.id,p_expected_selection_sha256:scope.snapshot.selection_sha256,p_outcome:'reviewed',p_evidence_sha256:state[`review_sha_${which}`]};
      const receipt=uuidReceipt(success(await rpc('fn_review_receipt_case_snapshot_v1','O',args)),'review_id');
      equal(receipt.review_id,args.p_command_id,'REVIEW_RECEIPT_ID_MISMATCH');
      const replay=success(await rpc('fn_review_receipt_case_snapshot_v1','O',args));check(replay.review_id===receipt.review_id&&replay.replayed===true,'REVIEW_REPLAY_MISMATCH');return receipt;
    });
    await record(`${which}_ordinary_customer_cannot_self_accept`,async()=>{
      requireCustomerDenied(await rpc('fn_accept_receipt_case_snapshot_v1','A',{p_command_id:state.commands.denied_command,p_review_id:state.commands[`review_${which}`],p_consumer_user_id:state.accounts.A.id,p_purpose:'crm',p_valid_until:state[`accept_until_${which}`],p_evidence_sha256:config.operator_authority_reference_sha256}));return true;
    });
    await record(`${which}_operator_accepts_only_customer_a`,async()=>{
      const args={p_command_id:state.commands[`accept_${which}`],p_review_id:state.commands[`review_${which}`],p_consumer_user_id:state.accounts.A.id,p_purpose:'crm',p_valid_until:state[`accept_until_${which}`],p_evidence_sha256:config.operator_authority_reference_sha256};
      const receipt=uuidReceipt(success(await rpc('fn_accept_receipt_case_snapshot_v1','O',args)),'acceptance_id');
      equal(receipt.acceptance_id,args.p_command_id,'ACCEPTANCE_RECEIPT_ID_MISMATCH');return receipt;
    });
  };

  if(phase==='prepare-auth'){
    check(['auth_pending','prepared_auth'].includes(state.phase),'PREPARE_PHASE_ALREADY_FINISHED');
    await ensureAccounts(runtime,state,save,{prepare:true});
    if(!state.checks.includes('real_confirmed_sessions_and_three_ordinary_workspaces'))state.checks.push('real_confirmed_sessions_and_three_ordinary_workspaces');
    await emitSql('initial');state.phase='prepared_auth';await save();return;
  }
  check(phase==='initial'?['prepared_auth','initial_running','initial_complete'].includes(state.phase):['initial_complete','refresh_running','complete'].includes(state.phase),'PHASE_ORDER_INVALID');
  await ensureAccounts(runtime,state,save);
  if(phase==='initial'&&state.phase==='initial_complete'){
    const dto=await readDetail();
    check(dto.snapshot.snapshot_id===state.scopes.initial.snapshot.id&&dto.snapshot.acceptance_id===state.commands.accept_initial,'INITIAL_FRESH_READBACK_CHANGED');
    equal(await readPrivate(runtime,state),state.expected_private,'INITIAL_FRESH_PRIVATE_CRM_CHANGED');await checkForeign(runtime,state);
    state.last_fresh_readback={phase,at:timestamp()};await save();return;
  }
  if(phase==='refresh'&&state.phase==='complete'){
    await verifyFinalHeld();state.last_fresh_readback={phase,at:timestamp()};await save();return;
  }
  state.phase=phase==='initial'?'initial_running':'refresh_running';await save();
  if(phase==='initial') {
    await record('no_customer_source_access_before_acceptance',async()=>{
      for(const actor of ['A','B']){
        equal(success(await rpc('fn_my_receipt_case_acceptances_v1',actor)).acceptances,[],'UNACCEPTED_SOURCE_LIST_EXPOSED');
        equal(await rows('properties',actor,'select=id'),[],'UNACCEPTED_SOURCE_PROPERTY_EXPOSED');
        requireCustomerDenied(await rpc('fn_list_receipt_case_properties_v1',actor,{p_acceptance_id:state.commands.accept_initial,p_limit:25,p_offset:0}));
      }return true;
    });
    await reviewAccept('initial');
    state.properties=await record('accepted_three_addresses_remain_distinct',async()=>{
      const page=success(await rpc('fn_list_receipt_case_properties_v1','A',{p_acceptance_id:state.commands.accept_initial,p_limit:25,p_offset:0}));
      check(page.version==='receipt-case-properties-v1'&&page.snapshot_id===state.scopes.initial.snapshot.id&&page.acceptance_id===state.commands.accept_initial&&page.total===3&&Array.isArray(page.properties)&&page.properties.length===3&&page.properties.every(row=>isUuid(row.property_id)&&isHash(row.source_property_key))&&new Set(page.properties.map(row=>row.property_id)).size===3,'ACCEPTED_PROPERTY_PAGE_INVALID');
      equal(page.properties.map(row=>row.source_property_key).sort(),state.scopes.initial.records.map(row=>row.source_property_key).sort(),'ACCEPTED_PROPERTY_KEYS_MISMATCH');return page.properties;
    });await save();
    await record('foreign_customer_and_foreign_stage_handoffs_denied',async()=>{
      requireCustomerDenied(await rpc('fn_handoff_receipt_case_to_crm_v1','B',{...handoffArgs('initial'),p_stage_id:state.accounts.B.stage_ids[0]}));
      requireCustomerDenied(await rpc('fn_handoff_receipt_case_to_crm_v1','A',{...handoffArgs('initial'),p_stage_id:state.accounts.B.stage_ids[0]}));return true;
    });
    state.initial_link=await record('initial_handoff_and_exact_retry_one_receipt',async()=>{
      const args=handoffArgs('initial'),receipt=uuidReceipt(success(await rpc('fn_handoff_receipt_case_to_crm_v1','A',args)),'source_link_id');
      check(isUuid(receipt.lead_id)&&isUuid(receipt.activity_id)&&receipt.source_link_id===args.p_request_id,'HANDOFF_RECEIPT_INVALID');
      const replay=success(await rpc('fn_handoff_receipt_case_to_crm_v1','A',args));check(replay.replayed===true&&replay.lead_id===receipt.lead_id&&replay.activity_id===receipt.activity_id&&replay.source_link_id===receipt.source_link_id,'HANDOFF_REPLAY_INVALID');return receipt;
    });await save();
    await record('initial_customer_detail_matches_frozen_synthetic_contract',async()=>{
      const dto=await readDetail();
      check(dto.snapshot.snapshot_id===state.scopes.initial.snapshot.id&&dto.snapshot.acceptance_id===state.commands.accept_initial&&dto.snapshot.evidence_kind==='synthetic'&&Date.parse(dto.snapshot.valid_until)===Date.parse(state.accept_until_initial)&&dto.cases.length===1&&dto.cases[0].record_key===state.scopes.initial.records[0].record_key,'INITIAL_DETAIL_MISMATCH');
      equal(await rows('properties','A',`id=in.(${state.properties.map(row=>row.property_id).join(',')})&select=*`),[],'ACTIVE_RECEIPT_LEAKED_IN_GENERIC_PROPERTY_READ');return true;
    });
    await record('private_customer_fields_saved',async()=>{
      state.private_lead_patch??={title:'Synthetic private negotiation',notes:'Private synthetic notes; preserve through source refresh.',stage_id:state.accounts.A.stage_ids[1],priority:3,
        next_action:'Synthetic private follow-up',next_follow_up_at:new Date(Date.now()+86400000).toISOString(),estimated_value:250000,estimated_repairs:15000,offer_amount:200000,contract_deadline:'2026-12-31',contact_restricted:true};await save();
      const changed=success(await request(`/rest/v1/leads?id=eq.${state.initial_link.lead_id}&select=*`,{actor:'A',method:'PATCH',body:state.private_lead_patch,prefer:'return=representation'}));
      requirePrivateLeadReadback(changed,state.initial_link.lead_id,state.private_lead_patch);return true;
    });
    const children=[['note','lead_activities',{id:state.commands.note,lead_id:state.initial_link.lead_id,org_id:state.accounts.A.org_id,actor_id:state.accounts.A.id,activity_type:'note',payload:{note:'Synthetic private note retained after source changes.'}}],
      ['task','lead_activities',{id:state.commands.task,lead_id:state.initial_link.lead_id,org_id:state.accounts.A.org_id,actor_id:state.accounts.A.id,activity_type:'task',payload:{description:'Synthetic private task',completed:false}}],
      ['contact','crm_contacts',{id:state.commands.contact,lead_id:state.initial_link.lead_id,org_id:state.accounts.A.org_id,name:'Synthetic private contact',relationship:'other',email:'synthetic-private-contact@example.invalid',source:'Synthetic manual relationship',do_not_contact:true,restriction_note:'Synthetic customer restriction'}]];
    for(const [label,table,body] of children)await record(`private_${label}_saved_with_exact_readback`,async()=>{
      let current=await rows(table,'A',`id=eq.${body.id}&select=*`);
      if(current.length===0){success(await request(`/rest/v1/${table}`,{actor:'A',method:'POST',body,prefer:'return=representation'}));current=await rows(table,'A',`id=eq.${body.id}&select=*`);}
      check(current.length===1,'PRIVATE_CHILD_RECEIPT_UNCONFIRMED');
      for(const key of Object.keys(body))equal(current[0][key],body[key],'PRIVATE_CHILD_CHANGED_INPUT');return true;
    });
    state.expected_private=await record('full_private_crm_snapshot_captured',()=>readPrivate(runtime,state));await save();
    await record('customer_b_cannot_read_customer_a_source_or_private_work',()=>checkForeign(runtime,state));
    await emitSql('refresh');state.phase='initial_complete';await save();return;
  }

  await reviewAccept('refresh');
  state.refresh_link=await record('synthetic_refresh_reuses_lead_and_appends_source_receipt',async()=>{
    const receipt=uuidReceipt(success(await rpc('fn_handoff_receipt_case_to_crm_v1','A',handoffArgs('refresh'))),'source_link_id');
    check(receipt.lead_id===state.initial_link.lead_id&&receipt.created===false&&isUuid(receipt.activity_id)&&receipt.activity_id!==state.initial_link.activity_id,'REFRESH_LEAD_OR_ANNOTATION_MISMATCH');return receipt;
  });await save();
  await record('refresh_preserves_entire_lead_contacts_dnc_notes_tasks_and_updated_at',async()=>{
    equal(await readPrivate(runtime,state),state.expected_private,'REFRESH_CHANGED_PRIVATE_CRM');return true;
  });
  await record('refresh_detail_is_one_new_synthetic_snapshot',async()=>{
    const dto=await readDetail();check(dto.snapshot.snapshot_id===state.scopes.refresh.snapshot.id&&dto.snapshot.acceptance_id===state.commands.accept_refresh&&dto.snapshot.evidence_kind==='synthetic'&&dto.cases.length===1&&dto.cases[0].status==='CANCELLED'&&dto.cases[0].record_key===state.scopes.initial.records[0].record_key&&dto.cases[0].version_id===state.scopes.refresh.records[0].version_id&&dto.cases[0].citation.original_sha256===state.scopes.refresh.snapshot.original_sha256,'REFRESH_DETAIL_MISMATCH');return true;
  });
  await record('old_acceptance_revoked_with_saved_command',async()=>{
    const receipt=uuidReceipt(success(await rpc('fn_revoke_receipt_case_decision_v1','O',{p_command_id:state.commands.revoke_old,p_snapshot_id:state.scopes.initial.snapshot.id,p_kind:'acceptance',p_target_id:state.commands.accept_initial,p_evidence_sha256:config.operator_authority_reference_sha256})),'revocation_id');equal(receipt.revocation_id,state.commands.revoke_old,'REVOCATION_RECEIPT_MISMATCH');return receipt;
  });
  await record('old_retry_denied_while_new_detail_and_annotation_remain',async()=>{
    requireCustomerDenied(await rpc('fn_handoff_receipt_case_to_crm_v1','A',handoffArgs('initial')));
    requireCustomerDenied(await rpc('fn_list_receipt_case_properties_v1','A',{p_acceptance_id:state.commands.accept_initial,p_limit:25,p_offset:0}));
    equal((await readDetail()).snapshot.snapshot_id,state.scopes.refresh.snapshot.id,'REFRESH_LOST_AFTER_OLD_REVOCATION');
    equal((await rows('lead_activities','A',`id=in.(${state.initial_link.activity_id},${state.refresh_link.activity_id})&select=id&order=id`)).map(row=>row.id),[state.refresh_link.activity_id],'OLD_SOURCE_ANNOTATION_STILL_VISIBLE');return true;
  });
  await record('new_snapshot_revoked_with_saved_command',async()=>{
    const receipt=uuidReceipt(success(await rpc('fn_revoke_receipt_case_decision_v1','O',{p_command_id:state.commands.revoke_new,p_snapshot_id:state.scopes.refresh.snapshot.id,p_kind:'snapshot',p_target_id:state.scopes.refresh.snapshot.id,p_evidence_sha256:config.operator_authority_reference_sha256})),'revocation_id');equal(receipt.revocation_id,state.commands.revoke_new,'REVOCATION_RECEIPT_MISMATCH');return receipt;
  });
  await record('all_revoked_detail_property_and_source_annotation_access_denied',async()=>{
    requireCustomerDenied(await rpc('fn_get_receipt_case_crm_detail_v1','A',{p_lead_id:state.initial_link.lead_id}));
    for(const which of ['initial','refresh']){
      requireCustomerDenied(await rpc('fn_list_receipt_case_properties_v1','A',{p_acceptance_id:state.commands[`accept_${which}`],p_limit:25,p_offset:0}));
      requireCustomerDenied(await rpc('fn_handoff_receipt_case_to_crm_v1','A',handoffArgs(which)));
    }
    equal(await rows('properties','A',`id=in.(${state.properties.map(row=>row.property_id).join(',')})&select=*`),[],'REVOKED_PROPERTY_STILL_VISIBLE');
    equal(await rows('lead_activities','A',`id=in.(${state.initial_link.activity_id},${state.refresh_link.activity_id})&select=*`),[],'REVOKED_ANNOTATION_STILL_VISIBLE');
    equal(success(await rpc('fn_my_receipt_case_acceptances_v1','A')).acceptances,[],'REVOKED_ACCEPTANCE_STILL_LISTED');return true;
  });
  await record('revocation_preserves_customer_private_crm_and_foreign_isolation',async()=>{
    equal(await readPrivate(runtime,state),state.expected_private,'REVOCATION_CHANGED_PRIVATE_CRM');await checkForeign(runtime,state);return true;
  });
  // A new real acceptance on the still-reviewed initial snapshot expires by the
  // server clock. No database timestamp is edited to simulate expiry.
  if(!state.accept_until_expiry){state.accept_until_expiry=new Date(Date.now()+20000).toISOString();await save();}
  await record('real_short_acceptance_created_with_persisted_deadline',async()=>{
    const receipt=uuidReceipt(success(await rpc('fn_accept_receipt_case_snapshot_v1','O',{
      p_command_id:state.commands.accept_expiry,p_review_id:state.commands.review_initial,p_consumer_user_id:state.accounts.A.id,
      p_purpose:'crm',p_valid_until:state.accept_until_expiry,p_evidence_sha256:config.operator_authority_reference_sha256,
    })),'acceptance_id');equal(receipt.acceptance_id,state.commands.accept_expiry,'EXPIRY_ACCEPTANCE_RECEIPT_MISMATCH');return receipt;
  });
  const expiryArgs={p_request_id:state.commands.handoff_expiry,p_acceptance_id:state.commands.accept_expiry,
    p_source_property_key:state.scopes.initial.records[0].source_property_key,p_stage_id:state.accounts.A.stage_ids[0]};
  state.expiry_link=await record('real_short_acceptance_handoff_reuses_private_lead',async()=>{
    const receipt=uuidReceipt(success(await rpc('fn_handoff_receipt_case_to_crm_v1','A',expiryArgs)),'source_link_id');
    check(receipt.lead_id===state.initial_link.lead_id&&receipt.created===false&&isUuid(receipt.activity_id)&&receipt.source_link_id===state.commands.handoff_expiry,'EXPIRY_HANDOFF_RECEIPT_INVALID');return receipt;
  });await save();
  await record('real_short_acceptance_detail_observed_before_expiry',async()=>{
    const dto=await readDetail();
    check(dto.snapshot.acceptance_id===state.commands.accept_expiry&&dto.snapshot.snapshot_id===state.scopes.initial.snapshot.id&&Date.parse(dto.snapshot.valid_until)===Date.parse(state.accept_until_expiry)&&Date.now()<Date.parse(state.accept_until_expiry),'EXPIRY_ACTIVE_WINDOW_NOT_OBSERVED');return true;
  });
  await record('real_acceptance_deadline_elapsed_without_database_edits',async()=>{
    const remaining=Math.max(0,Date.parse(state.accept_until_expiry)-Date.now()+1000);
    check(Number.isFinite(remaining)&&remaining<=21000,'EXPIRY_WAIT_OUTSIDE_BOUND');
    if(remaining>0)await delay(remaining);return true;
  });
  await record('real_expiry_denies_detail_list_retry_and_all_source_annotations',async()=>{
    requireCustomerDenied(await rpc('fn_get_receipt_case_crm_detail_v1','A',{p_lead_id:state.initial_link.lead_id}));
    requireCustomerDenied(await rpc('fn_list_receipt_case_properties_v1','A',{p_acceptance_id:state.commands.accept_expiry,p_limit:25,p_offset:0}));
    requireCustomerDenied(await rpc('fn_handoff_receipt_case_to_crm_v1','A',expiryArgs));
    equal(await rows('properties','A',`id=in.(${state.properties.map(row=>row.property_id).join(',')})&select=*`),[],'EXPIRED_PROPERTY_STILL_VISIBLE');
    equal(await rows('lead_activities','A',`id=in.(${state.initial_link.activity_id},${state.refresh_link.activity_id},${state.expiry_link.activity_id})&select=*`),[],'EXPIRED_SOURCE_ANNOTATION_STILL_VISIBLE');
    equal(success(await rpc('fn_my_receipt_case_acceptances_v1','A')).acceptances,[],'EXPIRED_ACCEPTANCE_STILL_LISTED');
    equal(await readPrivate(runtime,state),state.expected_private,'EXPIRY_CHANGED_PRIVATE_CRM');await checkForeign(runtime,state);return true;
  });
  state.pending=state.pending.filter(name=>name!=='short_expiry_http');
  state.phase='complete';state.completed_at=timestamp();await save();
}

export function parseArguments(args) {
  if(args.length===0||args.includes('--help')||args.includes('-h'))return {help:true};
  const phase=args[0];check(PHASES.includes(phase),'PHASE_INVALID');
  const parsed={phase};
  for(let i=1;i<args.length;i+=2){
    check(['--config','--state'].includes(args[i])&&typeof args[i+1]==='string'&&!args[i+1].startsWith('--'),'ARGUMENTS_INVALID');
    const key=args[i].slice(2);check(parsed[key]===undefined,'DUPLICATE_ARGUMENT');parsed[key]=args[i+1];
  }
  check(isAbsolute(parsed.config??'')&&isAbsolute(parsed.state??'')&&parsed.config!==parsed.state,'ABSOLUTE_PRIVATE_CONFIG_AND_STATE_REQUIRED');return parsed;
}
const HELP=`Usage: node scripts/tests/release-hosted-source/hosted.mjs <phase> --config /private/config.json --state /private/state.json

Phases:
  prepare-auth  Verify staging marker/checkout hold; create and verify three real synthetic Auth accounts; write private initial.sql.
  initial       After reviewed manual initial.sql application, prove A-only acceptance/handoff and save private CRM; write refresh.sql.
  refresh       After reviewed manual refresh.sql application, prove synthetic refresh, revocation and real 20-second expiry preserve private CRM.

Config fields: project_ref, expected_fixture_nonce, anon_key, service_role_key, operator_authority_reference_sha256.
Use an existing mode-0700 directory outside the repository; config/state/SQL are mode 0600.
The runner never executes SQL, sends email, exports source records or calls providers.
Keep the private state for reconciliation. Never delete referenced accounts to clean up.
Refresh waits at most 21 seconds for a real saved acceptance deadline; a missed active window fails honestly.
Browser, concurrent revocation and actual original-backed acceptance remain explicitly pending.
Importing the module is inert. Only an explicit phase invocation performs HTTP requests.
`;

export async function main(args=process.argv.slice(2)) {
  const options=parseArguments(args);if(options.help){process.stdout.write(HELP);return;}
  process.umask(0o077);
  const config=validateConfig(await readPrivateJson(options.config,{limit:16384}));
  const statePath=await privatePath(options.state);
  check(![resolve(dirname(statePath),'initial.sql'),resolve(dirname(statePath),'refresh.sql')].includes(options.config),'CONFIG_MUST_NOT_OVERLAP_SQL_OUTPUT');
  check(!['initial.sql','refresh.sql'].includes(basename(statePath)),'STATE_MUST_NOT_OVERLAP_SQL_OUTPUT');
  let lock;
  try{lock=await open(`${statePath}.lock`,'wx',0o600);await lock.writeFile('Private receipt proof in progress. Reconcile state before removing a stale lock.\n');await lock.sync();}
  catch{throw new HostedProofError('STATE_LOCKED_OR_UNAVAILABLE');}
  let state,save;
  try{
    state=await readPrivateJson(statePath,{optional:true});
    if(!state){check(options.phase==='prepare-auth','PREPARE_AUTH_PHASE_REQUIRED');state=newState(config);}
    validateState(state,config);
    save=()=>atomicPrivateWrite(statePath,JSON.stringify(state,null,2)+'\n');await save();
    const runtime=createRuntime(config,state,save);await runtime.verifyBoundary();
    await executePhase(options.phase,runtime,config,state,statePath,save);
    delete state.last_failure;await save();
    process.stdout.write(JSON.stringify({phase:options.phase,status:state.phase==='complete'?'PASS_BOUNDED_SYNTHETIC_SOURCE_HTTP':'PHASE_COMPLETE',checks:state.checks,counts:{accounts:LABELS.filter(label=>state.accounts[label].id).length,reviewed_cases_per_snapshot:3,held_cases_per_snapshot:2,synthetic_property_identities:3},pending:state.pending})+'\n');
  }catch(error){
    if(state&&save){state.last_failure={phase:options.phase,at:timestamp(),code:error instanceof HostedProofError?error.code:'RUNNER_FAILED',uncertain:error instanceof HostedProofError&&error.uncertain};try{await save();}catch{/* Never print private state or underlying file errors. */}}
    throw error;
  }finally{await lock.close();await unlink(`${statePath}.lock`);}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(error=>{
    process.stdout.write(JSON.stringify({status:'FAIL_OR_UNCERTAIN',error_code:error instanceof HostedProofError?error.code:'RUNNER_FAILED',uncertain:error instanceof HostedProofError&&error.uncertain})+'\n');
    process.exitCode=1;
  });
}
