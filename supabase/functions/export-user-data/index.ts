import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { collectCrmExport, exportRows, type ExportClient } from '../_shared/accountExport.ts';
const corsHeaders={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version'};
serve(async(req)=>{
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return new Response(JSON.stringify({error:'Method not allowed'}),{status:405,headers:{...corsHeaders,'Content-Type':'application/json'}});
  try{
    const authorization=req.headers.get('Authorization');
    if(!authorization?.startsWith('Bearer '))return new Response(JSON.stringify({error:'Sign in required'}),{status:401,headers:{...corsHeaders,'Content-Type':'application/json'}});
    // The JWT remains on every data query: tenant RLS and source holds apply.
    const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error}=await client.auth.getUser();
    if(error||!user)return new Response(JSON.stringify({error:'Session expired. Sign in again.'}),{status:401,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const db=client as unknown as ExportClient;
    const own=(column='user_id')=>(q:ReturnType<ExportClient['from']> extends {select:(s:string)=>infer Q}?Q:never)=>q.eq(column,user.id);
    const [profile,lists,listProperties,activity,preferences,templates,calls,credits,uploads,crm]=await Promise.all([
      exportRows(db,'profiles','email,full_name,created_at',own(),'user_id'),
      exportRows(db,'lead_lists','id,name,created_at',own()),
      exportRows(db,'list_properties','id,added_at,property_id',own('created_by')),
      exportRows(db,'lead_activity','id,status,notes,created_at,updated_at',own()),
      exportRows(db,'email_preferences','weekly_digest_enabled,digest_day,digest_hour,timezone,created_at',own(),'user_id'),
      exportRows(db,'email_templates','id,name,subject,content,is_default,created_at',own()),
      exportRows(db,'call_logs','id,phone_number,call_type,status,duration,notes,created_at',own()),
      exportRows(db,'credit_ledger','id,delta,reason,created_at',own()),
      exportRows(db,'upload_jobs','id,filename,file_size,status,total_rows,processed_rows,properties_created,violations_created,created_at,finished_at',own()),
      collectCrmExport(db,user.id),
    ]);
    const archive={exported_at:new Date().toISOString(),export_note:'Private account and CRM work. Source evidence has separate release permissions and is not included. Each category was paginated; errors return no partial archive.',user:{email:user.email,created_at:user.created_at,email_verified:!!user.email_confirmed_at},profile,lead_lists:lists,list_properties:listProperties,lead_activity:activity,email_preferences:preferences,email_templates:templates,call_logs:calls,credit_transactions:credits,upload_history:uploads,crm};
    return new Response(JSON.stringify(archive,null,2),{status:200,headers:{...corsHeaders,'Content-Type':'application/json','Content-Disposition':`attachment; filename="snap-account-export-${new Date().toISOString().slice(0,10)}.json"`}});
  }catch(error){
    console.error('Account export failed',error instanceof Error?error.message:'Unknown export error');
    return new Response(JSON.stringify({error:'Your complete archive could not be prepared. Retry or contact support; no partial archive was returned.'}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}});
  }
});
