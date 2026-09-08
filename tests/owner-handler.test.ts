import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/owner-operations/handler.ts';
const env={url:'https://worker.example',publicKey:'public-test-key',secretKey:'private-test-key'};
const request=(extra:RequestInit={})=>new Request('https://worker.example/functions/v1/owner-operations',{headers:{Authorization:'Bearer test-user-token',Origin:'http://127.0.0.1:4173'},...extra});
function mocked(options:{owner?:boolean;verified?:boolean;auth?:boolean;broken?:boolean;brokenMailReview?:boolean;brokenCollectionProcessing?:boolean;brokenRuntime?:boolean;brokenArchive?:boolean;brokenArchiveJobs?:boolean;archiveControlRows?:unknown;runtimeControls?:unknown}={}){
  const calls:{url:string;init:RequestInit}[]=[];
  const fetcher=async(input:string|URL|Request, init:RequestInit={})=>{
    const url=String(input);calls.push({url,init});
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'owner-id',email:'owner@example.test',email_confirmed_at:options.verified===false?null:'2026-01-01'}),{status:options.auth===false?401:200});
    if(url.includes('/owner_dashboard_access?'))return new Response(JSON.stringify(options.owner===false?[]:[{enabled:true}]));
    if(options.broken&&url.includes('/foia_request_jobs?'))return new Response('{}',{status:503});
    if(options.brokenMailReview&&url.includes('/mailbox_processing_results?'))return new Response('{}',{status:503});
    if(options.brokenCollectionProcessing&&url.includes('/collection_processing_runs?'))return new Response('{}',{status:503});
    if(options.brokenRuntime&&url.includes('/atlas_'))return new Response('{}',{status:503});
    if(options.brokenArchiveJobs&&url.includes('/collection_archive_jobs?'))return new Response('{}',{status:404});
    if(url.includes('/ops_control?')&&new URL(url).searchParams.get('key')==='eq.harvester_syracuse_archive_enabled'&&options.archiveControlRows!==undefined)return Response.json(options.archiveControlRows,{headers:{'content-range':'*/1'}});
    if(options.brokenArchive&&url.includes('/collection_archive_'))return new Response('{}',{status:503});
    if(url.includes('/ops_control?')&&options.runtimeControls!==undefined)return Response.json(options.runtimeControls,{headers:{'content-range':'*/3'}});
    return new Response(init.method==='HEAD'?null:JSON.stringify([]),{headers:{'content-range':'*/0'}});
  };
  return {calls,handler:createHandler(env,[],fetcher as typeof fetch)};
}
test('missing bearer token never reaches Auth or private data',async()=>{const {handler,calls}=mocked();assert.equal((await handler(request({headers:{}}))).status,401);assert.equal(calls.length,0);});
test('invalid session never reaches private data',async()=>{const {handler,calls}=mocked({auth:false});assert.equal((await handler(request())).status,401);assert.equal(calls.length,1);});
test('unverified email cannot use the allowlist',async()=>{const {handler,calls}=mocked({verified:false});assert.equal((await handler(request())).status,403);assert.equal(calls.length,1);});
test('verified account without owner approval cannot read operational records',async()=>{const {handler,calls}=mocked({owner:false});assert.equal((await handler(request())).status,403);assert.equal(calls.length,2);});
test('owner gets bounded selected feeds, without credentials or raw message bodies',async()=>{const {handler,calls}=mocked();const response=await handler(request());assert.equal(response.status,200);const data=await response.json();assert.equal(data.source,'worker');assert.equal(data.sentToday.data,0);assert.equal(data.agents.total,0);assert.equal(data.registry.data.length,0);const text=JSON.stringify(data);assert.ok(!text.includes(env.secretKey));assert.ok(!calls.some(c=>c.url.includes('select=*')||c.url.includes('smtp_password')||c.url.includes('raw_text')));for(const c of calls.filter(c=>c.url.includes('/rest/')))assert.equal((c.init.headers as Record<string,string>).apikey,env.secretKey);});
test('one failing feed stays unavailable while other feeds succeed',async()=>{const {handler}=mocked({broken:true});const data=await(await handler(request())).json();assert.equal(data.requests.data,null);assert.ok(data.requests.error);assert.equal(data.repliesToday.data,0);});
test('mail review reads only its own health and selected provisional metadata',async()=>{
 const {handler,calls}=mocked();const data=await(await handler(request())).json();
 const health=new URL(calls.find(c=>c.url.includes('/collection_worker_health?'))!.url);
 assert.equal(health.searchParams.get('select'),'worker_name,version,last_success_at,last_error_code');
 assert.equal(health.searchParams.get('worker_name'),'eq.hermes-intake');
 assert.equal(health.searchParams.get('limit'),'1');
 const suggestions=new URL(calls.find(c=>c.url.includes('/mailbox_processing_results?'))!.url);
 assert.deepEqual(suggestions.searchParams.get('select')!.split(','),['inbox_id','message_id','processor_version','request_job_id','match_state','processed_at','next_action:result->>next_action','signals:result->signals','review_state:result->>review_state','usable_records:result->usable_records']);
 assert.equal(suggestions.searchParams.get('result->>review_state'),'eq.pending_review');
 assert.equal(suggestions.searchParams.get('limit'),'100');
 assert.equal(suggestions.searchParams.get('order'),'processed_at.desc,inbox_id.asc,message_id.asc');
 const inbox=new URL(calls.find(c=>c.url.includes('/mailbox_received_messages?')&&c.init.method==='GET')!.url);
 assert.equal(inbox.searchParams.get('review_state'),'eq.needs_review');
 assert.equal(inbox.searchParams.get('select'),'inbox_id,message_id,received_at,stored_at,sender,subject,review_state');
 assert.deepEqual(data.mailReviewHealth.data,[]);assert.deepEqual(data.mailboxSuggestions.data,[]);
 assert.ok(!calls.some(c=>/body_text|body_html|raw_headers|attachments|storage_path|input_digest/.test(decodeURIComponent(c.url))));
});
test('mail review metadata remains behind owner authorization and access-only stays narrow',async()=>{
 const denied=mocked({owner:false});assert.equal((await denied.handler(request())).status,403);
 assert.ok(!denied.calls.some(c=>/collection_worker_health|mailbox_processing_results/.test(c.url)));
 const allowed=mocked();const access=new Request('https://worker.example/functions/v1/owner-operations?access=1',request());
 assert.deepEqual(await(await allowed.handler(access)).json(),{authorized:true,source:'worker'});assert.equal(allowed.calls.length,2);
});
test('unavailable suggestions do not hide incoming messages or imply completed review',async()=>{
 const {handler}=mocked({brokenMailReview:true});const data=await(await handler(request())).json();
 assert.equal(data.mailboxSuggestions.data,null);assert.ok(data.mailboxSuggestions.error);
 assert.deepEqual(data.mailboxReview.data,[]);assert.equal(data.mailboxReview.error,null);assert.deepEqual(data.mailReviewHealth.data,[]);
});
test('private collection register exposes selected metadata and separate acquisition counts',async()=>{
 const {handler,calls}=mocked();const data=await(await handler(request())).json();
 const getUrl=(table:string)=>new URL(calls.find(c=>c.url.includes('/'+table+'?')&&c.init.method==='GET')!.url);
 const deliveries=getUrl('collection_deliveries');
 assert.equal(deliveries.searchParams.get('limit'),'100');
 assert.equal(deliveries.searchParams.get('order'),'collected_at.desc,id.asc');
 assert.ok(deliveries.searchParams.get('select')!.includes('freshness,source_rows,customer_accepted'));
 const runs=getUrl('collection_processing_runs');
 assert.equal(runs.searchParams.get('order'),'staged_at.desc,id.asc');
 assert.ok(runs.searchParams.get('select')!.includes('candidate_rows,duplicate_rows,held_rows,source_case_count'));
 const originals=getUrl('collection_delivery_artifacts');
 assert.equal(originals.searchParams.get('select'),'delivery_id,role,storage_kind');
 assert.equal(originals.searchParams.get('role'),'in.(government_raw_response,preserved_original)');
 assert.equal(originals.searchParams.get('limit'),'1000');
 assert.equal(getUrl('collection_editorial_handoffs').searchParams.get('limit'),'100');
 const counters=calls.filter(c=>c.url.includes('/collection_deliveries?')&&c.init.method==='HEAD').map(c=>new URL(c.url));
 assert.ok(counters.some(url=>url.searchParams.get('freshness')==='eq.fresh_verified'));
 assert.ok(counters.some(url=>url.searchParams.get('customer_accepted')==='eq.true'));
 assert.equal(data.freshCollectionCount.data,0);assert.equal(data.customerAcceptedCollections.data,0);
 assert.ok(calls.filter(c=>c.url.includes('/collection_')).every(c=>['GET','HEAD'].includes(c.init.method!)));
 assert.ok(!calls.some(c=>/storage_ref|payload|raw_text|source_url|select=\*/.test(decodeURIComponent(c.url))));
});
test('collection feeds remain owner-only and a processing failure does not invent zeros',async()=>{
 const denied=mocked({owner:false});assert.equal((await denied.handler(request())).status,403);
 assert.ok(!denied.calls.some(c=>/collection_deliveries|collection_processing_runs|collection_delivery_artifacts|collection_editorial_handoffs/.test(c.url)));
 const accessOnly=mocked();await accessOnly.handler(new Request('https://worker.example/functions/v1/owner-operations?access=1',request()));
 assert.equal(accessOnly.calls.length,2);
 const {handler}=mocked({brokenCollectionProcessing:true});const data=await(await handler(request())).json();
 assert.equal(data.collectionProcessing.data,null);assert.ok(data.collectionProcessing.error);
 assert.deepEqual(data.collectionDeliveries.data,[]);assert.equal(data.collectionDeliveries.error,null);
 assert.equal(data.freshCollectionCount.data,0);assert.equal(data.customerAcceptedCollections.data,0);
});
test('backup feeds select bounded metadata without manifests, proofs or private object references',async()=>{
 const {handler,calls}=mocked();const data=await(await handler(request())).json();
 const get=(table:string)=>new URL(calls.find(c=>c.url.includes('/'+table+'?'))!.url);
 assert.equal(get('collection_archive_plans').searchParams.get('select'),'id,delivery_id,artifact_count,registered_at');
 assert.equal(get('collection_archive_verifications').searchParams.get('select'),'id,plan_id,delivery_id,verified_at,artifact_count,registered_at');
 for(const table of ['collection_archive_plans','collection_archive_verifications'])assert.equal(get(table).searchParams.get('limit'),'1000');
 const copies=new URL(calls.find(c=>c.url.includes('/collection_delivery_artifacts?')&&new URL(c.url).searchParams.get('storage_kind')==='eq.supabase_private')!.url);
 assert.equal(copies.searchParams.get('select'),'id,delivery_id,storage_kind');assert.equal(copies.searchParams.get('limit'),'2000');
 assert.deepEqual(data.archivePlans.data,[]);assert.deepEqual(data.archiveVerifications.data,[]);assert.deepEqual(data.archiveCopies.data,[]);
 assert(!calls.some(c=>/storage_ref|manifest_sha256|plan_sha256|report_sha256|select=\*|report->|plan->/.test(decodeURIComponent(c.url))));
});
test('backup data remains owner-only and access-only never reads archive metadata',async()=>{
 const denied=mocked({owner:false});assert.equal((await denied.handler(request())).status,403);
 assert(!denied.calls.some(c=>c.url.includes('/collection_archive_')));
 const access=mocked();await access.handler(new Request('https://worker.example/functions/v1/owner-operations?access=1',request()));assert.equal(access.calls.length,2);
});
test('failed backup proof feeds stay unavailable while original locations remain visible',async()=>{
 const {handler}=mocked({brokenArchive:true});const data=await(await handler(request())).json();
 assert.equal(data.archivePlans.data,null);assert.ok(data.archivePlans.error);
 assert.equal(data.archiveVerifications.data,null);assert.ok(data.archiveVerifications.error);
 assert.deepEqual(data.collectionOriginals.data,[]);assert.deepEqual(data.archiveCopies.data,[]);
});
test('acquisition metadata is fixed, bounded and excludes policy, request, history and provider payloads',async()=>{
 const {handler,calls}=mocked();const data=await(await handler(request())).json();
 const get=(table:string)=>new URL(calls.find(c=>c.url.includes('/'+table+'?'))!.url);
 assert.equal(get('atlas_operating_policies').searchParams.get('select'),'revision,approved,global_paused');
 assert.equal(get('atlas_operating_policies').searchParams.get('singleton'),'eq.true');
 assert.equal(get('atlas_state_assignments').searchParams.get('select'),'state,outlet_id,revision,approved,starts_on,ends_on');
 assert.equal(get('atlas_agency_history_reviews').searchParams.get('select'),'revision,complete,reviewed_at,valid_until');
 assert.equal(get('atlas_health_observations').searchParams.get('select'),'kind,checked_at,available');
 assert.equal(get('atlas_capacity_snapshots').searchParams.get('select'),'revision,checked_at,window_start,window_end,utc_day,submission_slots_available,outbound_messages_available');
 assert.equal(get('ops_control').searchParams.get('key'),'in.(atlas_live_enabled,foia_paused,blocked_states)');
 assert.equal(get('ops_control').searchParams.get('limit'),'3');
 const checks=calls.filter(c=>/\/atlas_|\/ops_control\?/.test(c.url));
 assert(checks.every(c=>c.init.method==='GET'&&Number(new URL(c.url).searchParams.get('limit'))<=100));
 assert(checks.every(c=>!/(policy|binding|reconciliation|entry|approved_by|evidence_ref|inventory_sha256|source_sha256|spec|request_body)/.test(new URL(c.url).searchParams.get('select')!)));
 assert(!calls.some(c=>/atlas_legacy_history_resolutions|atlas_agency_aliases/.test(c.url)));
 assert.deepEqual(data.acquisitionControls.data,{atlas_live_enabled:null,foia_paused:null,blocked_states:null});
});
test('acquisition control output retains only typed booleans and state codes',async()=>{
 const good=mocked({runtimeControls:[{key:'atlas_live_enabled',value:false},{key:'foia_paused',value:false},{key:'blocked_states',value:['SC']}]});
 const data=await(await good.handler(request())).json();
 assert.deepEqual(data.acquisitionControls.data,{atlas_live_enabled:false,foia_paused:false,blocked_states:['SC']});
 const bad=mocked({runtimeControls:[{key:'atlas_live_enabled',value:{private:'DO-NOT-RETURN'}},{key:'foia_paused',value:'false'},{key:'blocked_states',value:['SC',{private:'DO-NOT-RETURN'}]},{key:'secret_key',value:'DO-NOT-RETURN'}]});
 const malformed=await(await bad.handler(request())).json();
 assert.deepEqual(malformed.acquisitionControls.data,{atlas_live_enabled:null,foia_paused:null,blocked_states:null});
 assert(!JSON.stringify(malformed).includes('DO-NOT-RETURN'));
});
test('runtime failure remains unavailable while incoming review and submission controls remain separate',async()=>{
 const {handler}=mocked({brokenRuntime:true,runtimeControls:[{key:'atlas_live_enabled',value:false}]});
 const data=await(await handler(request())).json();
 for(const key of ['acquisitionPolicy','acquisitionAssignments','acquisitionHistory','acquisitionHealth','acquisitionCapacity']){
   assert.equal(data[key].data,null);assert(data[key].error);
 }
 assert.equal(data.acquisitionControls.data.atlas_live_enabled,false);
 assert.deepEqual(data.mailReviewHealth.data,[]);assert.equal(data.mailReviewHealth.error,null);
});
test('runtime and public-download feeds are owner-only and access-only performs no runtime reads',async()=>{
 const denied=mocked({owner:false});assert.equal((await denied.handler(request())).status,403);
 assert(!denied.calls.some(c=>/atlas_|ops_control|harvester_syracuse/.test(c.url)));
 const only=mocked();await only.handler(new Request('https://worker.example/functions/v1/owner-operations?access=1',request()));
 assert.equal(only.calls.length,2);
 const allowed=mocked();await allowed.handler(request());
 const harvester=new URL(allowed.calls.find(c=>c.url.includes('harvester_syracuse'))!.url);
 assert.equal(harvester.searchParams.get('worker_name'),'eq.harvester_syracuse');
 assert.equal(harvester.searchParams.get('select'),'worker_name,version,last_success_at,last_error_code,status:last_result->>status');
 assert.equal(harvester.searchParams.get('limit'),'1');
});
test('writes and unapproved browser origins are rejected before authentication',async()=>{const {handler,calls}=mocked();assert.equal((await handler(request({method:'POST'}))).status,405);assert.equal((await handler(request({headers:{Origin:'https://evil.example',Authorization:'Bearer token'}}))).status,403);assert.equal(calls.length,0);});
test('published-story reads never receive the owner token or worker secret',async()=>{
 const calls:{url:string;init:RequestInit}[]=[];
 const handler=createHandler(env,[{name:'News',domain:'news.example',url:'https://news-db.example',key:'public-news-key',dateColumn:'publish_date',publishedFilter:'is_published',articlePath:'/article/'}],(async(input,init:RequestInit={})=>{
 const url=String(input);calls.push({url,init});
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',email:'owner@example.test',email_confirmed_at:'2026-01-01'});
 if(url.includes('owner_dashboard_access'))return Response.json([{enabled:true}]);
 return new Response(init.method==='HEAD'?null:'[]',{headers:{'content-range':'*/0'}});
 })as typeof fetch);
 const data=await(await handler(request())).json();assert.equal(data.publishing[0].articles.total,0);
 const news=calls.find(c=>c.url.startsWith('https://news-db.example'))!;assert.equal((news.init.headers as Record<string,string>).apikey,'public-news-key');assert.ok(!JSON.stringify(news).includes('test-user-token'));assert.ok(!JSON.stringify(news).includes(env.secretKey));assert.ok(news.url.includes('is_published=eq.true'));
});

