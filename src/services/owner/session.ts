import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { ownerClient } from './client';
export function useOwnerSession() {
  const [user,setUser]=useState<User|null>(null);
  const [loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true;
    const { data: { subscription } }=ownerClient.auth.onAuthStateChange((_event,session)=>{
      if(active){setUser(session?.user??null);setLoading(false);}
    });
    ownerClient.auth.getSession().then(({data})=>{if(active){setUser(data.session?.user??null);setLoading(false);}});
    return ()=>{active=false;subscription.unsubscribe();};
  },[]);
  return {user,loading};
}
