import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

export const workdir=resolve(process.env.SNAP_LOCAL_STACK_DIR??'');
assert.ok(process.env.SNAP_LOCAL_STACK_DIR&&workdir.endsWith('/snap-release-ci'),'Dedicated ephemeral stack required');
const config=await readFile(`${workdir}/supabase/config.toml`,'utf8');
assert.match(config,/project_id\s*=\s*"snap-release-ci"/);
export const status=JSON.parse(await readFile(`${workdir}/status.json`,'utf8'));
export const api=status.API_URL,anon=status.ANON_KEY,service=status.SERVICE_ROLE_KEY;
export const dbUrl=status.DB_URL;
const apiTarget=new URL(api),dbTarget=new URL(dbUrl);
assert.equal(apiTarget.origin,'http://127.0.0.1:54321','Only the dedicated loopback API is permitted');
assert.equal(dbTarget.hostname,'127.0.0.1');assert.equal(dbTarget.port,'54322');assert.equal(dbTarget.pathname,'/postgres');
assert.ok(typeof anon==='string'&&anon.length>32&&typeof service==='string'&&service.length>32&&anon!==service,'Local API credentials missing');
const require=createRequire(new URL('../release-stage/package.json',import.meta.url));
const {Client,types}=require('pg');
types.setTypeParser(1114,value=>value);types.setTypeParser(1184,value=>value);
export async function connect(){const c=new Client({connectionString:dbUrl});await c.connect();await c.query("SET search_path=public,extensions; SET statement_timeout='15s'");return c;}
export async function request(path,{token=anon,method='GET',body,headers={}}={}){
  assert.ok(path.startsWith('/')&&!path.startsWith('//'),'Relative local API path required');
  const response=await fetch(`${api}${path}`,{method,headers:{apikey:anon,Authorization:`Bearer ${token}`,'Content-Type':'application/json',...headers},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
  const raw=await response.text();let data;try{data=JSON.parse(raw);}catch{data=raw;}
  return {status:response.status,ok:response.ok,data};
}
export function success(response){assert.ok(response.ok,`Local API returned ${response.status}; code=${response.data?.code??response.data?.error_code??'unknown'}`);return response.data;}
export function denied(response){
  // A missing endpoint/schema-cache entry is not authorization evidence.
  assert.ok([401,403].includes(response.status),`Expected authorization denial, received ${response.status}`);
}
