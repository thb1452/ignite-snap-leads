import { useEffect, useState } from 'react';
import { Loader2, Search } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { useFoiaAuth } from '@/lib/foia/hooks';
import { db } from '@/lib/foia/db';
import type { FoiaRequest, FoiaRequestStatus } from '@/types/foia';
import { STATUS_LABELS, STATUS_COLORS } from '@/types/foia';
import { cn } from '@/lib/utils';


interface HistoryItem extends Omit<FoiaRequest, 'target' | 'press_account'> {
  target?: { jurisdiction_name: string; state: string; target_type: string };
  press_account?: { name: string };
}

const STATUS_OPTIONS: Array<{ value: FoiaRequestStatus | ''; label: string }> = [
  { value: '', label: 'All Statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'sent', label: 'Sent' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'no_portal', label: 'No Portal' },
  { value: 'needs_review', label: 'Needs Review' },
];

export default function FoiaVAHistory() {
  const { profile } = useFoiaAuth();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FoiaRequestStatus | ''>('');

  useEffect(() => {
    if (!profile) return;

    const fetchHistory = async () => {
      setLoading(true);
      try {
        const { data } = await db
          .from('foia_requests')
          .select(`
            *,
            target:targets(jurisdiction_name, state, target_type),
            press_account:press_accounts(name)
          `)
          .eq('va_id', profile.id)
          .order('updated_at', { ascending: false });

        setItems((data || []) as HistoryItem[]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [profile]);

  const filtered = items.filter((item) => {
    if (filterStatus && item.status !== filterStatus) return false;
    if (search) {
      const name = item.target?.jurisdiction_name?.toLowerCase() ?? '';
      if (!name.includes(search.toLowerCase())) return false;
    }
    return true;
  });

  return (
    <FoiaLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Request History</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            All {items.length.toLocaleString()} FOIA requests you've logged
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jurisdiction..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as FoiaRequestStatus | '')}
            className="bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400 text-sm">
            No requests yet. Start working through your queue!
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Jurisdiction</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">State</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Press Account</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Sent</th>
                  <th className="text-left px-5 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-900">
                      {item.target?.jurisdiction_name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-500">{item.target?.state ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={cn('text-xs px-2 py-0.5 rounded-full', STATUS_COLORS[item.status])}>
                        {STATUS_LABELS[item.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{item.press_account?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-500">
                      {item.sent_at
                        ? new Date(item.sent_at).toLocaleDateString()
                        : '—'}
                    </td>
                    <td className="px-5 py-3 text-slate-500 max-w-[200px] truncate">
                      {item.notes ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </FoiaLayout>
  );
}
