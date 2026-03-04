import { useEffect, useState } from 'react';
import { Loader2, Shield, Users } from 'lucide-react';
import { db } from '@/lib/foia/db';
import type { FoiaProfile } from '@/types/foia';

interface CredentialSlot {
  id: string;
  va_id: string;
  press_account_id: string;
  slot_number: number;
  is_active: boolean;
  batch_number: number;
  press_name?: string;
}

interface VAWithSlots {
  va: FoiaProfile;
  slots: CredentialSlot[];
}

export function CredentialSlotsOverview() {
  const [data, setData] = useState<VAWithSlots[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSlots();
  }, []);

  const fetchSlots = async () => {
    setLoading(true);
    try {
      const { data: vas } = await db
        .from('foia_profiles')
        .select('*')
        .eq('role', 'va')
        .eq('is_active', true);

      const { data: slots } = await db
        .from('va_credential_slots')
        .select('*')
        .order('slot_number');

      const { data: pressAccounts } = await db
        .from('press_accounts')
        .select('id, name');

      const pressMap = new Map((pressAccounts || []).map((p: any) => [p.id, p.name]));

      const enrichedSlots = (slots || []).map((s: any) => ({
        ...s,
        press_name: pressMap.get(s.press_account_id) ?? 'Unknown',
      }));

      const grouped = (vas || []).map((va: any) => ({
        va,
        slots: enrichedSlots.filter((s: any) => s.va_id === va.id),
      }));

      setData(grouped);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-5 w-5 text-slate-600" />
          <h3 className="font-semibold text-slate-900">Credential Assignments</h3>
        </div>
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
        <Shield className="h-5 w-5 text-slate-600" />
        <h3 className="font-semibold text-slate-900">Credential Assignments</h3>
      </div>
      {data.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          No credential slots configured. Run Auto-Assign to set up.
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {data.map(({ va, slots }) => (
            <div key={va.id} className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-4 w-4 text-slate-400" />
                <span className="font-medium text-slate-900 text-sm">{va.full_name}</span>
              </div>
              <div className="flex gap-2">
                {slots.map((slot) => (
                  <div
                    key={slot.id}
                    className={`text-xs px-3 py-1.5 rounded-lg border ${
                      slot.is_active
                        ? 'bg-blue-50 border-blue-200 text-blue-700 font-medium'
                        : 'bg-slate-50 border-slate-200 text-slate-500'
                    }`}
                  >
                    <span className="text-[10px] text-slate-400 block">Slot {slot.slot_number}</span>
                    {slot.press_name}
                    {slot.is_active && <span className="ml-1 text-[10px]">●</span>}
                  </div>
                ))}
                {slots.length === 0 && (
                  <span className="text-xs text-slate-400">No credentials assigned</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
