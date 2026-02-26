import { useEffect, useState } from 'react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { InviteForm, InviteList } from '@/components/foia/admin/InviteForm';
import { useFoiaAuth } from '@/lib/foia/hooks';
import { supabase } from '@/integrations/supabase/client';
import type { FoiaInvite } from '@/types/foia';

const db = supabase as any;

export default function FoiaAdminInvite() {
  const { profile } = useFoiaAuth();
  const [invites, setInvites] = useState<FoiaInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvites = async () => {
    setLoading(true);
    const { data } = await db
      .from('foia_invites')
      .select('*')
      .order('created_at', { ascending: false });
    setInvites((data || []) as FoiaInvite[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchInvites();
  }, []);

  if (!profile) return null;

  return (
    <FoiaLayout>
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Invite Virtual Assistants</h1>
          <p className="text-slate-500 text-sm mt-1">Generate invite links for new VAs</p>
        </div>

        <InviteForm adminId={profile.id} onInviteCreated={fetchInvites} />
        <InviteList invites={invites} loading={loading} />
      </div>
    </FoiaLayout>
  );
}
