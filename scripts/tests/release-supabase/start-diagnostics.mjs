import {open} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

// Output only fixed categories. Supabase logs can contain local credentials;
// never print matching lines, exception text, paths, or arbitrary captured values.
export function startupFailureCategories(log){
  const rules=[
    ['missing_module',/module not found|cannot find module|failed to resolve.*(?:import|module)|could not resolve|module.*not found/i],
    ['container_unhealthy',/unhealthy|health.?check.*fail|container.*(?:not running|exited)|failed to start container/i],
    ['image_pull',/(?:pull|download).*(?:image|manifest).*(?:fail|error|denied)|(?:error|failed).*pull|manifest unknown/i],
    ['rate_limit',/rate.?limit|too many requests|toomanyrequests/i],
    ['network_timeout',/timed? ?out|i\/o timeout|context deadline exceeded|tls handshake timeout/i],
    ['network_connection',/connection refused|no such host|network is unreachable|temporary failure in name resolution/i],
    ['disk_space',/no space left on device|disk quota exceeded/i],
    ['port_conflict',/port is already allocated|address already in use/i],
    ['docker_unavailable',/cannot connect to the docker daemon|docker.*(?:not found|not running)|permission denied.*docker/i],
    ['configuration',/invalid config|failed to parse.*config|unsupported config|unknown (?:field|key)/i],
  ];
  const categories=rules.filter(([,pattern])=>pattern.test(log)).map(([label])=>label);
  return categories.length?categories:['unclassified'];
}

export async function reportStartupFailure(path){
  let file;
  try{
    file=await open(path,'r');
    const {size}=await file.stat(),limit=1024*1024;
    const first=Buffer.alloc(Math.min(size,limit));await file.read(first,0,first.length,0);
    const last=Buffer.alloc(size>limit?Math.min(size-limit,limit):0);
    if(last.length)await file.read(last,0,last.length,size-last.length);
    console.log(`Supabase startup failure categories: ${startupFailureCategories(first.toString()+'\n'+last.toString()).join(', ')}`);
  }catch{console.log('Supabase startup failure categories: diagnostic_unavailable');}
  finally{await file?.close().catch(()=>{});}
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await reportStartupFailure(process.argv[2]);