test('archive jobs read a fixed worker projection and only the dedicated control',async()=>{
 const {handler,calls}=mocked({archiveControlRows:[{key:'harvester_syracuse_archive_enabled',value:false}]});
 const data=await(await handler(request())).json();
 const c=calls.find(c=>c.url.includes('/collection_archive_jobs?'))!;const u=new URL(c.url);
 assert.equal(u.searchParams.get('select'),'id,delivery_id,processing_run_id,state,attempt_count,next_attempt_at,lease_expires_at,verification_id,last_error_code,created_at,updated_at');
 assert.equal(u.searchParams.get('worker_name'),'eq.archive_syracuse');assert.equal(u.searchParams.get('limit'),'100');assert.equal(u.searchParams.get('order'),'updated_at.desc,id.asc');
 assert.equal((c.init.headers as Record<string,string>).Prefer,'count=exact');assert.equal(c.init.method,'GET');
 const control=new URL(calls.find(c=>new URL(c.url).searchParams.get('key')==='eq.harvester_syracuse_archive_enabled')!.url);
 assert.equal(control.searchParams.get('select'),'key,value');assert.equal(control.searchParams.get('limit'),'2');assert.deepEqual(data.archiveControl.data,{enabled:false});
 assert(!/intent|lease_token|sha256|storage|object_key/.test(u.searchParams.get('select')!));
});
test('archive control never returns arbitrary JSON or treats duplicate values as enabled',async()=>{
 for(const value of [true,false]){
  const {handler}=mocked({archiveControlRows:[{key:'harvester_syracuse_archive_enabled',value}]});
  assert.deepEqual((await(await handler(request())).json()).archiveControl.data,{enabled:value});
 }
 for(const rows of [[],[{key:'harvester_syracuse_archive_enabled',value:'true'}],[{key:'harvester_syracuse_archive_enabled',value:{private:'DO-NOT-RETURN'}}],[{key:'other_control',value:true}],[{key:'harvester_syracuse_archive_enabled',value:true},{key:'harvester_syracuse_archive_enabled',value:false}]]){
  const {handler}=mocked({archiveControlRows:rows});const data=await(await handler(request())).json();
  assert.deepEqual(data.archiveControl.data,{enabled:null});assert(!JSON.stringify(data).includes('DO-NOT-RETURN'));
 }
});
test('archive queue and control are unavailable to nonowners and skipped for access-only requests',async()=>{
 const denied=mocked({owner:false});assert.equal((await denied.handler(request())).status,403);assert.equal(denied.calls.length,2);
 const allowed=mocked();await allowed.handler(new Request('https://worker.example/functions/v1/owner-operations?access=1',request()));
 assert.equal(allowed.calls.length,2);assert(!allowed.calls.some(c=>/collection_archive_jobs|ops_control/.test(c.url)));
});
test('an absent archive queue does not hide existing backup proof or collection counts',async()=>{
 const {handler}=mocked({brokenArchiveJobs:true});const data=await(await handler(request())).json();
 assert.equal(data.archiveJobs.data,null);assert(data.archiveJobs.error);
 assert.deepEqual(data.archiveVerifications.data,[]);assert.equal(data.archiveVerifications.error,null);
 assert.deepEqual(data.archiveCopies.data,[]);assert.equal(data.freshCollectionCount.data,0);assert.equal(data.customerAcceptedCollections.data,0);
});
