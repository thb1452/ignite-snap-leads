import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler} from '../supabase/functions/owner-operations/handler.ts';
const env={url:'https://worker.example',publicKey:'public-test-key',secretKey:'private-test-key'};
const request=(extra:RequestInit={})=>new Request('https://worker.example/functions/v1/owner-operations',{headers:{Authorization:'Bearer test-user-token',Origin:'http://127.0.0.1:4173'},...extra});
function mocked(options:{owner?:boolean;verified?:boolean;auth?:boolean;broken?:boolean;brokenMailReview?:boolean}={}){
  const calls:{url:string;init:RequestInit}[]=[];
  const fetcher=async(input:string|URL|Request, init:RequestInit={})=>{
    const url=String(input);calls.push({url,init});
    if(url.endsWith('/auth/v1/user'))return new Response(JSON.stringify({id:'owner-id',email:'owner@example.test',email_confirmed_at:options.verified===false?null:'2026-01-01'}),{status:options.auth===false?401:200});
    if(url.includes('/owner_dashboard_access?'))return new Response(JSON.stringify(options.owner===false?[]:[{enabled:true}]));
    if(options.broken&&url.includes('/foia_request_jobs?'))return new Response('{}',{status:503});
    if(options.brokenMailReview&&url.includes('/mailbox_processing_results?'))return new Response('{}',{status:503});
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
test('writes and unapproved browser origins are rejected before authentication',async()=>{const {handler,calls}=mocked();assert.equal((await handler(request({method:'POST'}))).status,405);assert.equal((await handler(request({headers:{Origin:'https://evil.example',Authorization:'Bearer token'}}))).status,403);assert.equal(calls.length,0);});
test('published-story reads never receive the owner token or worker secret',async()=>{
 const calls:{url:string;init:RequestInit}[]=[];
 const handler=createHandler(env,[{name:'News',domain:'news.example',url:'https://news-db.example',key:'public-news-key',dateColumn:'publish_date',publishedFilter:'is_published',articlePath:'/article/'}],(async(input,init={})=>{
 const url=String(input);calls.push({url,init});
 if(url.endsWith('/auth/v1/user'))return Response.json({id:'owner',email:'owner@example.test',email_confirmed_at:'2026-01-01'});
 if(url.includes('owner_dashboard_access'))return Response.json([{enabled:true}]);
 return new Response(init.method==='HEAD'?null:'[]',{headers:{'content-range':'*/0'}});
 })as typeof fetch);
 const data=await(await handler(request())).json();assert.equal(data.publishing[0].articles.total,0);
 const news=calls.find(c=>c.url.startsWith('https://news-db.example'))!;assert.equal((news.init.headers as Record<string,string>).apikey,'public-news-key');assert.ok(!JSON.stringify(news).includes('test-user-token'));assert.ok(!JSON.stringify(news).includes(env.secretKey));assert.ok(news.url.includes('is_published=eq.true'));
});
