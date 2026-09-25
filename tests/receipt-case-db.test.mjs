import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {createReceiptDb,asRole,newUser,id,sha,syntheticSnapshot,register,grant,reviewAndAccept} from '../scripts/tests/release-hosted-source/fixture.mjs';
import {parseReceiptCaseDetail} from '../src/services/receiptCaseContract.ts';

// Actual PostgreSQL semantics in PGlite, with local Auth test doubles. This does
// not establish GoTrue, hosted HTTP, real municipal evidence or human approval.
const denied = action => assert.rejects(action, error => error.code === '42501');
const conflict = action => assert.rejects(action, error => error.code === '22023');
const invalid = action => assert.rejects(action, error => /^(22|23)/.test(error.code ?? ''));
const rpc = async (db,name,args=[]) => (await db.query(`SELECT public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) value`,args)).rows[0].value;
const scalar = async (db,sql,args=[]) => (await db.query(sql,args)).rows[0].value;
const selection = scope => {
  scope.snapshot.selection_sha256=sha([...scope.records].sort((a,b)=>a.record_key.localeCompare(b.record_key)).map(row=>row.version_id).join('\n'));
  return scope;
};
const rebind = (scope,row) => {
  row.record_key=sha(JSON.stringify([scope.snapshot.agency_key,'case',row.case_id]));
  row.version_id=sha(row.record_key+scope.snapshot.original_sha256+row.source_row_sha256+row.cleaning_rule_version);
  row.source_property_key=sha([scope.snapshot.agency_key,row.source_parcel_reference,row.address.trim().replace(/\s+/g,' ').toUpperCase()].join('\x1f'));
  return selection(scope);
};

