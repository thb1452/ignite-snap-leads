import React, { createContext, useContext, useState } from 'react';

const A='00000000-0000-4000-8000-000000000001';
const B='00000000-0000-4000-8000-000000000002';
const Auth=createContext<{user:{id:string}|null}>({user:{id:A}});
const calls: unknown[][]=[];
export function FixtureAuthProvider({children}:{children:React.ReactNode}) {
  const [user,setUser]=useState<{id:string}|null>({id:A});
  Object.assign(window,{checkoutFixture:{calls,switchUser:()=>setUser({id:B}),signOut:()=>setUser(null)}});
  return <Auth.Provider value={{user}}>{children}</Auth.Provider>;
}
export const useAuth=()=>useContext(Auth);
export const supabase={
  functions:{invoke:async(...args:unknown[])=>{calls.push(['invoke',...args]);return {data:{fulfilled:true,synced:true,credits:5000},error:null};}},
  from(table:string){
    calls.push(['from',table]);
    const query={select(){return query;},eq(){return query;},then(resolve:(r:unknown)=>unknown){return Promise.resolve({count:0,error:null}).then(resolve);}};
    return query;
  },
};
export const useToast=()=>({toast:(value:unknown)=>calls.push(['toast',value])});
export const PlanUsageSection=()=> <div>Plan and usage placeholder</div>;
export const NotificationsSection=()=>null;
export const AccountDetailsSection=()=>null;
export const PrivacySection=()=>null;
export const HelpSection=()=>null;
export const MarketRequestSection=()=>null;
