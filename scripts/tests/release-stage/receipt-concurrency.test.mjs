import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {requireReceiptDatabase,bootstrapReceiptDatabase,receiptSqlSha256} from './receipt-native-fixture.mjs';
import {syntheticSnapshot,sha,register,grant,asRole,newUser} from '../release-hosted-source/fixture.mjs';

// Never accepts a hosted database, credentials file, source archive or real user.
const connectionString=requireReceiptDatabase(process.env.SNAP_RECEIPT_DATABASE_URL);
const {Client,types}=createRequire(import.meta.url)('pg');
types.setTypeParser(1114,value=>value);
types.setTypeParser(1184,value=>value); // Keep native timestamp precision in preservation assertions.
const id=n=>`88888888-8888-4888-8888-${String(n).padStart(12,'0')}`;
const adapter=c=>({query:(...args)=>c.query(...args),exec:sql=>c.query(sql)});
const evidence={kind:'native_postgresql_receipt_source_concurrency',status:'RUNNING',source_sql_sha256:receiptSqlSha256,
  synthetic_only:true,managed_auth_verified:false,hosted_http_verified:false,production_writes:0,checks:[]};
const rpc=async(c,name,args=[])=>(await c.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) result`,args)).rows[0].result;

test('native receipt sessions serialize handoff, reads, revocation and post-wait authority',async t=>{
  const clients=[];
  try {
    for(let i=0;i<3;i++) {
      const c=new Client({connectionString});await c.connect();clients.push(c);
      await c.query("SET statement_timeout='15s';SET search_path=public,extensions;SET TIME ZONE 'UTC'");
    }
    const [setup,first,second]=clients,db=adapter(setup);
    const version=(await setup.query("SELECT current_setting('server_version') version,current_setting('transaction_isolation') isolation")).rows[0];
    assert.match(version.version,/^17\.6(?:\D|$)/);assert.equal(version.isolation,'read committed');
    evidence.version=version.version;evidence.isolation=version.isolation;
    const locale=(await setup.query(`SELECT datlocprovider::text provider,datlocale locale,datcollate collate,datctype ctype,
      datcollversion version FROM pg_database WHERE datname=current_database()`)).rows[0];
    assert.equal(locale.provider,'i');assert.equal(locale.locale,'en-US');
    assert.equal(locale.collate,'en_US.UTF-8');assert.equal(locale.ctype,'en_US.UTF-8');
    assert.deepEqual((await setup.query("SELECT array_agg(k ORDER BY k) keys FROM unnest(ARRAY['source_rows','source_row_sha256']) k")).rows[0].keys,
      ['source_row_sha256','source_rows'],'Exact receipt JSON-key ordering must match the inspected hosted database');
    evidence.database_locale=locale;
    const pids=await Promise.all(clients.map(async c=>(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid));
    assert.equal(new Set(pids).size,3);evidence.distinct_backend_sessions=pids.length;
    await bootstrapReceiptDatabase(db);
    const operator=id(1),customer=id(2),foreign=id(3);
    await newUser(db,operator);const org=await newUser(db,customer);await newUser(db,foreign);
    const stage=(await setup.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order,id LIMIT 1',[org])).rows[0].id;
    let next=1000,scopeIndex=0;
    const fresh=()=>id(next++);
    const asUser=(user,fn)=>asRole(db,'authenticated',user,fn);
    const detail=(c,lead)=>rpc(c,'fn_get_receipt_case_crm_detail_v1',[lead]);
    const handoff=(c,s,request=s.request)=>rpc(c,'fn_handoff_receipt_case_to_crm_v1',[request,s.acceptance,s.scope.records[0].source_property_key,stage]);
    const revoke=(c,s,kind='acceptance')=>rpc(c,'fn_revoke_receipt_case_decision_v1',[s.revoke,s.scope.snapshot.id,kind,
      kind==='grant'?s.grant:s.acceptance,sha('Synthetic native revocation proof')]);
    async function scenario({shortExpiry=false}={}) {
      const n=++scopeIndex;
      const scope=syntheticSnapshot({seed:2000+n*10,addresses:[`100 Native Race ${n} Way`,`100 Native Race ${n} Way Suite 2`,`100 Native Race ${n} Way Suite 3`]});
      for(const [i,row] of scope.records.entries()) {
        row.case_id=`E00-${String(n*10+i).padStart(5,'0')}`;
        row.record_key=sha(JSON.stringify([scope.snapshot.agency_key,'case',row.case_id]));
        row.version_id=sha(row.record_key+scope.snapshot.original_sha256+row.source_row_sha256+row.cleaning_rule_version);
      }
      scope.snapshot.selection_sha256=sha([...scope.records].sort((a,b)=>a.record_key.localeCompare(b.record_key)).map(r=>r.version_id).join('\n'));
      await register(db,scope);
      const s={scope,grant:fresh(),review:fresh(),acceptance:fresh(),request:fresh(),revoke:fresh()};
      await grant(db,{grantId:s.grant,snapshotId:scope.snapshot.id,operator});
      await asUser(operator,async()=>{
        await rpc(setup,'fn_review_receipt_case_snapshot_v1',[s.review,scope.snapshot.id,scope.snapshot.selection_sha256,'reviewed',sha('Synthetic native review')]);
        s.until=(await setup.query(`SELECT clock_timestamp()+interval '${shortExpiry?'3 seconds':'1 hour'}' deadline`)).rows[0].deadline;
        await rpc(setup,'fn_accept_receipt_case_snapshot_v1',[s.acceptance,s.review,customer,'crm',s.until,sha('Synthetic native acceptance')]);
      });
      return s;
    }
    async function begin(c,actor) {
      await c.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      await c.query(`SET LOCAL ROLE ${actor?'authenticated':'postgres'}`);
      await c.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor??'']);
    }
    async function observeBlocked(mode) {
      for(let i=0;i<120;i++) {
        const row=(await setup.query(`SELECT pg_blocking_pids($1) blockers,
          EXISTS(SELECT 1 FROM pg_locks WHERE pid=$1 AND locktype='advisory' AND NOT granted
           AND classid=810208::oid AND objid=1::oid AND mode=$2) source_wait`,[pids[2],mode])).rows[0];
        if(row.blockers.includes(pids[1])&&row.source_wait)return;
        await delay(25);
      }
      assert.fail('Expected independent PostgreSQL source advisory-lock wait was not observed');
    }
    async function race({name,firstActor,secondActor,mode='ExclusiveLock',firstAction,secondAction,whileBlocked,verify}) {
      let waiting;
      await begin(first,firstActor);await begin(second,secondActor);
      try {
        const initial=await firstAction(first);
        waiting=secondAction(second).then(value=>({value}),error=>({error}));
        await observeBlocked(mode);
        if(whileBlocked)await whileBlocked();
        await first.query('COMMIT');
        const later=await waiting;
        await second.query(later.error?'ROLLBACK':'COMMIT');
        await verify(initial,later);
        evidence.checks.push({name,distinct_sessions:true,blocking_observed:true,wait_mode:mode,result:'PASS'});
      } finally {
        await first.query('ROLLBACK').catch(()=>{});
        if(waiting)await waiting;
        await second.query('ROLLBACK').catch(()=>{});
      }
    }
    async function counts(s) {
      return (await setup.query(`SELECT (SELECT count(*)::int FROM snap_receipt.crm_links WHERE acceptance_id=$1) links,
        (SELECT count(*)::int FROM public.leads l JOIN snap_receipt.property_mappings m ON m.property_id=l.property_id
         WHERE m.source_property_key=$2 AND l.org_id=$3) leads,
        (SELECT count(*)::int FROM public.lead_activities a JOIN snap_receipt.crm_links x ON x.activity_id=a.id WHERE x.acceptance_id=$1) annotations`,
      [s.acceptance,s.scope.records[0].source_property_key,org])).rows[0];
    }
    async function savedWork(s) {
      const receipt=await asUser(customer,()=>handoff(setup,s));s.lead=receipt.lead_id;s.annotation=receipt.activity_id;
      await asUser(customer,async()=>{
        await setup.query("UPDATE public.leads SET title='Synthetic private title',notes='Synthetic private work',contact_restricted=true,estimated_value=100000 WHERE id=$1",[s.lead]);
        await setup.query("INSERT INTO public.crm_contacts(lead_id,org_id,name,source,do_not_contact) VALUES($1,$2,'Synthetic contact','Private manual fixture',true)",[s.lead,org]);
        await setup.query("INSERT INTO public.lead_activities(lead_id,org_id,actor_id,activity_type,payload) VALUES($1,$2,$3,'note','{\"note\":\"Synthetic private note\"}')",[s.lead,org,customer]);
      });
      s.private=await privateRows(s,customer);
    }
    async function privateRows(s,actor) {
      return asUser(actor,async()=>(await setup.query(`SELECT jsonb_build_object(
        'lead',(SELECT to_jsonb(l) FROM public.leads l WHERE id=$1),
        'contacts',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY id),'[]') FROM public.crm_contacts c WHERE lead_id=$1),
        'notes',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]') FROM public.lead_activities a WHERE lead_id=$1 AND activity_type='note')) result`,[s.lead])).rows[0].result);
    }
    async function heldAndPreserved(s) {
      assert.deepEqual(await privateRows(s,customer),s.private,'Revocation changed customer-owned work');
      assert.deepEqual(await privateRows(s,foreign),{lead:null,contacts:[],notes:[]});
      await asUser(customer,async()=>{
        await assert.rejects(()=>detail(setup,s.lead),e=>e.code==='42501');
        await assert.rejects(()=>handoff(setup,s),e=>e.code==='42501');
        assert.equal((await setup.query('SELECT count(*)::int n FROM public.lead_activities WHERE id=$1',[s.annotation])).rows[0].n,0);
        assert.equal((await setup.query('SELECT count(*)::int n FROM public.properties')).rows[0].n,0);
        await setup.query("UPDATE public.crm_contacts SET source='Private update after source revocation' WHERE lead_id=$1",[s.lead]);
        assert.equal((await setup.query('SELECT source FROM public.crm_contacts WHERE lead_id=$1',[s.lead])).rows[0].source,'Private update after source revocation');
      });
    }

    for(const sameRequest of [true,false])await t.test(sameRequest?'concurrent exact handoff appends once':'concurrent distinct commands for the same accepted property share one receipt',async()=>{
      const s=await scenario(),secondRequest=sameRequest?s.request:fresh();
      await race({name:sameRequest?'same_command_handoff':'same_property_distinct_commands',firstActor:customer,secondActor:customer,
        firstAction:c=>handoff(c,s),secondAction:c=>handoff(c,s,secondRequest),verify:async(a,b)=>{
          assert.ifError(b.error);assert.equal(a.created,true);assert.equal(b.value.replayed,true);
          for(const field of ['lead_id','activity_id','source_link_id'])assert.equal(b.value[field],a[field]);
          assert.deepEqual(await counts(s),{links:1,leads:1,annotations:1});
        }});
    });
    await t.test('an authorized reader finishes before queued revocation; subsequent access is terminally denied',async()=>{
      const s=await scenario();await savedWork(s);
      await race({name:'reader_precedes_revocation',firstActor:customer,secondActor:operator,
        firstAction:c=>detail(c,s.lead),secondAction:c=>revoke(c,s),verify:async(a,b)=>{
          assert.equal(a.snapshot.acceptance_id,s.acceptance);assert.ifError(b.error);assert.equal(b.value.revocation_id,s.revoke);
          await heldAndPreserved(s);
        }});
    });
    await t.test('reader waiting behind revocation rechecks fresh committed authority',async()=>{
      const s=await scenario();await savedWork(s);
      await race({name:'revocation_precedes_reader',firstActor:operator,secondActor:customer,mode:'ShareLock',
        firstAction:c=>revoke(c,s),secondAction:c=>detail(c,s.lead),verify:async(_a,b)=>{
          assert.equal(b.error?.code,'42501');assert.equal(b.value,undefined);await heldAndPreserved(s);
        }});
    });
    await t.test('new handoff waiting behind revocation creates no lead, annotation or receipt',async()=>{
      const s=await scenario();
      await race({name:'revocation_precedes_handoff',firstActor:operator,secondActor:customer,
        firstAction:c=>revoke(c,s),secondAction:c=>handoff(c,s),verify:async(_a,b)=>{
          assert.equal(b.error?.code,'42501');assert.deepEqual(await counts(s),{links:0,leads:0,annotations:0});
        }});
    });
    await t.test('blocked handoff rejects a consumer banned by a third session before release',async()=>{
      const s=await scenario();
      try {
        await race({name:'consumer_banned_after_precheck',secondActor:customer,
          firstAction:c=>c.query('SELECT pg_advisory_xact_lock(810208,1)'),secondAction:c=>handoff(c,s),
          whileBlocked:()=>setup.query("UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1",[customer]),
          verify:async(_a,b)=>{assert.equal(b.error?.code,'42501');assert.deepEqual(await counts(s),{links:0,leads:0,annotations:0});}});
      } finally {await setup.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[customer]);}
    });
    await t.test('blocked manager rejects an operator banned after its initial authorization check',async()=>{
      const s=await scenario(),command=fresh();
      try {
        await race({name:'operator_banned_after_precheck',secondActor:operator,
          firstAction:c=>c.query('SELECT pg_advisory_xact_lock(810208,1)'),
          secondAction:c=>rpc(c,'fn_review_receipt_case_snapshot_v1',[command,s.scope.snapshot.id,s.scope.snapshot.selection_sha256,'held',sha('Synthetic queued review')]),
          whileBlocked:()=>setup.query("UPDATE auth.users SET banned_until=clock_timestamp()+interval '1 day' WHERE id=$1",[operator]),
          verify:async(_a,b)=>{assert.equal(b.error?.code,'42501');assert.equal((await setup.query('SELECT count(*)::int n FROM snap_receipt.reviews WHERE id=$1',[command])).rows[0].n,0);}});
      } finally {await setup.query('UPDATE auth.users SET banned_until=NULL WHERE id=$1',[operator]);}
    });
    await t.test('reader queued behind original grant revocation cannot use the earlier acceptance',async()=>{
      const s=await scenario();await savedWork(s);
      await race({name:'grant_revocation_precedes_reader',firstActor:operator,secondActor:customer,mode:'ShareLock',
        firstAction:c=>revoke(c,s,'grant'),secondAction:c=>detail(c,s.lead),verify:async(_a,b)=>{
          assert.equal(b.error?.code,'42501');await heldAndPreserved(s);
        }});
    });
    await t.test('handoff waiting across the real database expiry creates nothing',async()=>{
      const s=await scenario({shortExpiry:true});
      await race({name:'acceptance_expires_while_waiting',secondActor:customer,
        firstAction:c=>c.query('SELECT pg_advisory_xact_lock(810208,1)'),secondAction:c=>handoff(c,s),
        whileBlocked:async()=>{
          assert.equal((await setup.query('SELECT clock_timestamp()<$1::timestamptz unexpired',[s.until])).rows[0].unexpired,true,
            'Acceptance must still be valid after its handoff is observed waiting');
          for(let i=0;i<240;i++) {
            if((await setup.query('SELECT clock_timestamp()>=$1::timestamptz expired',[s.until])).rows[0].expired)return;
            await delay(25);
          }
          assert.fail('Database acceptance deadline did not elapse within the bounded wait');
        },verify:async(_a,b)=>{assert.equal(b.error?.code,'42501');assert.deepEqual(await counts(s),{links:0,leads:0,annotations:0});}});
    });
    await t.test('repeatable-read transactions cannot reuse a stale source snapshot',async()=>{
      const s=await scenario();
      await second.query('BEGIN ISOLATION LEVEL REPEATABLE READ;SET LOCAL ROLE authenticated');
      try {
        await second.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[customer]);
        await assert.rejects(()=>rpc(second,'fn_list_receipt_case_properties_v1',[s.acceptance,25,0]),e=>e.code==='42501');
      } finally {await second.query('ROLLBACK');}
      evidence.checks.push({name:'stale_isolation_denied',distinct_sessions:true,blocking_observed:false,result:'PASS'});
    });
    assert.equal(evidence.checks.length,10);assert.equal(evidence.checks.filter(c=>c.blocking_observed).length,9);
    evidence.status='PASS';
  } catch(error) {evidence.status='FAIL';throw error;}
  finally {
    if(evidence.status==='RUNNING')evidence.status='FAIL';
    for(const c of clients)await c.query('ROLLBACK').catch(()=>{});
    await Promise.all(clients.map(c=>c.end().catch(()=>{})));
    await writeFile(process.env.SNAP_RECEIPT_NATIVE_RECEIPT??'native-receipt-source-receipt.json',JSON.stringify(evidence,null,2)+'\n');
  }
});
