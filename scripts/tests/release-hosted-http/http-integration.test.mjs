import test from 'node:test';
import {randomUUID, randomBytes} from 'node:crypto';
import {HarnessError, loadConfig, reserveReceipt, createRuntime, requireCheck as check, success, denied, one, isUuid, userAuthDenialLayer} from './runtime.mjs';

export async function runHostedAcceptance(config) {
  const write = await reserveReceipt(config);
  const receipt = {
    kind: 'isolated_hosted_supabase_http_acceptance', status: 'RUNNING',
    started_at: new Date().toISOString(), project_ref: config.project_ref,
    expected_commit: config.expected_commit, expected_commit_scope:'harness_source',
    operator_recorded_function_commits:config.function_commits??null, deployed_commit_independently_verified: false,
    run_id: config.run_id, synthetic_data_only: true, checks: [], operation_journal:[],
    production_writes: 0, real_payment_verified: false, email_sent: false,
    genuine_signup_or_email_confirmation_verified: false,
    browser_verified: false, immediate_logout_jwt_revocation_verified: false,
    synthetic_user_ids: [], synthetic_property_ids: [],
    limits: [
      'Selected synthetic application baseline, not a restored production deployment',
      'Admin-confirmed synthetic Auth users; no signup email or genuine confirmation journey',
      'Synthetic property/unlock visibility; no municipal source-lineage acceptance',
      'No browser, realtime, Storage, backup restoration, provider payment or useful delivery proof',
      'A ban fences existing tokens through auth.users; session revocation is not an immediate access-JWT fence',
      'Function commit binding is supplied by the operator, not proven by HTTP responses',
    ],
  };
  const {request, verifyBoundary} = createRuntime(config, {onOperation:async operation => {
    receipt.current_operation = operation;
    receipt.operation_journal.push(operation);
    await write(receipt);
  }});
  let current = 'staging_boundary', a, b, orgA, orgB, leadA, leadB;
  const propertyA = randomUUID(), propertyB = randomUUID(), held = randomUUID();
  const rpc = (name, token, body = {}) => request(`/rest/v1/rpc/${name}`, {token, method:'POST', body});
  const rows = async (table, token, query = 'select=id') => success(await request(`/rest/v1/${table}?${query}`, {token}));
  const record = async (name, fn) => {
    current = name; receipt.current_check = name; await write(receipt);
    const status = (await fn()) ?? 'PASS';
    receipt.checks.push({name, status}); await write(receipt);
  };
  const equal = (value, expected, code) => check(JSON.stringify(value) === JSON.stringify(expected), code);
  try {
    await write(receipt);
    await record('staging_marker_matches_private_target_nonce', async () => { await verifyBoundary(); receipt.staging_marker_verified = true; });
    await record('admin_confirmed_synthetic_users_have_real_password_sessions_and_private_workspaces', async () => {
      async function account(label) {
        const email = `synthetic-${label}-${config.run_id}@example.invalid`;
        const password = `Synthetic-${randomBytes(30).toString('base64url')}-9!`;
        const created = success(await request('/auth/v1/admin/users', {admin:true, method:'POST', body:{
          email, password, email_confirm:true,
          user_metadata:{full_name:`Synthetic ${label}`, hosted_http_run:config.run_id, role:'admin', org_id:'00000000-0000-0000-0000-000000000001'},
        }}));
        const user = created.user ?? created; check(isUuid(user.id), 'CREATED_USER_MISSING');
        receipt.synthetic_user_ids.push(user.id); await write(receipt);
        const session = success(await request('/auth/v1/token?grant_type=password', {method:'POST', body:{email,password}}));
        check(session.user?.id === user.id && !!session.access_token && !!session.refresh_token, 'REAL_PASSWORD_SESSION_REQUIRED');
        const identity = success(await request('/auth/v1/user', {token:session.access_token}));
        check(identity.id === user.id && identity.email_confirmed_at && Array.isArray(identity.identities) && identity.identities.some(i => i.provider === 'email'), 'REAL_CONFIRMED_AUTH_IDENTITY_REQUIRED');
        return {id:user.id, token:session.access_token, refresh:session.refresh_token};
      }
      a = await account('alpha'); b = await account('bravo');
      const pA = await rows('profiles', a.token, `select=user_id,org_id&user_id=eq.${a.id}`);
      const pB = await rows('profiles', b.token, `select=user_id,org_id&user_id=eq.${b.id}`);
      check(pA.length === 1 && pB.length === 1, 'PRIVATE_PROFILE_REQUIRED');
      orgA = pA[0].org_id; orgB = pB[0].org_id;
      check(isUuid(orgA) && isUuid(orgB) && orgA !== orgB && orgA !== '00000000-0000-0000-0000-000000000001' && orgB !== '00000000-0000-0000-0000-000000000001', 'PRIVATE_WORKSPACES_REQUIRED');
      for (const account of [a,b]) {
        equal(success(await rpc('fn_customer_workspace_ready_v1',account.token)), true, 'WORKSPACE_NOT_READY');
        equal((await rows('user_roles',account.token,'select=role')).map(r=>r.role), ['user'], 'FORGED_ROLE_ACCEPTED');
        check((await rows('pipeline_stages',account.token)).length === 7, 'DEFAULT_STAGES_MISSING');
      }
    });
    await record('anonymous_and_customer_tokens_cannot_reach_server_authority', async () => {
      denied(await request('/rest/v1/leads?select=id'));
      denied(await rpc('fn_crm_add_property_v1',undefined,{p_property_id:propertyA}));
      denied(await rpc('fn_apply_billing_event_v1',a.token,{p_event:{}}));
      denied(await rpc('fn_provision_customer_workspace_v1',a.token,{p_user_id:b.id,p_review_reference:'synthetic unauthorized request'}));
    });
    await record('fixture_role_lookup_is_self_only_and_never_an_account_oracle', async () => {
      for (const [account,foreign] of [[a,b],[b,a]]) {
        equal(success(await rpc('has_role',account.token,{u:account.id,r:'user'})),true,'OWN_ROLE_NOT_READABLE');
        equal(success(await rpc('has_role',account.token,{u:foreign.id,r:'user'})),false,'FOREIGN_ROLE_ORACLE_EXPOSED');
        equal(success(await rpc('has_role',account.token,{u:account.id,r:'admin'})),false,'FORGED_ADMIN_ROLE_ACCEPTED');
      }
      denied(await rpc('has_role',undefined,{u:a.id,r:'user'}));
    });
    await record('ordinary_synthetic_handoff_requires_own_visibility_and_unlock', async () => {
      receipt.synthetic_property_ids = [propertyA,propertyB,held]; await write(receipt);
      success(await request('/rest/v1/properties',{admin:true,method:'POST',body:[
        {id:propertyA,address:`Synthetic hosted ${config.run_id} alpha`},
        {id:propertyB,address:`Synthetic hosted ${config.run_id} bravo`},
        {id:held,address:`Synthetic hosted ${config.run_id} held`},
      ]}));
      success(await request('/rest/v1/unlocked_properties',{admin:true,method:'POST',body:[{user_id:a.id,property_id:propertyA},{user_id:b.id,property_id:propertyB}]}));
      leadA = one(success(await rpc('fn_crm_add_property_v1',a.token,{p_property_id:propertyA})));
      leadB = one(success(await rpc('fn_crm_add_property_v1',b.token,{p_property_id:propertyB})));
      equal(one(success(await rpc('fn_crm_add_property_v1',a.token,{p_property_id:propertyA}))).id, leadA.id, 'HANDOFF_REPLAY_DUPLICATED');
      denied(await rpc('fn_crm_add_property_v1',a.token,{p_property_id:held}));
      denied(await rpc('fn_crm_add_property_v1',b.token,{p_property_id:propertyA}));
      equal(await rows('leads',b.token,`id=eq.${leadA.id}&select=id`), [], 'FOREIGN_LEAD_VISIBLE');
      equal(await rows('leads',a.token,`id=eq.${leadB.id}&select=id`), [], 'FOREIGN_LEAD_VISIBLE');
    });
    await record('private_contacts_notes_and_identity_resist_foreign_reads_and_writes', async () => {
      for (const [account,org,lead] of [[a,orgA,leadA],[b,orgB,leadB]]) {
        success(await request('/rest/v1/crm_contacts',{token:account.token,method:'POST',body:{lead_id:lead.id,org_id:org,name:'Synthetic contact',source:'Synthetic fixture'}}));
        success(await request('/rest/v1/lead_activities',{token:account.token,method:'POST',body:{lead_id:lead.id,org_id:org,actor_id:account.id,activity_type:'note',payload:{note:'Synthetic private note'}}}));
      }
      for (const table of ['crm_contacts','lead_activities']) {
        equal(await rows(table,b.token,`lead_id=eq.${leadA.id}&select=id`), [], 'FOREIGN_PRIVATE_DATA_VISIBLE');
        equal(await rows(table,a.token,`lead_id=eq.${leadB.id}&select=id`), [], 'FOREIGN_PRIVATE_DATA_VISIBLE');
      }
      denied(await request('/rest/v1/crm_contacts',{token:b.token,method:'POST',body:{lead_id:leadA.id,org_id:orgB,name:'Synthetic rejected contact',source:'Synthetic fixture'}}));
      equal(success(await request(`/rest/v1/leads?id=eq.${leadA.id}`,{token:b.token,method:'PATCH',headers:{Prefer:'return=representation'},body:{title:'Synthetic forged'}})), [], 'FOREIGN_UPDATE_CHANGED_ROWS');
      equal(success(await request(`/rest/v1/profiles?user_id=eq.${a.id}`,{token:a.token,method:'PATCH',headers:{Prefer:'return=representation'},body:{org_id:orgB}})), [], 'PROFILE_IDENTITY_CHANGED');
      const canonical = success(await request(`/rest/v1/profiles?user_id=eq.${a.id}&select=org_id`,{admin:true}));
      check(canonical.length === 1 && canonical[0].org_id === orgA, 'CANONICAL_PROFILE_IDENTITY_CHANGED');
      equal(await rows('pipeline_stages',a.token,`org_id=eq.${orgB}&select=id`), [], 'FOREIGN_STAGES_VISIBLE');
    });
    await record('outcome_exact_replay_is_once_and_stale_competitor_rolls_back', async () => {
      leadA = one(await rows('leads',a.token,`id=eq.${leadA.id}&select=*`));
      const outcome = randomUUID();
      const command = {p_lead_id:leadA.id,p_request_id:outcome,p_expected_updated_at:leadA.updated_at,p_outcome:'research',p_note:'Synthetic reviewed note',p_next_action:'Review synthetic source',p_due_at:'2030-02-01T00:00:00Z',p_complete_action:false};
      const changed = one(success(await rpc('fn_crm_record_outcome_v1',a.token,command)));
      // This exact replay is the test itself, not a generic uncertain-write retry.
      equal(one(success(await rpc('fn_crm_record_outcome_v1',a.token,command))).id,leadA.id,'OUTCOME_REPLAY_CHANGED_ID');
      check((await rows('lead_activities',a.token,`id=eq.${outcome}&select=id`)).length === 1,'OUTCOME_REPLAY_DUPLICATED');
      const staleId = randomUUID();
      const stale = await rpc('fn_crm_record_outcome_v1',a.token,{...command,p_request_id:staleId});
      check(!stale.ok && stale.status === 409 && stale.data?.code === 'PT409','STALE_OUTCOME_NOT_REJECTED');
      equal(success(await request(`/rest/v1/lead_activities?id=eq.${staleId}&select=id`,{admin:true})),[],'STALE_OUTCOME_LEFT_PARTIAL_ACTIVITY');
      equal(one(await rows('leads',a.token,`id=eq.${leadA.id}&select=*`)).updated_at,changed.updated_at,'STALE_OUTCOME_CHANGED_LEAD');
      denied(await rpc('fn_crm_record_outcome_v1',b.token,{...command,p_request_id:randomUUID(),p_expected_updated_at:changed.updated_at}));
    });
    await record('real_token_refresh_preserves_private_account_scope', async () => {
      const renewed = success(await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.refresh}}));
      check(renewed.user?.id === a.id && !!renewed.access_token && !!renewed.refresh_token,'REFRESH_IDENTITY_INVALID');
      a.token = renewed.access_token; a.refresh = renewed.refresh_token;
      check(success(await request('/auth/v1/user',{token:a.token})).id === a.id,'REFRESH_USER_MISMATCH');
      check((await rows('crm_contacts',a.token,`lead_id=eq.${leadA.id}&select=id`)).length === 1,'REFRESH_LOST_PRIVATE_CONTACT');
      equal(await rows('crm_contacts',a.token,`lead_id=eq.${leadB.id}&select=id`),[],'REFRESH_EXPOSED_FOREIGN_CONTACT');
    });
    await record('database_checkout_release_gate_remains_closed', async () => {
      equal(success(await request('/rest/v1/rpc/fn_billing_checkout_enabled_v1',{admin:true})),false,'CHECKOUT_DATABASE_GATE_OPEN');
    });
    const forged = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from('{"role":"service_role","exp":4102444800}').toString('base64url')}.invalid`;
    // An acknowledged function-probe failure must remain a failure, but need not
    // prevent independent ban/logout checks on this run's synthetic accounts.
    // Any uncertain request still aborts the run without further writes.
    try {
    await record('retired_worker_denies_public_and_forged_privilege', async () => {
      for (const token of ['',forged,a.token]) {
        const result = await request('/functions/v1/test-pipeline',{token,method:'POST',body:{}});
        check((result.status === 401 && result.data?.error === 'unauthorized') || (result.status === 503 && result.data?.error === 'authorization_unavailable'),'WORKER_NOT_FAIL_CLOSED');
      }
    });
    await record('retired_worker_valid_private_credential', async () => {
      const options = config.internal_worker_secret ? {token:'',headers:{'x-internal-secret':config.internal_worker_secret}} : config.legacy_service_key ? {legacyService:true} : {admin:true};
      const result = await request('/functions/v1/test-pipeline',{...options,method:'POST',body:{}});
      if (result.status === 410 && result.data?.error === 'endpoint_retired') return 'PASS';
      check(!config.internal_worker_secret && !config.legacy_service_key && ((result.status === 401 && result.data?.error === 'unauthorized') || (result.status === 503 && result.data?.error === 'authorization_unavailable')),'PRIVATE_WORKER_GUARD_UNEXPECTED');
      return 'BLOCKED_PRIVATE_CREDENTIAL_MAPPING';
    });
    await record('public_api_key_alone_does_not_authenticate_a_customer', async () => {
      const result = await request('/functions/v1/create-checkout-session',{token:'',method:'POST',body:{}});
      const layer = userAuthDenialLayer(result);
      check(layer !== null,'PUBLIC_KEY_USER_AUTH_DENIAL_REQUIRED');
      receipt.public_key_only_denial_layer = layer;
    });
    await record('hosted_gateway_rejects_forged_jwt', async () => {
      const result = await request('/functions/v1/create-checkout-session',{token:forged,method:'POST',body:{}});
      check(userAuthDenialLayer(result) === 'gateway','FORGED_JWT_GATEWAY_REJECTION_NOT_IDENTIFIED');
      receipt.forged_jwt_denial_layer = 'gateway';
    });
    await record('authenticated_checkout_stays_closed', async () => {
      const result = await request('/functions/v1/create-checkout-session',{token:a.token,method:'POST',body:{mode:'subscription',plan:'starter'}});
      if (config.checkout_expectation === 'configuration_closed') {
        check(result.status === 500 && result.data?.error === 'SERVER_MISCONFIGURED','EXPECTED_UNCONFIGURED_CHECKOUT');
        return 'BLOCKED_STRIPE_CONFIGURATION';
      }
      check(result.status === 503 && result.data?.code === 'checkout_paused','CHECKOUT_HOLD_NOT_REACHED');
    });
    await record('communications_handler_hold_precedes_any_recipient_or_provider', async () => {
      const result = await request('/functions/v1/send-sms-threaded',{token:a.token,method:'POST',body:{}});
      check(result.status === 503 && result.data?.error === 'communications_held','COMMUNICATIONS_HOLD_NOT_REACHED');
    });
    } catch (error) {
      if (!(error instanceof HarnessError) || error.uncertain) throw error;
      receipt.checks.push({name:current,status:'FAIL',code:error.code});
      receipt.remaining_function_probes = 'NOT_RUN_AFTER_ACKNOWLEDGED_FAILURE';
      await write(receipt);
    }
    await record('admin_ban_fences_existing_synthetic_user_token', async () => {
      success(await request(`/auth/v1/admin/users/${b.id}`,{admin:true,method:'PUT',body:{ban_duration:'1h'}}));
      equal(success(await rpc('fn_customer_workspace_ready_v1',b.token)),false,'BANNED_WORKSPACE_READY');
      equal(await rows('pipeline_stages',b.token),[],'BANNED_STAGES_VISIBLE');
      equal(await rows('crm_contacts',b.token,`lead_id=eq.${leadB.id}&select=id`),[],'BANNED_PRIVATE_CONTACT_VISIBLE');
      denied(await rpc('fn_crm_record_outcome_v1',b.token,{p_lead_id:leadB.id,p_request_id:randomUUID(),p_expected_updated_at:leadB.updated_at,p_outcome:'research',p_note:'Synthetic denied',p_next_action:null,p_due_at:null,p_complete_action:false}));
    });
    await record('logout_revokes_refresh_without_claiming_immediate_jwt_revocation', async () => {
      success(await request('/auth/v1/logout?scope=global',{token:a.token,method:'POST'}));
      const refreshed = await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:a.refresh}});
      check(!refreshed.ok && [400,401,403].includes(refreshed.status) && ['refresh_token_not_found','refresh_token_already_used','session_not_found'].includes(refreshed.data?.error_code),'LOGOUT_DID_NOT_REVOKE_REFRESH');
      const existing = await rpc('fn_customer_workspace_ready_v1',a.token);
      receipt.post_logout_access_token_workspace_ready = existing.ok ? existing.data === true : null;
      receipt.post_logout_access_token_http_status = existing.status;
    });
    receipt.status = receipt.checks.some(item => item.status === 'FAIL') ? 'FAIL' : receipt.checks.every(item => item.status === 'PASS') ? 'PASS_BOUNDED_HTTP_SCOPE' : 'PARTIAL';
    receipt.hosted_auth_rls_crm_ban_checks_passed = true;
  } catch (error) {
    receipt.status = error instanceof HarnessError && error.uncertain ? 'UNCERTAIN' : 'FAIL';
    receipt.checks.push({name:current,status:receipt.status,code:error instanceof HarnessError ? error.code : 'CHECK_FAILED'});
    // Do not log assertion objects: they may hold returned identities or secrets.
  } finally {
    delete receipt.current_check;
    receipt.finished_at = new Date().toISOString();
    receipt.fixture_cleanup = 'Retained for private review; no automatic deletion or resend/retry';
    await write(receipt);
  }
  return receipt;
}

test('isolated hosted Supabase HTTP acceptance (explicit private opt-in)', {skip:process.env.SNAP_HOSTED_HTTP_RUN !== '1'}, async () => {
  let receipt;
  try {
    const config = await loadConfig(process.env.SNAP_HOSTED_HTTP_CONFIG_FILE);
    receipt = await runHostedAcceptance(config);
  } catch { throw new HarnessError('HOSTED_HTTP_SETUP_OR_RECEIPT_FAILED'); }
  check(!['FAIL','UNCERTAIN'].includes(receipt.status),'HOSTED_HTTP_CHECKS_FAILED_SEE_PRIVATE_RECEIPT');
  console.log(`Hosted HTTP result: ${receipt.status}; inspect the private receipt for scope and blockers.`);
});
