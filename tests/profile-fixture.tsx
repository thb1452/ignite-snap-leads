import React,{createContext,useContext,useState} from 'react';
const A='00000000-0000-4000-8000-000000000001',B='00000000-0000-4000-8000-000000000002';
const PA='00000000-0000-4000-8000-000000000003',PB='00000000-0000-4000-8000-000000000005';
const ORG='00000000-0000-4000-8000-000000000004',at='2026-09-08T00:00:00Z';
const scenario=new URLSearchParams(location.search).get('scenario')||'ready';
let currentId=A;
const user=(id:string)=>({id,email:id===A?'a@example.invalid':'b@example.invalid',email_confirmed_at:scenario==='unverified'?null:at,is_anonymous:false});
let profiles=[{id:PA,user_id:A,org_id:ORG,full_name:'Synthetic Alpha',created_at:at},
 {id:PB,user_id:B,org_id:ORG,full_name:'Synthetic Beta',created_at:at}];
if(scenario==='missing')profiles=[];
if(scenario==='duplicate')profiles.push({...profiles[0],id:'00000000-0000-4000-8000-000000000009'});
const calls:unknown[]=[];
const context=createContext({user:user(A),loading:false,emailVerified:true,resendVerificationEmail:async()=>({error:null})});
export function FixtureAuthProvider({children}:{children:React.ReactNode}){
 const [id,setId]=useState(A);
 Object.assign(window,{profileFixture:{calls,switchUser:()=>{currentId=B;setId(B);}}});
 return <context.Provider value={{user:user(id),loading:false,emailVerified:scenario!=='unverified',resendVerificationEmail:async()=>{calls.push(['resend']);return {error:null};}}}>{children}</context.Provider>;
}
export const useAuth=()=>useContext(context);
export const supabase={
 auth:{
  getUser:async()=>{calls.push(['auth',currentId]);return {data:{user:user(currentId)},error:null};},
  resetPasswordForEmail:async(email:string,options:unknown)=>{calls.push(['reset',email,options]);return {data:{},error:null};},
 },
 from(table:string){
  const filters:Record<string,string>={};let cap=2,payload:Record<string,string>|null=null;
  const query={
   select(fields:string){calls.push(['select',table,fields]);return query;},
   eq(key:string,value:string){filters[key]=value;return query;},
   limit(n:number){cap=n;return query;},
   update(values:Record<string,string>){payload=values;return query;},
   then(resolve:(r:unknown)=>unknown,reject:(e:unknown)=>unknown){
    calls.push([payload?'update':'read',table,{...filters},cap,payload]);
    if(table==='profiles'){
     let rows=profiles.filter(p=>Object.entries(filters).every(([k,v])=>p[k as keyof typeof p]===v));
     if(payload){rows.forEach(p=>{p.full_name=payload!.full_name;});return Promise.resolve({data:rows.map(p=>({id:p.id})),error:null}).then(resolve,reject);}
     return Promise.resolve({data:rows.slice(0,cap).map(p=>({...p})),error:null}).then(resolve,reject);
    }
    if(table==='organizations')return Promise.resolve({data:scenario==='organization_missing'?[]:[{id:ORG,name:'Synthetic organization'}],error:null}).then(resolve,reject);
    return Promise.resolve({data:[],error:null}).then(resolve,reject);
   },
  };
  return query;
 },
};
