import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {connect,request,success,denied,workdir,service,anon} from './runtime.mjs';

const receipt={kind:'ephemeral_local_supabase_http_integration',status:'RUNNING',synthetic_data_only:true,hosted_supabase_verified:false,real_payment_verified:false,production_writes:0,checks:[]};
const rpc=(name,token,body={})=>request(`/rest/v1/rpc/${name}`,{token,method:'POST',body});
const row=data=>{const result=Array.isArray(data)?data[0]:data;assert.ok(result?.id,'Expected one database row');return result;};

test('real local Supabase Auth, PostgREST and function gateway preserve release boundaries',async t=>{
  const sql=await connect();t.after(()=>sql.end());
  const bootstrap=JSON.parse(await readFile(`${workdir}/bootstrap-receipt.json`,'utf8'));
  assert.equal(bootstrap.managed_auth_preserved,true);receipt.managed_auth_preserved=true;
  receipt.postgresql_version=(await sql.query("SELECT current_setting('server_version') value")).rows[0].value;
  const record=async(name,fn)=>t.test(name,async()=>{await fn();receipt.checks.push({name,result:'PASS'});});
  let a,b,orgA,orgB,lead;
  const password='Synthetic-only-CI-password-924!';
  const property=randomUUID(),held=randomUUID(),outcome=randomUUID();
  async function signup(label,metadata){
    const email=`synthetic-${label}@example.invalid`;
    const created=success(await request('/auth/v1/signup',{method:'POST',body:{email,password,data:metadata}}));
    assert.ok(created.user?.id,'GoTrue signup did not create an identity');
    const signed=success(await request('/auth/v1/token?grant_type=password',{method:'POST',body:{email,password}}));
    assert.equal(signed.user.id,created.user.id);assert.ok(signed.access_token&&signed.refresh_token);
    return {id:signed.user.id,token:signed.access_token,refresh:signed.refresh_token};
  }
  await record('real signup and password sessions isolate workspaces despite forged metadata',async()=>{
    a=await signup('alpha',{full_name:'Synthetic Alpha',role:'admin',org_id:'00000000-0000-0000-0000-000000000001'});
    b=await signup('bravo',{full_name:'Synthetic Bravo',role:'admin',org_id:'00000000-0000-0000-0000-000000000001'});
    const profiles=await sql.query('SELECT user_id,org_id FROM public.profiles WHERE user_id=ANY($1::uuid[])',[[a.id,b.id]]);
    orgA=profiles.rows.find(p=>p.user_id===a.id).org_id;orgB=profiles.rows.find(p=>p.user_id===b.id).org_id;
    assert.notEqual(orgA,orgB);assert.notEqual(orgA,'00000000-0000-0000-0000-000000000001');
    for(const account of [a,b]){
      assert.equal(success(await rpc('fn_customer_workspace_ready_v1',account.token)),true);
      const roles=success(await request('/rest/v1/user_roles?select=role',{token:account.token}));
      assert.deepEqual(roles.map(r=>r.role),['user']);
      assert.equal(success(await request('/rest/v1/pipeline_stages?select=id',{token:account.token})).length,7);
    }
    const identityCount=(await sql.query('SELECT count(*)::int n FROM auth.identities WHERE user_id=ANY($1::uuid[])',[[a.id,b.id]])).rows[0].n;
    assert.equal(identityCount,2,'Must use real GoTrue identities, not direct auth.users fixture inserts');
  });
  await record('PostgREST denies anonymous CRM and server-only billing RPC access',async()=>{
    denied(await request('/rest/v1/leads?select=id'));
    denied(await rpc('fn_crm_add_property_v1',anon,{p_property_id:property}));
    denied(await rpc('fn_apply_billing_event_v1',a.token,{p_event:{}}));
    denied(await rpc('fn_provision_customer_workspace_v1',a.token,{p_user_id:b.id,p_review_reference:'forged'}));
  });
  await record('ordinary-property handoff honors visibility and unlocks through HTTP',async()=>{
    await sql.query("INSERT INTO public.properties(id,address) VALUES ($1,'Synthetic released property'),($2,'Synthetic held property')",[property,held]);
    await sql.query('INSERT INTO public.unlocked_properties(user_id,property_id) VALUES ($1,$2)',[a.id,property]);
    lead=row(success(await rpc('fn_crm_add_property_v1',a.token,{p_property_id:property})));
    assert.equal(row(success(await rpc('fn_crm_add_property_v1',a.token,{p_property_id:property}))).id,lead.id);
    denied(await rpc('fn_crm_add_property_v1',a.token,{p_property_id:held}));
    denied(await rpc('fn_crm_add_property_v1',b.token,{p_property_id:property}));
    assert.equal(success(await request('/rest/v1/leads?select=id',{token:b.token})).length,0);
  });
  await record('private contacts and notes resist foreign-account reads and writes',async()=>{
    success(await request('/rest/v1/crm_contacts',{token:a.token,method:'POST',body:{lead_id:lead.id,org_id:orgA,name:'Synthetic contact',source:'Synthetic fixture'}}));
    success(await request('/rest/v1/lead_activities',{token:a.token,method:'POST',body:{lead_id:lead.id,org_id:orgA,actor_id:a.id,activity_type:'note',payload:{note:'Synthetic private note'}}}));
    for(const table of ['crm_contacts','lead_activities'])assert.equal(success(await request(`/rest/v1/${table}?select=id`,{token:b.token})).length,0);
    denied(await request('/rest/v1/crm_contacts',{token:b.token,method:'POST',body:{lead_id:lead.id,org_id:orgB,name:'Forged synthetic relationship',source:'Synthetic fixture'}}));
    const changed=success(await request(`/rest/v1/leads?id=eq.${lead.id}`,{token:b.token,method:'PATCH',headers:{Prefer:'return=representation'},body:{title:'Forged'}}));
    assert.deepEqual(changed,[]);
    // An UPDATE hidden by its RLS USING policy changes zero rows rather than
    // raising. Assert the represented rows AND the canonical stored identity.
    assert.deepEqual(success(await request(`/rest/v1/profiles?user_id=eq.${a.id}`,{token:a.token,method:'PATCH',headers:{Prefer:'return=representation'},body:{org_id:orgB}})),[]);
    assert.equal((await sql.query('SELECT org_id FROM public.profiles WHERE user_id=$1',[a.id])).rows[0].org_id,orgA);
    assert.deepEqual(success(await request(`/rest/v1/pipeline_stages?org_id=eq.${orgB}&select=id`,{token:a.token})),[]);
  });
  await record('HTTP outcome retry reconciles one receipt and rejects stale competing action',async()=>{
    lead=row(success(await request(`/rest/v1/leads?id=eq.${lead.id}&select=*`,{token:a.token})));
    const command={p_lead_id:lead.id,p_request_id:outcome,p_expected_updated_at:lead.updated_at,p_outcome:'research',p_note:'Synthetic reviewed note',p_next_action:'Review synthetic source',p_due_at:'2030-02-01T00:00:00Z',p_complete_action:false};
    const changed=row(success(await rpc('fn_crm_record_outcome_v1',a.token,command)));
    assert.equal(row(success(await rpc('fn_crm_record_outcome_v1',a.token,command))).id,lead.id);
    assert.equal(success(await request(`/rest/v1/lead_activities?id=eq.${outcome}&select=id`,{token:a.token})).length,1);
    const staleRequest=randomUUID();
    const stale=await rpc('fn_crm_record_outcome_v1',a.token,{...command,p_request_id:staleRequest});
    // Business version conflicts map directly to HTTP409; never request a transaction retry.
    assert.equal(stale.status,409);assert.equal(stale.data.code,'PT409');
    assert.equal((await sql.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[staleRequest])).rows[0].n,0);
    assert.equal(row(success(await request(`/rest/v1/leads?id=eq.${lead.id}&select=*`,{token:a.token}))).updated_at,changed.updated_at);
    denied(await rpc('fn_crm_record_outcome_v1',b.token,{...command,p_request_id:randomUUID(),p_expected_updated_at:changed.updated_at}));
  });
  await record('real token refresh retains only its own private workspace',async()=>{
    const refreshed=success(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.refresh}}));
    assert.equal(refreshed.user.id,a.id);a.token=refreshed.access_token;
    assert.equal(success(await request('/rest/v1/crm_contacts?select=id',{token:a.token})).length,1);
    assert.equal(success(await request('/rest/v1/crm_contacts?select=id',{token:b.token})).length,0);
  });
  await record('service-only synthetic billing replay cannot release checkout or source data',async()=>{
    const payment={user_id:a.id,kind:'bulk_credits',session_id:'cs_local_http_synthetic',payment_intent_id:'pi_local_http_synthetic',amount:75000,currency:'usd',credits:5000};
    for(const event_id of ['evt_local_http_synthetic_a','evt_local_http_synthetic_b'])success(await rpc('fn_apply_billing_event_v1',service,{p_event:{event_id,event_type:'synthetic_local_fixture',payment}}));
    assert.equal((await sql.query('SELECT count(*)::int n FROM public.transactions')).rows[0].n,1);
    assert.equal((await sql.query('SELECT sum(delta)::int n FROM public.credit_ledger WHERE user_id=$1',[a.id])).rows[0].n,5000);
    assert.equal(success(await rpc('fn_billing_checkout_enabled_v1',service)),false);
    denied(await rpc('fn_crm_add_property_v1',a.token,{p_property_id:held}));
  });
  await record('local gateway preserves configured JWT checks and internal worker guard',async()=>{
    // Functions may need their initial public package download; retries here only
    // poll a side-effect-free retired endpoint, never a provider or billing call.
    let ready;
    for(let i=0;i<60;i++){
      try{ready=await request('/functions/v1/test-pipeline',{method:'POST',body:{}});}catch{}
      if(ready?.status===401&&ready.data?.error==='unauthorized')break;
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.equal(ready?.status,401);assert.equal(ready?.data?.error,'unauthorized');
    const forged=`${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"role":"service_role","exp":4102444800}').toString('base64url')}.invalid`;
    for(const token of ['',forged,a.token]){
      const result=await request('/functions/v1/test-pipeline',{token,method:'POST',body:{}});
      assert.equal(result.status,401);assert.equal(result.data.error,'unauthorized');
    }
    const internal=(await readFile(`${workdir}/functions.env`,'utf8')).match(/^INTERNAL_FUNCTION_SECRET=(.+)$/m)?.[1];assert.ok(internal);
    for(const options of [{token:service},{token:'',headers:{'x-internal-secret':internal}}]){
      const result=await request('/functions/v1/test-pipeline',{...options,method:'POST',body:{}});
      assert.equal(result.status,410);assert.equal(result.data.error,'endpoint_retired');
    }
    for(const token of ['',forged]){
      const result=await request('/functions/v1/create-checkout-session',{token,method:'POST',body:{}});
      assert.equal(result.status,401);
      // The handler also returns 401, so status alone cannot prove gateway JWT
      // verification. Require the gateway envelope, not its Unauthorized body.
      // CLI2.117.0 uses named RequestErrors plus this matching gateway header
      // (apps/cli/src/shared/functions/serve.main.ts), not numeric body codes.
      const expected=token===''?['UNAUTHORIZED_NO_AUTH_HEADER','UNAUTHORIZED_INVALID_JWT_FORMAT']:['UNAUTHORIZED_LEGACY_JWT'];
      assert.ok(expected.includes(result.data.code),'Expected the pinned local gateway rejection code');
      assert.equal(result.gatewayErrorCode,result.data.code);
      assert.equal(typeof result.data.message,'string');
      assert.equal(result.data.error,undefined);
    }
    const heldCheckout=await request('/functions/v1/create-checkout-session',{token:a.token,method:'POST',body:{mode:'subscription',plan:'starter'}});
    assert.equal(heldCheckout.status,503);assert.equal(heldCheckout.data.code,'checkout_paused');
  });
  await record('real Auth ban blocks existing token at the database workspace fence',async()=>{
    success(await request(`/auth/v1/admin/users/${b.id}`,{token:service,method:'PUT',body:{ban_duration:'1h'}}));
    assert.equal(success(await rpc('fn_customer_workspace_ready_v1',b.token)),false);
    assert.equal(success(await request('/rest/v1/pipeline_stages?select=id',{token:b.token})).length,0);
    denied(await rpc('fn_crm_record_outcome_v1',b.token,{p_lead_id:lead.id,p_request_id:randomUUID(),p_expected_updated_at:lead.updated_at,p_outcome:'research',p_note:'',p_next_action:null,p_due_at:null,p_complete_action:false}));
  });
  receipt.status=receipt.checks.length===9?'PASS':'FAIL';
  receipt.limits=['Selected application baseline; not a managed deployment clone','Synthetic property/unlock/source lineage fixtures','No browser, realtime, Storage, provider payment, delivery or restored-backup proof'];
  await writeFile('local-supabase-receipt.json',JSON.stringify(receipt,null,2)+'\n');
  assert.equal(receipt.status,'PASS');
});
