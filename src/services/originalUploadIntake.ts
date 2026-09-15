import { supabase } from '@/integrations/supabase/externalClient';
import { IntakeError, productionOriginalIntakeEnabled, readReservation, saveOriginal, recoverOriginal, recoverOriginalByJob,
  type OriginalIdentity, type OriginalClient, type Inspection } from '../../supabase/functions/_shared/originalIntake';

// The shared retention contract lives in the existing project, outside the UI.
// This adapter supplies owner RPCs and the one supported byte-preserving endpoint.
type Reply = { data: unknown; error: unknown };
type BrowserClient = {
  auth: { getUser(): PromiseLike<{ data: { user: { id: string; is_anonymous?: boolean } | null }; error: unknown }> };
  rpc(name: string, args: Record<string, unknown>): PromiseLike<Reply>;
  functions: { invoke(name: string, options: { method: 'POST'; headers: Record<string,string>; body?: ArrayBuffer }): PromiseLike<Reply> };
};
export { IntakeError };
export const originalIntakeEnabled = productionOriginalIntakeEnabled;
export function createOriginalUploadService(client: BrowserClient, enabled=productionOriginalIntakeEnabled) {
  async function bounded<T>(value:PromiseLike<T>):Promise<T>{
    let timer:ReturnType<typeof setTimeout>;
    try{return await Promise.race([Promise.resolve(value),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new IntakeError('unconfirmed')),35000);})]);}
    finally{clearTimeout(timer!);}
  }
  async function currentOwner() {
    const r=await bounded(client.auth.getUser());
    if(r.error||!r.data.user||r.data.user.is_anonymous===true)throw new IntakeError('owner_changed');
    return r.data.user.id;
  }
  async function rpc(name:string,args:Record<string,unknown>) {
    const r=await bounded(client.rpc(name,args));if(r.error)throw new IntakeError('unconfirmed');return r.data;
  }
  async function endpoint(action:'inspect'|'retain',identity:OriginalIdentity,job:string,bytes?:Uint8Array):Promise<Inspection> {
    const response=await bounded(client.functions.invoke('original-intake',{method:'POST',headers:{
      'x-original-action':action,'x-original-job':job,'x-original-sha256':identity.sha256,
      'x-original-bytes':String(identity.bytes),'content-type':'application/octet-stream',
    },...(bytes?{body:bytes.slice().buffer}:{})}));
    if(response.error) {
      let code:unknown;
      // SDK HTTP error bodies are untrusted: retain only the documented code.
      try {const context=(response.error as {context?:Response}).context;if(context instanceof Response)code=(await context.clone().json()).code;} catch {}
      if(code==='held'||code==='revoked'||code==='binding_conflict'||code==='owner_changed')throw new IntakeError(code,job);
      throw new IntakeError('unconfirmed',job);
    }
    const value=response.data as Inspection & {version?:string};
    if(!value||value.version!=='original-intake-v1'||value.processingRequested!==false||!['absent','matching'].includes(value.presence)
      ||value.originalSaved!==(value.presence==='matching'))throw new IntakeError('binding_conflict',job);
    const reservation=readReservation(value.reservation,identity,job);
    return{reservation,presence:value.presence,originalSaved:value.originalSaved,processingRequested:false};
  }
  const ports:OriginalClient & {readJob(job:string):Promise<unknown>}={currentOwner,writesEnabled:enabled,
    lookup:i=>rpc('fn_lookup_original_intake_v1',{p_sha256:i.sha256,p_bytes:i.bytes}),
    reserve:(i,requestId,filename)=>rpc('fn_reserve_original_intake_v1',{p_request_id:requestId,p_sha256:i.sha256,p_bytes:i.bytes,p_filename:filename}),
    readJob:job=>rpc('fn_read_original_intake_v1',{p_job:job}),
    inspect:(i,job)=>endpoint('inspect',i,job),retain:(i,job,bytes)=>endpoint('retain',i,job,bytes),
  };
  async function bytes(file:File){
    if(!file.name.toLowerCase().endsWith('.csv')||file.size<1||file.size>15728640)throw new IntakeError('invalid_input');
    const value=new Uint8Array(await file.arrayBuffer());if(value.byteLength!==file.size)throw new IntakeError('invalid_input');return value;
  }
  return{
    save:async(owner:string,file:File)=>{if(!enabled())throw new IntakeError('held');return saveOriginal(ports,owner,await bytes(file),file.name,crypto.randomUUID());},
    checkFile:async(owner:string,file:File)=>recoverOriginal(ports,owner,await bytes(file)),
    checkJob:(owner:string,job:string)=>recoverOriginalByJob(ports,owner,job),
  };
}
export const originalUploadService=createOriginalUploadService(supabase as unknown as BrowserClient);
