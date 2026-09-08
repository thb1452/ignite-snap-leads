type Env = { url: string; publicKey: string; secretKey: string };
type Site = { name: string; domain: string; url: string; key: string; dateColumn: string; publishedFilter: string | null; articlePath: string };
type Fetcher = typeof fetch;
function archiveControl(rows: unknown) {
  const values = Array.isArray(rows) ? rows : [];
  const found = values.filter(row => row && typeof row === 'object' && row.key === 'harvester_syracuse_archive_enabled');
  return { enabled: found.length === 1 && typeof found[0].value === 'boolean' ? found[0].value : null };
}
function acquisitionControls(rows: unknown) {
  const values = Array.isArray(rows) ? rows : [];
  const one = (key: string): unknown => {
    const found = values.filter(row => row && typeof row === 'object' && row.key === key);
    return found.length === 1 ? found[0].value : null;
  };
  const live = one('atlas_live_enabled'), paused = one('foia_paused'), blocked = one('blocked_states');
  // Return only known scalar shapes; never return arbitrary ops-control JSON.
  return { atlas_live_enabled: typeof live === 'boolean' ? live : null,
    foia_paused: typeof paused === 'boolean' ? paused : null,
    blocked_states: Array.isArray(blocked) && blocked.every(state => typeof state === 'string' && /^[A-Z]{2}$/.test(state)) ? [...new Set(blocked)] : null };
}
const allowedOrigins = new Set(['https://ignite-snap-leads.lovable.app', 'https://snapignite.com', 'https://www.snapignite.com', 'https://id-preview--6082ede1-ff48-4b44-926f-7dbadb14f9e1.lovable.app', 'http://127.0.0.1:4173', 'http://localhost:4173']);
export function createHandler(env: Env, sites: Site[], fetcher: Fetcher = fetch) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const headers: Record<string,string> = { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'Vary':'Origin' };
    if (origin && allowedOrigins.has(origin)) {
      headers['Access-Control-Allow-Origin']=origin;
      headers['Access-Control-Allow-Headers']='authorization,apikey,content-type,x-client-info';
      headers['Access-Control-Allow-Methods']='GET,OPTIONS';
    }
    const response=(status:number, body:unknown)=>new Response(JSON.stringify(body),{status,headers});
    if (origin && !allowedOrigins.has(origin)) return response(403,{error:'Origin not allowed'});
    if (req.method==='OPTIONS') return new Response(null,{status:204,headers});
    if (req.method!=='GET') return response(405,{error:'Read-only endpoint'});
    const authorization=req.headers.get('authorization') ?? '';
    if (!authorization.startsWith('Bearer ')) return response(401,{error:'Sign in to continue'});
    if (!env.url || !env.publicKey || !env.secretKey) return response(503,{error:'Owner connection is not configured'});
    const timedFetch=(url:string,init:RequestInit={})=>fetcher(url,{...init,signal:AbortSignal.timeout(15000),redirect:'error'});
    const dbHeaders:Record<string,string>={apikey:env.secretKey,Prefer:'count=exact'};
    if(env.secretKey.startsWith('eyJ')) dbHeaders.Authorization='Bearer '+env.secretKey;
    const read=async(table:string, params:Record<string,string>, head=false)=>{
      const result=await timedFetch(env.url+'/rest/v1/'+table+'?'+new URLSearchParams(params),{method:head?'HEAD':'GET',headers:dbHeaders});
      if(!result.ok) throw new Error('Feed unavailable');
      const denominator=result.headers.get('content-range')?.split('/')[1];
      const count=denominator && /^\d+$/.test(denominator)?Number(denominator):null;
      const data=head?count:await result.json();
      if(head ? count===null : !Array.isArray(data)) throw new Error('Invalid feed response');
      return {data,error:null,checkedAt:new Date().toISOString(),...(count===null?{}:{total:count})};
    };
    try {
      // Always verify the JWT with Auth, then use a separate server-owned allowlist.
      // Neither legacy VA roles nor editable user metadata can grant access.
      const auth=await timedFetch(env.url+'/auth/v1/user',{headers:{apikey:env.publicKey,Authorization:authorization}});
      if(!auth.ok) return response(401,{error:'Sign in to continue'});
      const user=await auth.json();
      if(!user.id || !user.email || !user.email_confirmed_at || user.is_anonymous===true) return response(403,{error:'A verified owner email is required'});
      const owner=await read('owner_dashboard_access',{select:'enabled',email:'eq.'+String(user.email).toLowerCase(),enabled:'eq.true',limit:'1'});
      if(!owner.data.length) return response(403,{error:'Owner access is required'});
      if(new URL(req.url).searchParams.get('access')==='1') return response(200,{authorized:true,source:'worker'});
      const windowEnd=new Date().toISOString();
      const windowStart=windowEnd.slice(0,10)+'T00:00:00.000Z';
      const safe=async(task:Promise<unknown>)=>{try{return await task;}catch{return {data:null,error:'This feed is unavailable. Refresh to try again.',checkedAt:new Date().toISOString()};}};
      const definitions:Record<string,[string,Record<string,string>,boolean?]>={
        mailboxSync:['mailbox_sync_state',{select:'inbox_id,enabled,checked_at,last_success_at,last_error_code,scan_before',order:'inbox_id.asc',limit:'100'}],
        mailboxReview:['mailbox_received_messages',{select:'inbox_id,message_id,received_at,stored_at,sender,subject,review_state',review_state:'eq.needs_review',order:'stored_at.desc',limit:'100'}],
        mailboxTests:['mailbox_received_messages',{select:'message_id',review_state:'eq.internal_test'},true],
        mailReviewHealth:['collection_worker_health',{select:'worker_name,version,last_success_at,last_error_code',worker_name:'eq.hermes-intake',limit:'1'}],
        publicDownloadHealth:['collection_worker_health',{select:'worker_name,version,last_success_at,last_error_code,status:last_result->>status',worker_name:'eq.harvester_syracuse',limit:'1'}],
        acquisitionControls:['ops_control',{select:'key,value',key:'in.(atlas_live_enabled,foia_paused,blocked_states)',order:'key.asc',limit:'3'}],
        acquisitionPolicy:['atlas_operating_policies',{select:'revision,approved,global_paused',singleton:'eq.true',limit:'1'}],
        acquisitionAssignments:['atlas_state_assignments',{select:'state,outlet_id,revision,approved,starts_on,ends_on',order:'state.asc',limit:'100'}],
        acquisitionHistory:['atlas_agency_history_reviews',{select:'revision,complete,reviewed_at,valid_until',order:'reviewed_at.desc,agency_key.asc',limit:'100'}],
        acquisitionHealth:['atlas_health_observations',{select:'kind,checked_at,available',order:'checked_at.desc,kind.asc,subject_key.asc',limit:'100'}],
        acquisitionCapacity:['atlas_capacity_snapshots',{select:'revision,checked_at,window_start,window_end,utc_day,submission_slots_available,outbound_messages_available',singleton:'eq.true',limit:'1'}],
        mailboxSuggestions:['mailbox_processing_results',{select:'inbox_id,message_id,processor_version,request_job_id,match_state,processed_at,next_action:result->>next_action,signals:result->signals,review_state:result->>review_state,usable_records:result->usable_records','result->>review_state':'eq.pending_review',order:'processed_at.desc,inbox_id.asc,message_id.asc',limit:'100'}],
        requests:['foia_request_jobs',{select:'id,request_type,status,jurisdiction,state,updated_at,sent_at,response_due_at,retry_count',order:'updated_at.desc,id.asc',limit:'100'}],
        agents:['agent_runs',{select:'id,agent_name,status,created_at,cost_usd,duration_ms',order:'created_at.desc,id.asc',limit:'100'}],
        outlets:['press_accounts',{select:'id,name,domain,email,is_active,daily_send_limit,emails_sent_today,last_send_reset_date,deliverability_score,last_health_check_at',order:'name.asc',limit:'100'}],
        uploads:['upload_jobs',{select:'id,filename,status,created_at,finished_at,processed_rows,bad_addresses,source_type',order:'created_at.desc,id.asc',limit:'100'}],
        collectionDeliveries:['collection_deliveries',{select:'id,source_name,jurisdiction,state,record_type,collected_at,freshness,source_rows,customer_accepted,usable_records,registered_at',order:'collected_at.desc,id.asc',limit:'100'}],
        collectionProcessing:['collection_processing_runs',{select:'id,delivery_id,processor_version,staged_at,input_rows,candidate_rows,duplicate_rows,held_rows,source_case_count,candidate_case_count,review_state,customer_accepted,usable_records,registered_at',order:'staged_at.desc,id.asc',limit:'100'}],
        collectionOriginals:['collection_delivery_artifacts',{select:'delivery_id,role,storage_kind',role:'in.(government_raw_response,preserved_original)',order:'registered_at.desc,id.asc',limit:'1000'}],
        archivePlans:['collection_archive_plans',{select:'id,delivery_id,artifact_count,registered_at',order:'registered_at.desc,id.asc',limit:'1000'}],
        archiveVerifications:['collection_archive_verifications',{select:'id,plan_id,delivery_id,verified_at,artifact_count,registered_at',order:'verified_at.desc,id.asc',limit:'1000'}],
        archiveCopies:['collection_delivery_artifacts',{select:'id,delivery_id,storage_kind',storage_kind:'eq.supabase_private',order:'registered_at.desc,id.asc',limit:'2000'}],
        archiveJobs:['collection_archive_jobs',{select:'id,delivery_id,processing_run_id,state,attempt_count,next_attempt_at,lease_expires_at,verification_id,last_error_code,created_at,updated_at',worker_name:'eq.archive_syracuse',order:'updated_at.desc,id.asc',limit:'100'}],
        archiveControl:['ops_control',{select:'key,value',key:'eq.harvester_syracuse_archive_enabled',limit:'2'}],
        collectionEditorial:['collection_editorial_handoffs',{select:'id,delivery_id,processing_run_id,outlet_name,title,review_state,published,registered_at',order:'registered_at.desc,id.asc',limit:'100'}],
        freshCollectionCount:['collection_deliveries',{select:'id',freshness:'eq.fresh_verified'},true],
        customerAcceptedCollections:['collection_deliveries',{select:'id',customer_accepted:'eq.true'},true],
        reviews:['v_needs_human_review_queue',{select:'domain,job_id,job_subtype,jurisdiction,state,created_at,updated_at',order:'updated_at.desc,job_id.asc',limit:'100'}],
        sentToday:['foia_request_jobs',{select:'id',and:'(sent_at.gte.'+windowStart+',sent_at.lte.'+windowEnd+')'},true],
        repliesToday:['foia_responses',{select:'id',and:'(received_at.gte.'+windowStart+',received_at.lte.'+windowEnd+')'},true],
        registry:['agents',{select:'id,name,role,status,last_heartbeat',order:'name.asc',limit:'100'}],
        research:['ai_research_runs',{select:'id,state,county,status,started_at,completed_at,attempted_count,found_verified_count,found_third_party_count,unknown_count,blocked_count,conflicting_count,error_count',order:'started_at.desc,id.asc',limit:'100'}],
        taskReviews:['cartographer_agent_tasks',{select:'id,agent_role,task_type,status,state,county,updated_at,heartbeat_at',status:'in.(needs_review,stale_needs_review,failed,blocked)',order:'updated_at.desc,id.asc',limit:'100'}],
        tasks:['cartographer_agent_tasks',{select:'id,agent_role,task_type,status,state,county,assigned_worker,heartbeat_at,started_at,completed_at,updated_at,exit_code',order:'updated_at.desc,id.asc',limit:'100'}],
      };
      const result=Object.fromEntries(await Promise.all(Object.entries(definitions).map(async([name,[table,params,head]])=>[name,await safe(read(table,params,head).then(feed => name === 'acquisitionControls' ? {...feed,data:acquisitionControls(feed.data)} : name === 'archiveControl' ? {...feed,data:archiveControl(feed.data)} : feed))])));
      const publishing=await Promise.all(sites.map(async site=>{
        const checkedAt=new Date().toISOString();
        const params:Record<string,string>={select:'id,title,slug,'+site.dateColumn,order:site.dateColumn+'.desc',limit:'5'};
        if(site.publishedFilter)params[site.publishedFilter]='eq.true';
        // Exclude future publication dates; API access uses only each site's public key.
        params[site.dateColumn]='lte.'+windowEnd;
        const [health,articles]=await Promise.allSettled([
          timedFetch('https://'+site.domain,{method:'GET'}),
          timedFetch(site.url+'/rest/v1/articles?'+new URLSearchParams(params),{headers:{apikey:site.key,...(site.key.startsWith('eyJ')?{Authorization:'Bearer '+site.key}:{}),Prefer:'count=exact'}})
            .then(async r=>{if(!r.ok)throw new Error('Unavailable');const rows=await r.json();if(!Array.isArray(rows))throw new Error('Invalid response');const count=r.headers.get('content-range')?.split('/')[1];return {total:count&&/^\d+$/.test(count)?Number(count):null,rows:rows.map((a:Record<string,unknown>)=>({id:a.id,title:a.title,publishedAt:a[site.dateColumn],url:'https://'+site.domain+site.articlePath+encodeURIComponent(String(a.slug))}))};})
        ]);
        // Discard HTML; never persist page content or follow arbitrary database URLs.
        if(health.status==='fulfilled') await health.value.body?.cancel();
        return {name:site.name,domain:site.domain,checkedAt,siteStatus:health.status==='fulfilled'?health.value.status:null,articles:articles.status==='fulfilled'?articles.value:null,error:articles.status==='rejected'?'Published-story feed unavailable':null};
      }));
      return response(200,{...result,publishing,windowStart,windowEnd,checkedAt:new Date().toISOString(),source:'worker'});
    } catch {
      return response(503,{error:'Owner connection could not be verified. Try again.'});
    }
  };
}
