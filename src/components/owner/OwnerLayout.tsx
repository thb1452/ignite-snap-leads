import type { ReactNode } from 'react';
import { ShieldCheck, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ownerClient } from '@/services/owner/client';
import { useOwnerSession } from '@/services/owner/session';
export function OwnerLayout({children}:{children:ReactNode}){
  const {user}=useOwnerSession();
  return <div className="min-h-screen bg-slate-50 text-slate-950">
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b bg-white px-5 py-3">
      <span className="font-bold">SNAP <span className="text-emerald-500">ϟ</span> ignite</span>
      <div className="flex max-w-full items-center gap-3"><span className="max-w-[190px] truncate text-xs">{user?.email}</span><Button size="sm" variant="ghost" onClick={()=>ownerClient.auth.signOut()}><LogOut className="mr-2 h-4 w-4" />Sign out</Button></div>
    </header>
    <aside className="fixed bottom-0 left-0 top-14 hidden w-[220px] bg-slate-900 p-3 text-slate-200 md:block">
      <div className="mt-5 flex items-center gap-2 rounded-lg bg-white/10 px-3 py-3 text-sm font-medium"><ShieldCheck className="h-4 w-4" />Owner dashboard</div>
      <p className="px-3 pt-6 text-xs leading-5 text-slate-400">Your agents, records, and news outlets.<br />Connected to the worker database.</p>
    </aside>
    <main className="md:ml-[220px]">{children}</main>
  </div>;
}