test('receipt case adapter: synthetic PostgreSQL authorization, lineage and private CRM preservation',async t=>{
  const db=await createReceiptDb();
  t.after(()=>db.close());
  const operator=id(1),a=id(2),b=id(3);
  const orgO=await newUser(db,operator),orgA=await newUser(db,a),orgB=await newUser(db,b);
  const auth=(actor,fn)=>asRole(db,'authenticated',actor,fn);
  const stages=async org=>(await db.query('SELECT id FROM public.pipeline_stages WHERE org_id=$1 ORDER BY sort_order,id',[org])).rows.map(row=>row.id);
  const stageA=await stages(orgA),stageB=await stages(orgB);
  let nextId=10000;
  const freshId=()=>id(nextId++);
  const scope=syntheticSnapshot();
  const grantId=id(20),reviewId=id(30),acceptanceId=id(31),requestId=id(40);
  const until=new Date(Date.now()+3600000).toISOString();
  const proof=sha('Synthetic bounded CRM acceptance proof');
  let first,firstProperty,privateBefore,refresh,refreshAcceptance,refreshLink;

  const counts=async()=>scalar(db,`SELECT jsonb_build_object(
    'snapshots',(SELECT count(*) FROM snap_receipt.snapshots),
    'records',(SELECT count(*) FROM snap_receipt.records),
    'mappings',(SELECT count(*) FROM snap_receipt.property_mappings),
    'properties',(SELECT count(*) FROM public.properties),
    'leads',(SELECT count(*) FROM public.leads),
    'links',(SELECT count(*) FROM snap_receipt.crm_links),
    'activities',(SELECT count(*) FROM public.lead_activities)) value`);
  const handoff=(accept,key,request=freshId(),stage=stageA[0])=>rpc(db,'fn_handoff_receipt_case_to_crm_v1',[request,accept,key,stage]);
  const detail=lead=>rpc(db,'fn_get_receipt_case_crm_detail_v1',[lead]);
  const list=accept=>rpc(db,'fn_list_receipt_case_properties_v1',[accept,25,0]);
  const readPrivate=lead=>scalar(db,`SELECT jsonb_build_object(
    'lead',(SELECT to_jsonb(l) FROM public.leads l WHERE id=$1),
    'contacts',(SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY c.id),'[]') FROM public.crm_contacts c WHERE lead_id=$1),
    'activities',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM public.lead_activities x WHERE lead_id=$1 AND activity_type IN ('note','task'))) value`,[lead]);
  const revoke=(snapshot,kind,target,command=freshId())=>auth(operator,()=>rpc(db,'fn_revoke_receipt_case_decision_v1',[command,snapshot,kind,target,sha('Synthetic revocation proof')]));

  await t.test('ordinary local users receive separate private workspaces and no admin elevation',async()=>{
    assert.equal(new Set([orgO,orgA,orgB]).size,3);
    assert.ok(stageA.length>1&&stageB.length>1);
    assert.deepEqual((await db.query('SELECT DISTINCT role::text role FROM public.user_roles WHERE user_id=ANY($1) ORDER BY role',[[operator,a,b]])).rows,[{role:'user'}]);
    assert.equal(await scalar(db,'SELECT public.fn_billing_checkout_enabled_v1() value'),false);
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.user_subscriptions'),0);
  });

  await t.test('root registration preserves all three full-address identities sharing one parcel and leaves customers held',async()=>{
    assert.equal(await register(db,scope),scope.snapshot.id);
    assert.equal(await scalar(db,'SELECT count(DISTINCT source_parcel_reference)::int value FROM snap_receipt.records'),1);
    assert.equal(await scalar(db,'SELECT count(DISTINCT source_property_key)::int value FROM snap_receipt.records'),3);
    assert.equal(await scalar(db,'SELECT count(DISTINCT property_id)::int value FROM snap_receipt.property_mappings'),3);
    firstProperty=await scalar(db,'SELECT property_id value FROM snap_receipt.property_mappings WHERE source_property_key=$1',[scope.records[0].source_property_key]);
    for(const actor of [operator,a,b])await auth(actor,async()=>{
      assert.deepEqual((await rpc(db,'fn_my_receipt_case_acceptances_v1')).acceptances,[]);
      assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.properties'),0);
      await denied(()=>rpc(db,'fn_owner_receipt_case_snapshot_v1',[scope.snapshot.id]));
      await denied(()=>list(acceptanceId));
      await denied(()=>handoff(acceptanceId,scope.records[0].source_property_key));
      await denied(()=>rpc(db,'fn_crm_add_property_v1',[firstProperty]));
    });
    const before=await counts();
    await invalid(()=>register(db,scope));
    assert.deepEqual(await counts(),before);
  });

  await t.test('anon, authenticated and service roles cannot directly read/import/grant private source data',async()=>{
    const tables=['snapshots','records','property_mappings','authority_grants','reviews','acceptances','revocations','crm_links'];
    for(const role of ['anon','authenticated','service_role'])await asRole(db,role,role==='authenticated'?a:null,async()=>{
      for(const table of tables)await denied(()=>db.query(`SELECT * FROM snap_receipt.${table}`));
      await denied(()=>register(db,syntheticSnapshot({seed:200})));
      await denied(()=>grant(db,{grantId:freshId(),snapshotId:scope.snapshot.id,operator:a}));
      await denied(()=>db.query('TRUNCATE snap_receipt.records'));
      if(role!=='authenticated')await denied(()=>rpc(db,'fn_my_receipt_case_acceptances_v1'));
    });
  });

  await t.test('invalid imports fail atomically, including a bad late record after valid earlier inserts',async t=>{
    const mutations=[
      ['row-pair alignment',s=>{s.records[2].source_rows=[5,6];}],
      ['row-pair gap',s=>{s.records[2].source_rows=[8,10];}],
      ['row outside original',s=>{s.records[2].source_rows=[100,101];}],
      ['overlapping row pair',s=>{s.records[2].source_rows=[6,7];}],
      ['duplicate record',s=>{s.records[2]=structuredClone(s.records[1]);selection(s);}],
      ['raw description',s=>{s.records[2].cleaned_description='Unreviewed synthetic narrative';s.records[2].cleaned_sha256=sha(JSON.stringify(s.records[2].cleaned_description));}],
      ['description hash',s=>{s.records[2].cleaned_sha256=sha('wrong synthetic description');}],
      ['record identity hash',s=>{s.records[2].record_key=sha('wrong synthetic identity');selection(s);}],
      ['version hash',s=>{s.records[2].version_id=sha('wrong synthetic version');selection(s);}],
      ['property hash',s=>{s.records[2].source_property_key=sha('wrong synthetic property');}],
      ['selection hash',s=>{s.snapshot.selection_sha256=sha('wrong synthetic selection');}],
      ['original count',s=>{s.snapshot.original_count+=1;}],
      ['reviewed count',s=>{s.snapshot.reviewed_count-=1;s.snapshot.held_count+=1;}],
      ['unexpected field',s=>{s.records[2].government_violation_id='invented';}],
      ['invalid calendar day',s=>{s.records[2].filed_date='2026-02-30';}],
      ['closed before filed',s=>{s.records[2].closed_date='2026-08-01';}],
      ['case moved to another property',s=>{s.records[2].address='200 Different Synthetic Street';rebind(s,s.records[2]);}],
      ['evidence kind crossed without parent',s=>{s.snapshot.evidence_kind='original_backed';s.snapshot.parent_snapshot_id=null;}],
    ];
    for(const [label,mutate] of mutations)await t.test(label,async()=>{
      const candidate=syntheticSnapshot({seed:1000,report:'2026-08-11',parent:scope.snapshot.id});
      mutate(candidate);const before=await counts();
      await invalid(()=>register(db,candidate));
      assert.deepEqual(await counts(),before);
    });
  });

  await t.test('scoped ordinary operator explicitly reviews and accepts A only, with exact command retry',async()=>{
    await grant(db,{grantId,snapshotId:scope.snapshot.id,operator});
    await auth(operator,async()=>{
      const summary=await rpc(db,'fn_owner_receipt_case_snapshot_v1',[scope.snapshot.id]);
      assert.equal(summary.review_method,'agent_original_crosscheck');
      assert.equal(summary.evidence_kind,'synthetic');
      assert.equal(summary.property_count,3);
      assert.deepEqual((await rpc(db,'fn_my_receipt_case_acceptances_v1')).acceptances,[]);
      await conflict(()=>rpc(db,'fn_review_receipt_case_snapshot_v1',[reviewId,scope.snapshot.id,sha('wrong selection'),'reviewed',sha('Synthetic review proof')]));
    });
    await reviewAndAccept(db,{scope,operator,consumer:a,reviewId,acceptanceId,until});
    await auth(operator,async()=>{
      assert.equal((await rpc(db,'fn_review_receipt_case_snapshot_v1',[reviewId,scope.snapshot.id,scope.snapshot.selection_sha256,'reviewed',sha('Synthetic review proof')])).replayed,true);
      assert.equal((await rpc(db,'fn_accept_receipt_case_snapshot_v1',[acceptanceId,reviewId,a,'crm',until,proof])).replayed,true);
      await conflict(()=>rpc(db,'fn_review_receipt_case_snapshot_v1',[reviewId,scope.snapshot.id,scope.snapshot.selection_sha256,'held',sha('Synthetic review proof')]));
      await conflict(()=>rpc(db,'fn_accept_receipt_case_snapshot_v1',[acceptanceId,reviewId,b,'crm',until,proof]));
      await denied(()=>rpc(db,'fn_accept_receipt_case_snapshot_v1',[freshId(),reviewId,a,'customer_export',until,proof]));
      await denied(()=>list(acceptanceId));
    });
    for(const actor of [a,b])await auth(actor,async()=>{
      await denied(()=>rpc(db,'fn_review_receipt_case_snapshot_v1',[freshId(),scope.snapshot.id,scope.snapshot.selection_sha256,'reviewed',sha('self review')]));
      await denied(()=>rpc(db,'fn_accept_receipt_case_snapshot_v1',[freshId(),reviewId,actor,'crm',until,proof]));
      await denied(()=>rpc(db,'fn_revoke_receipt_case_decision_v1',[freshId(),scope.snapshot.id,'snapshot',scope.snapshot.id,sha('self revoke')]));
    });
    await auth(a,async()=>{
      assert.equal((await rpc(db,'fn_my_receipt_case_acceptances_v1')).acceptances[0].acceptance_id,acceptanceId);
      const page=await list(acceptanceId);
      assert.equal(page.total,3);assert.equal(page.properties.length,3);assert.ok(page.properties.every(p=>p.existing_lead_id===null));
      assert.equal(new Set(page.properties.map(p=>p.property_id)).size,3);
      assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.properties'),0,'active receipt facts stay out of generic property tables and caches');
      const firstPage=await rpc(db,'fn_list_receipt_case_properties_v1',[acceptanceId,2,0]);
      const lastPage=await rpc(db,'fn_list_receipt_case_properties_v1',[acceptanceId,2,2]);
      assert.equal(new Set([...firstPage.properties,...lastPage.properties].map(p=>p.source_property_key)).size,3);
      await denied(()=>rpc(db,'fn_crm_add_property_v1',[firstProperty]));
    });
    await auth(b,async()=>{
      assert.deepEqual((await rpc(db,'fn_my_receipt_case_acceptances_v1')).acceptances,[]);
      await denied(()=>list(acceptanceId));
      assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.properties'),0);
    });
  });

  await t.test('handoff is caller/stage scoped, exact retries create one annotation, and the frozen DTO parses',async()=>{
    await auth(b,()=>denied(()=>handoff(acceptanceId,scope.records[0].source_property_key,requestId,stageB[0])));
    await auth(a,async()=>{
      await denied(()=>handoff(acceptanceId,scope.records[0].source_property_key,requestId,stageB[0]));
      await denied(()=>handoff(acceptanceId,sha('outside accepted selection'),requestId));
      first=await handoff(acceptanceId,scope.records[0].source_property_key,requestId);
      assert.equal(first.created,true);assert.equal(first.replayed,false);
      const replay=await handoff(acceptanceId,scope.records[0].source_property_key,requestId);
      assert.equal(replay.lead_id,first.lead_id);assert.equal(replay.activity_id,first.activity_id);assert.equal(replay.replayed,true);
      const otherRequest=await handoff(acceptanceId,scope.records[0].source_property_key);
      assert.equal(otherRequest.source_link_id,requestId);
      await conflict(()=>handoff(acceptanceId,scope.records[0].source_property_key,requestId,stageA[1]));
      await conflict(()=>handoff(acceptanceId,scope.records[1].source_property_key,requestId));
      const parsed=await parseReceiptCaseDetail(await detail(first.lead_id));
      assert.equal(parsed.property.id,firstProperty);assert.equal(parsed.cases.length,1);
      assert.equal((await list(acceptanceId)).properties.find(p=>p.property_id===firstProperty).existing_lead_id,first.lead_id);
      assert.equal(parsed.snapshot.snapshot_id,scope.snapshot.id);
      assert.equal(parsed.snapshot.acceptance_id,acceptanceId);
      assert.equal(Date.parse(parsed.snapshot.valid_until),Date.parse(until));
      assert.equal(parsed.snapshot.evidence_kind,'synthetic');
      assert.equal(parsed.snapshot.original_count,5);assert.equal(parsed.snapshot.reviewed_count,3);assert.equal(parsed.snapshot.held_count,2);
      assert.deepEqual(parsed.cases[0].citation.source_rows,[4,5]);
      assert.equal(parsed.cases[0].citation.original_sha256,scope.snapshot.original_sha256);
      assert.equal(Object.hasOwn(parsed.cases[0],'source_original_text'),false);
      await denied(()=>rpc(db,'fn_get_source_crm_detail_v1',[first.lead_id]));
    });
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM snap_receipt.crm_links'),1);
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.lead_activities'),1);
    await auth(b,async()=>{
      await denied(()=>detail(first.lead_id));
      for(const table of ['leads','lead_activities','crm_contacts'])assert.equal(await scalar(db,`SELECT count(*)::int value FROM public.${table}`),0);
    });
  });

  await t.test('customer private notes, tasks, contacts/DNC, workflow and financial fields stay mutable without reparenting source data',async()=>{
    await auth(a,async()=>{
      await db.query(`UPDATE public.leads SET title='Synthetic private negotiation',stage_id=$2,priority=3,notes='Private synthetic notes',
        next_action='Call only after permission',next_follow_up_at='2026-09-01T12:00:00Z',last_contacted_at='2026-08-11T12:00:00Z',
        estimated_value=250000,estimated_repairs=15000,offer_amount=200000,contract_deadline='2026-09-15',contact_restricted=true WHERE id=$1`,[first.lead_id,stageA[1]]);
      await db.query(`INSERT INTO public.lead_activities(id,lead_id,org_id,actor_id,activity_type,payload) VALUES
        ($1,$3,$4,$5,'note','{"note":"Synthetic private follow-up note"}'),
        ($2,$3,$4,$5,'task','{"description":"Synthetic customer task","completed":false}')`,[id(50),id(51),first.lead_id,orgA,a]);
      await db.query(`INSERT INTO public.crm_contacts(id,lead_id,org_id,name,relationship,email,source,do_not_contact,restriction_note)
        VALUES($1,$2,$3,'Synthetic private contact','other','fixture@example.invalid','Manual test relationship',true,'Synthetic restriction')`,[id(52),first.lead_id,orgA]);
      await denied(()=>db.query('UPDATE public.leads SET org_id=$2 WHERE id=$1',[first.lead_id,orgB]));
      await denied(()=>db.query('UPDATE public.leads SET created_by=$2 WHERE id=$1',[first.lead_id,b]));
      assert.deepEqual((await db.query('UPDATE public.lead_activities SET payload=$2 WHERE id=$1 RETURNING id',[first.activity_id,'{}'])).rows,[]);
      await denied(()=>db.query('DELETE FROM public.leads WHERE id=$1',[first.lead_id]));
      assert.equal((await list(acceptanceId)).properties.find(p=>p.property_id===firstProperty).existing_lead_id,first.lead_id,'a changed private stage does not break reopening the exact accepted handoff');
      privateBefore=await readPrivate(first.lead_id);
      assert.equal(privateBefore.contacts[0].do_not_contact,true);
    });
    await denied(()=>db.query('UPDATE public.properties SET address=$2 WHERE id=$1',[firstProperty,'999 Synthetic Changed Street']));
    await denied(()=>db.query('DELETE FROM public.properties WHERE id=$1',[firstProperty]));
    await denied(()=>db.query("UPDATE public.lead_activities SET payload='{}' WHERE id=$1",[first.activity_id]));
    for(const statement of ['UPDATE snap_receipt.records SET category=category','DELETE FROM snap_receipt.records','TRUNCATE snap_receipt.crm_links']) {
      await assert.rejects(()=>db.query(statement),error=>error.code==='55000');
    }
  });

  await t.test('a separately labeled synthetic parent refresh reuses property/lead and appends only a source annotation',async()=>{
    refresh=syntheticSnapshot({seed:200,report:'2026-08-12',parent:scope.snapshot.id,status:'CANCELLED'});
    await register(db,refresh);
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM snap_receipt.property_mappings'),3);
    await grant(db,{grantId:id(220),snapshotId:refresh.snapshot.id,operator});
    refreshAcceptance=await reviewAndAccept(db,{scope:refresh,operator,consumer:a,reviewId:id(230),acceptanceId:id(231)});
    await auth(a,async()=>{
      assert.ok((await list(refreshAcceptance)).properties.every(p=>p.existing_lead_id===null),'a new acceptance still needs its own source link');
      refreshLink=await handoff(refreshAcceptance,refresh.records[0].source_property_key,id(240),stageA[0]);
      assert.equal(refreshLink.lead_id,first.lead_id);assert.equal(refreshLink.created,false);
      assert.notEqual(refreshLink.activity_id,first.activity_id);
      assert.deepEqual(await readPrivate(first.lead_id),privateBefore,'entire lead including updated_at and every private child row must be preserved');
      const parsed=await parseReceiptCaseDetail(await detail(first.lead_id));
      assert.equal(parsed.snapshot.snapshot_id,refresh.snapshot.id);assert.equal(parsed.cases[0].status,'CANCELLED');
      assert.equal(parsed.snapshot.acceptance_id,refreshAcceptance);
      assert.equal(parsed.cases[0].record_key,scope.records[0].record_key);
      assert.notEqual(parsed.cases[0].version_id,scope.records[0].version_id);
      assert.equal(parsed.cases[0].citation.original_sha256,refresh.snapshot.original_sha256);
    });
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM snap_receipt.crm_links WHERE lead_id=$1',[first.lead_id]),2);
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.leads WHERE property_id=$1',[firstProperty]),1);
  });

  await t.test('old acceptance revocation hides only its annotation; current refresh remains readable',async()=>{
    const command=freshId();
    assert.equal((await revoke(scope.snapshot.id,'acceptance',acceptanceId,command)).replayed,false);
    assert.equal((await revoke(scope.snapshot.id,'acceptance',acceptanceId,command)).replayed,true);
    await auth(a,async()=>{
      await denied(()=>list(acceptanceId));
      await denied(()=>handoff(acceptanceId,scope.records[0].source_property_key,requestId));
      assert.equal((await parseReceiptCaseDetail(await detail(first.lead_id))).snapshot.snapshot_id,refresh.snapshot.id);
      const activities=(await db.query('SELECT id FROM public.lead_activities WHERE lead_id=$1 ORDER BY id',[first.lead_id])).rows.map(row=>row.id);
      assert.ok(!activities.includes(first.activity_id));assert.ok(activities.includes(refreshLink.activity_id));
      assert.deepEqual(await readPrivate(first.lead_id),privateBefore);
    });
  });

  await t.test('snapshot revocation removes all source access yet preserves private CRM and denies stale receipts',async()=>{
    await revoke(refresh.snapshot.id,'snapshot',refresh.snapshot.id);
    await auth(a,async()=>{
      await denied(()=>detail(first.lead_id));await denied(()=>list(refreshAcceptance));
      await denied(()=>handoff(refreshAcceptance,refresh.records[0].source_property_key,id(240)));
      assert.deepEqual((await rpc(db,'fn_my_receipt_case_acceptances_v1')).acceptances,[]);
      assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.properties'),0);
      assert.deepEqual(await readPrivate(first.lead_id),privateBefore);
      assert.equal(await scalar(db,"SELECT count(*)::int value FROM public.lead_activities WHERE lead_id=$1 AND activity_type='system'",[first.lead_id]),0);
    });
    await auth(b,async()=>{
      await denied(()=>detail(first.lead_id));
      for(const table of ['leads','lead_activities','crm_contacts'])assert.equal(await scalar(db,`SELECT count(*)::int value FROM public.${table}`),0);
    });
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.lead_activities WHERE id=ANY($1)',[[first.activity_id,refreshLink.activity_id]]),2,'revocation hides but never deletes annotations');
  });

  await t.test('revoked receipt property stays hidden even behind legacy unlock and admin permissive policies',async()=>{
    // Adversarial legacy grants are installed only after ordinary-customer proof,
    // then removed. They must not override the restrictive receipt fence.
    await db.query('INSERT INTO public.unlocked_properties(user_id,property_id) VALUES($1,$2)',[a,firstProperty]);
    await db.query("INSERT INTO public.user_roles(user_id,role) VALUES($1,'admin')",[a]);
    try{
      await auth(a,async()=>{
        assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.properties WHERE id=$1',[firstProperty]),0);
        await denied(()=>detail(first.lead_id));
        assert.deepEqual(await readPrivate(first.lead_id),privateBefore);
        assert.equal(await scalar(db,"SELECT count(*)::int value FROM public.lead_activities WHERE lead_id=$1 AND activity_type='system'",[first.lead_id]),0);
      });
    }finally{
      await db.query("DELETE FROM public.user_roles WHERE user_id=$1 AND role='admin'",[a]);
      await db.query('DELETE FROM public.unlocked_properties WHERE user_id=$1 AND property_id=$2',[a,firstProperty]);
    }
  });

  const setupRevision=async(seed,{acceptanceUntil,grantUntil}={})=>{
    const s=syntheticSnapshot({seed,report:'2026-08-15',parent:scope.snapshot.id});
    await register(db,s);
    const g=freshId(),r=freshId(),accept=freshId();
    await grant(db,{grantId:g,snapshotId:s.snapshot.id,operator,...(grantUntil?{until:grantUntil}:{})});
    await reviewAndAccept(db,{scope:s,operator,consumer:a,reviewId:r,acceptanceId:accept,...(acceptanceUntil?{until:acceptanceUntil}:{})});
    const request=freshId(),link=await auth(a,()=>handoff(accept,s.records[0].source_property_key,request));
    return {s,g,r,accept,request,link};
  };
  const assertHeld=async revision=>auth(a,async()=>{
    await denied(()=>list(revision.accept));await denied(()=>detail(revision.link.lead_id));
    await denied(()=>handoff(revision.accept,revision.s.records[0].source_property_key,revision.request));
    assert.deepEqual(await readPrivate(first.lead_id),privateBefore);
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.lead_activities WHERE id=$1',[revision.link.activity_id]),0);
  });

  await t.test('revoked original authority cannot be revived by a replacement grant',async()=>{
    const revision=await setupRevision(300);
    await revoke(revision.s.snapshot.id,'grant',revision.g);
    await assertHeld(revision);
    await grant(db,{grantId:freshId(),snapshotId:revision.s.snapshot.id,operator});
    await assertHeld(revision);
    await auth(operator,()=>denied(()=>rpc(db,'fn_accept_receipt_case_snapshot_v1',[freshId(),revision.r,a,'crm',until,proof])));
  });

  await t.test('a later held review immediately invalidates detail, annotation and retry without deleting private work',async()=>{
    const revision=await setupRevision(400);
    await auth(operator,()=>rpc(db,'fn_review_receipt_case_snapshot_v1',[freshId(),revision.s.snapshot.id,revision.s.snapshot.selection_sha256,'held',sha('Synthetic later hold')]));
    await assertHeld(revision);
  });

  await t.test('consumer and operator state changes fail closed and cannot reveal another workspace',async t=>{
    const revision=await setupRevision(500);
    for(const [label,actor,column,value] of [
      ['consumer banned',a,'banned_until','2099-01-01T00:00:00Z'],
      ['consumer deleted',a,'deleted_at','2026-08-16T00:00:00Z'],
      ['consumer unconfirmed',a,'email_confirmed_at',null],
      ['consumer anonymous',a,'is_anonymous',true],
      ['operator banned',operator,'banned_until','2099-01-01T00:00:00Z'],
      ['operator deleted',operator,'deleted_at','2026-08-16T00:00:00Z'],
      ['operator unconfirmed',operator,'email_confirmed_at',null],
    ])await t.test(label,async()=>{
      const previous=await scalar(db,`SELECT ${column} value FROM auth.users WHERE id=$1`,[actor]);
      await db.query(`UPDATE auth.users SET ${column}=$2 WHERE id=$1`,[actor,value]);
      try{await auth(a,async()=>{await denied(()=>detail(first.lead_id));await denied(()=>list(revision.accept));await denied(()=>handoff(revision.accept,revision.s.records[0].source_property_key,revision.request));});}
      finally{await db.query(`UPDATE auth.users SET ${column}=$2 WHERE id=$1`,[actor,previous]);}
      await auth(a,async()=>parseReceiptCaseDetail(await detail(first.lead_id)));
    });
    for(const [label,actor] of [['consumer workspace unavailable',a],['operator workspace unavailable',operator]])await t.test(label,async()=>{
      const previous=await scalar(db,'SELECT to_jsonb(w) value FROM snap_security.workspace_owners w WHERE user_id=$1',[actor]);
      await db.query('DELETE FROM snap_security.workspace_owners WHERE user_id=$1',[actor]);
      try{
        await auth(a,async()=>{
          await denied(()=>detail(first.lead_id));await denied(()=>list(revision.accept));
          await denied(()=>handoff(revision.accept,revision.s.records[0].source_property_key,revision.request));
        });
      }finally{
        await db.query('INSERT INTO snap_security.workspace_owners SELECT (jsonb_populate_record(NULL::snap_security.workspace_owners,$1)).*',[JSON.stringify(previous)]);
      }
      await auth(a,async()=>parseReceiptCaseDetail(await detail(first.lead_id)));
    });
    await revoke(revision.s.snapshot.id,'acceptance',revision.accept);
    await assertHeld(revision);
  });

  await t.test('acceptance expiry is checked again before detail and exact handoff receipt replay',async()=>{
    const deadline=Date.now()+3000;
    const revision=await setupRevision(600,{acceptanceUntil:new Date(deadline).toISOString()});
    await delay(Math.max(0,deadline-Date.now()+30));
    await assertHeld(revision);
  });

  await t.test('grant expiry leaves old acceptances unavailable when a new grant is added',async()=>{
    const deadline=Date.now()+3000;
    const expires=new Date(deadline).toISOString();
    const revision=await setupRevision(700,{acceptanceUntil:expires,grantUntil:expires});
    await delay(Math.max(0,deadline-Date.now()+30));
    await assertHeld(revision);
    await grant(db,{grantId:freshId(),snapshotId:revision.s.snapshot.id,operator});
    await assertHeld(revision);
  });

  await t.test('mapping revocation is permanent source denial while owned private CRM survives',async()=>{
    const revision=await setupRevision(800);
    await revoke(revision.s.snapshot.id,'mapping',revision.s.records[0].source_property_key);
    await assertHeld(revision);
    await auth(a,async()=>{
      assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.properties'),0);
      await db.query("UPDATE public.leads SET next_action='Private work after revocation' WHERE id=$1",[first.lead_id]);
      assert.equal(await scalar(db,'SELECT next_action value FROM public.leads WHERE id=$1',[first.lead_id]),'Private work after revocation');
    });
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.user_subscriptions'),0);
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.unlocked_properties'),0);
    assert.equal(await scalar(db,'SELECT count(*)::int value FROM public.sms_messages'),0);
    assert.equal(await scalar(db,'SELECT public.fn_billing_checkout_enabled_v1() value'),false);
  });
});
