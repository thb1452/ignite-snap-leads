import { useEffect, useState, useCallback } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { QueueRow } from '@/components/foia/va/QueueRow';
import { useFoiaAuth } from '@/lib/foia/hooks';
import { db } from '@/lib/foia/db';
import type { QueueItem, FoiaRequest, FoiaRequestStatus, PressAccount, Target } from '@/types/foia';
import { TARGET_TYPE_LABELS } from '@/types/foia';

const FLAGGED_KEY = 'foia_flagged_targets';

function loadFlagged(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(FLAGGED_KEY) || '[]'));
  } catch { return new Set(); }
}
function saveFlagged(s: Set<string>) {
  localStorage.setItem(FLAGGED_KEY, JSON.stringify([...s]));
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

export default function FoiaVAQueue() {
  const { profile } = useFoiaAuth();
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<FoiaRequestStatus | ''>('');
  const [filterState, setFilterState] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCredential, setFilterCredential] = useState('');
  const [flaggedIds, setFlaggedIds] = useState<Set<string>>(loadFlagged);

  const toggleFlag = useCallback((targetId: string) => {
    setFlaggedIds(prev => {
      const next = new Set(prev);
      if (next.has(targetId)) next.delete(targetId); else next.add(targetId);
      saveFlagged(next);
      return next;
    });
  }, []);

  const profileId = profile?.id;

  const fetchQueue = useCallback(async () => {
    if (!profileId) return;
    setLoading(true);
    try {
      const { data: assignments } = await db
        .from('foia_assignments')
        .select('target_id, target:targets(*)')
        .eq('va_id', profileId);

      if (!assignments || assignments.length === 0) {
        setItems([]);
        return;
      }

      const targetIds = assignments.map((a: any) => a.target_id);

      const latestRequestMap = new Map<string, FoiaRequest>();
      for (let i = 0; i < targetIds.length; i += 500) {
        const batch = targetIds.slice(i, i + 500);
        const { data: requests } = await db
          .from('foia_requests')
          .select('*')
          .eq('va_id', profileId)
          .in('target_id', batch);

        for (const req of (requests || []) as FoiaRequest[]) {
          const existing = latestRequestMap.get(req.target_id);
          if (!existing || new Date(req.updated_at) > new Date(existing.updated_at)) {
            latestRequestMap.set(req.target_id, req);
          }
        }
      }

      let activeCredential: PressAccount | undefined;
      const { data: activeSlot } = await db
        .from('va_credential_slots')
        .select('press_account_id')
        .eq('va_id', profileId)
        .eq('is_active', true)
        .single();

      if (activeSlot?.press_account_id) {
        const { data: pressData } = await db
          .from('press_accounts')
          .select('*')
          .eq('id', activeSlot.press_account_id)
          .single();
        if (pressData) activeCredential = pressData as PressAccount;
      }

      const queueItems: QueueItem[] = assignments
        .filter((a: any) => a.target)
        .map((a: any) => ({
          ...(a.target as Target),
          latest_request: latestRequestMap.get(a.target_id),
          press_account_this_month: activeCredential,
        }));

      // Sort: flagged first, then by staleness
      const flagged = loadFlagged();
      queueItems.sort((a, b) => {
        const aF = flagged.has(a.id) ? 0 : 1;
        const bF = flagged.has(b.id) ? 0 : 1;
        if (aF !== bF) return aF - bF;

        const aSent = a.latest_request?.sent_at;
        const bSent = b.latest_request?.sent_at;
        if (!aSent && !bSent) return a.jurisdiction_name.localeCompare(b.jurisdiction_name);
        if (!aSent) return -1;
        if (!bSent) return 1;
        const now = Date.now();
        const aAge = now - new Date(aSent).getTime();
        const bAge = now - new Date(bSent).getTime();
        const sixty = 60 * 86400000;
        const thirty = 30 * 86400000;
        const getScore = (age: number) => age > sixty ? 3 : age > thirty ? 2 : 1;
        return getScore(bAge) - getScore(aAge);
      });

      setItems(queueItems);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const handleSaved = (request: FoiaRequest) => {
    setItems(prev =>
      prev.map(item =>
        item.id === request.target_id ? { ...item, latest_request: request } : item
      )
    );
  };

  const filtered = items.filter((item) => {
    if (search && !item.jurisdiction_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterState && item.state !== filterState) return false;
    if (filterType && item.target_type !== filterType) return false;
    if (filterCredential && item.press_account_this_month?.id !== filterCredential) return false;
    if (filterStatus) {
      const itemStatus = item.latest_request?.status ?? 'pending';
      if (itemStatus !== filterStatus) return false;
    }
    return true;
  });

  const states = [...new Set(items.map(i => i.state))].sort();
  const credentials = items.reduce<Map<string, string>>((map, i) => {
    const pa = i.press_account_this_month;
    if (pa && !map.has(pa.id)) map.set(pa.id, pa.name);
    return map;
  }, new Map());

  return (
    <FoiaLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">My Queue</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {items.length.toLocaleString()} assigned targets · {filtered.length.toLocaleString()} shown
          </p>
        </div>

        <div className="flex flex-wrap gap-3 bg-white border border-slate-200 rounded-xl p-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search jurisdiction..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value as FoiaRequestStatus | '')} className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <option value="">All States</option>
            {states.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
            <option value="">All Types</option>
            {Object.entries(TARGET_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          {credentials.size > 0 && (
            <select value={filterCredential} onChange={(e) => setFilterCredential(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500">
              <option value="">All Credentials</option>
              {[...credentials.entries()].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
            </select>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 py-16 text-center text-slate-400">
            {items.length === 0
              ? 'No targets assigned yet. Ask your admin to assign you some targets.'
              : 'No targets match your filters.'}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(item => (
              <QueueRow
                key={item.id}
                item={item}
                vaId={profile!.id}
                onSaved={handleSaved}
                flagged={flaggedIds.has(item.id)}
                onToggleFlag={toggleFlag}
              />
            ))}
          </div>
        )}
      </div>
    </FoiaLayout>
  );
}
