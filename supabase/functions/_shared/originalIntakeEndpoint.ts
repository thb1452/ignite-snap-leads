import { IntakeError, inspectOriginal, retainOriginal, productionOriginalIntakeEnabled, type OriginalTransport } from './originalIntake.ts';

const headers = { 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'POST, OPTIONS',
  'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info, x-original-action, x-original-job, x-original-sha256, x-original-bytes',
  'Content-Type':'application/json' };
const respond = (status:number,body:unknown) => new Response(JSON.stringify(body),{status,headers});
export function createOriginalIntakeEndpoint(factory:(request:Request,signal:AbortSignal)=>Promise<OriginalTransport>,
  gate:()=>boolean=productionOriginalIntakeEnabled) {
  return async (request:Request):Promise<Response> => {
    if(request.method==='OPTIONS') return new Response(null,{headers});
    if(request.method!=='POST') return respond(405,{code:'method_not_allowed',processingRequested:false});
    const action=request.headers.get('x-original-action');
    if(action!=='inspect'&&action!=='retain') return respond(400,{code:'invalid_input',processingRequested:false});
    // This production default stops write requests before body/config/Auth/DB/Storage.
    if(action==='retain'&&!gate()) return respond(503,{code:'held',newBytesSaved:false,presence:'not_checked',processingRequested:false});
    const controller=new AbortController();let expire:()=>void=()=>{};
    const deadline=new Promise<never>((_,reject)=>{expire=()=>{controller.abort();reject(new IntakeError('unconfirmed'));};});
    const timer=setTimeout(expire,30000),cancel=()=>expire();
    request.signal.addEventListener('abort',cancel,{once:true});
    if(request.signal.aborted)controller.abort();
    const check=()=>{if(controller.signal.aborted)throw new IntakeError('unconfirmed');};
    const bounded=async<T>(p:PromiseLike<T>)=>{check();const result=await Promise.race([Promise.resolve(p),deadline]);check();return result;};
    try {
      check();const authorization=request.headers.get('authorization')??'';
      if(!/^Bearer [^\s]+$/.test(authorization))return respond(401,{code:'owner_required',processingRequested:false});
      const job=request.headers.get('x-original-job')??'',sha=request.headers.get('x-original-sha256')??'',size=request.headers.get('x-original-bytes')??'';
      if(!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(job)||!/^[a-f0-9]{64}$/.test(sha)||!/^[1-9][0-9]{0,7}$/.test(size)||Number(size)>15728640)throw new IntakeError('invalid_input');
      const raw=await bounded(factory(request,controller.signal));
      const guarded=async<T>(action:()=>PromiseLike<T>):Promise<T>=>{check();return bounded(action());};
      const ports:OriginalTransport={
        writesEnabled:()=>!controller.signal.aborted&&raw.writesEnabled(),
        currentOwner:()=>guarded(()=>raw.currentOwner()),
        readProof:(...args)=>guarded(()=>raw.readProof(...args)),
        getObject:(...args)=>guarded(()=>raw.getObject(...args)),
        putObject:(...args)=>guarded(()=>raw.putObject(...args)),
        appendVerification:(...args)=>guarded(()=>raw.appendVerification(...args)),
      };
      const owner=await bounded(ports.currentOwner()),identity={owner,sha256:sha,bytes:Number(size)};
      let result;
      if(action==='inspect') {
        const reader=request.body?.getReader();
        if(reader)try {for(;;){const part=await bounded(reader.read());if(part.done)break;if(part.value.byteLength!==0)throw new IntakeError('invalid_input',job);}}
        finally{void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}

        result=await bounded(inspectOriginal(ports,identity,job));
      } else {
        if(request.headers.get('content-type')!=='application/octet-stream')throw new IntakeError('invalid_input',job);
        const length=request.headers.get('content-length');if(length!==null&&Number(length)!==identity.bytes)throw new IntakeError('invalid_input',job);
        // Read with a bound before allocating an unbounded arrayBuffer.
        const reader=request.body?.getReader();if(!reader)throw new IntakeError('invalid_input',job);
        const original=new Uint8Array(identity.bytes);let offset=0;
        try {for(;;){const part=await bounded(reader.read());if(part.done)break;if(offset+part.value.byteLength>original.byteLength)throw new IntakeError('invalid_input',job);original.set(part.value,offset);offset+=part.value.byteLength;}}finally{void reader.cancel().catch(()=>{});try{reader.releaseLock();}catch{}}
        if(offset!==original.byteLength)throw new IntakeError('invalid_input',job);
        result=await bounded(retainOriginal({...ports,writesEnabled:()=>gate()&&ports.writesEnabled()},identity,job,original));
      }
      check();return respond(200,{version:'original-intake-v1',...result});
    } catch(error) {
      const e=error instanceof IntakeError?error:new IntakeError('unconfirmed');
      const status=e.code==='owner_changed'?401:e.code==='invalid_input'?400:e.code==='binding_conflict'||e.code==='revoked'?409:503;
      return respond(status,{version:'original-intake-v1',code:e.code,jobId:e.jobId,error:e.message,processingRequested:false});
    } finally {clearTimeout(timer);request.signal.removeEventListener('abort',cancel);controller.abort();}
  };
}
