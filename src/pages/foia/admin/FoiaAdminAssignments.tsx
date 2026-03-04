import { useEffect, useState, useCallback } from 'react';
import { Loader2, Search, UserPlus, Shuffle } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { db } from '@/lib/foia/db';
import { useFoiaAuth } from '@/lib/foia/hooks';
import type { Target, FoiaProfile } from '@/types/foia';
import { TARGET_TYPE_LABELS } from '@/types/foia';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA',
  'KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ',
  'NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT',
  'VA','WA','WV','WI','WY'
];

/** Fisher-Yates shuffle — mutates in place */
function shuffleArray<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export default function FoiaAdminAssignments() {
  const { profile } = useFoiaAuth();
  const { toast } = useToast();
  const [targets, setTargets] = useState<(Target & { assigned_va_id: string | null })[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [vas, setVas] = useState<FoiaProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterAssigned, setFilterAssigned] = useState<'all' | 'unassigned' | 'assigned'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkVaId, setBulkVaId] = useState('');
  const [assignCount, setAssignCount] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 200;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data: vaData } = await db
        .from('foia_profiles')
        .select('*')
        .eq('role', 'va')
        .eq('is_active', true);
      setVas((vaData || []) as FoiaProfile[]);

      // Build base query for targets
      let query = db
        .from('targets')
        .select('*', { count: 'exact' })
        .eq('is_duplicate', false)
        .order('state')
        .order('jurisdiction_name')
        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

      if (filterState) query = query.eq('state', filterState);
      if (filterType) query = query.eq('target_type', filterType);
      if (search) query = query.ilike('jurisdiction_name', `%${search}%`);

      const { data: targetData, count } = await query;
      setTotalCount(count ?? 0);

      // Fetch ALL assignments (not paginated)
      const { data: assignments } = await db
        .from('foia_assignments')
        .select('target_id, va_id');

      const assignmentMap = new Map<string, string>();
      for (const a of (assignments || []) as Array<{ target_id: string; va_id: string }>) {
        assignmentMap.set(a.target_id, a.va_id);
      }

      const enriched = (targetData || []).map((t: Target) => ({
        ...t,
        assigned_va_id: assignmentMap.get(t.id) ?? null,
      }));

      let filtered = enriched;
      if (filterAssigned === 'unassigned') filtered = enriched.filter((t: any) => !t.assigned_va_id);
      if (filterAssigned === 'assigned') filtered = enriched.filter((t: any) => t.assigned_va_id);

      setTargets(filtered);
    } finally {
      setLoading(false);
    }
  }, [search, filterState, filterType, filterAssigned, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSelectAllPage = () => {
    if (selectedIds.size === targets.length && targets.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(targets.map((t) => t.id)));
    }
  };

  const handleSelectAllUnassigned = () => {
    const unassigned = targets.filter((t) => !t.assigned_va_id);
    setSelectedIds(new Set(unassigned.map((t) => t.id)));
  };

  const handleSelectCount = () => {
    const count = parseInt(assignCount, 10);
    if (!count || count <= 0) return;
    // Prefer unassigned targets first
    const unassigned = targets.filter((t) => !t.assigned_va_id);
    const pool = unassigned.length > 0 ? unassigned : targets;
    const toSelect = pool.slice(0, Math.min(count, pool.length));
    setSelectedIds(new Set(toSelect.map((t) => t.id)));
  };

  const handleBulkAssign = async () => {
    if (!bulkVaId || selectedIds.size === 0 || !profile) return;
    setAssigning(true);

    try {
      // Delete existing assignments for selected targets
      const selectedArr = Array.from(selectedIds);
      const DEL_BATCH = 500;
      for (let i = 0; i < selectedArr.length; i += DEL_BATCH) {
        await db
          .from('foia_assignments')
          .delete()
          .in('target_id', selectedArr.slice(i, i + DEL_BATCH));
      }

      // Shuffle target IDs randomly (Fisher-Yates) so assignments
      // aren't in alphabetical/sequential order
      const shuffled = shuffleArray([...selectedArr]);

      const inserts = shuffled.map((targetId) => ({
        target_id: targetId,
        va_id: bulkVaId,
        assigned_by: profile.id,
      }));

      const BATCH = 200;
      for (let i = 0; i < inserts.length; i += BATCH) {
        const { error } = await db.from('foia_assignments').insert(inserts.slice(i, i + BATCH));
        if (error) throw error;
      }

      toast({
        title: 'Assigned!',
        description: `${inserts.length.toLocaleString()} targets assigned (shuffled randomly)`,
      });

      setSelectedIds(new Set());
      setBulkVaId('');
      setAssignCount('');
      await fetchData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Assignment failed';
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setAssigning(false);
    }
  };

  const getVaName = (vaId: string) => vas.find((v) => v.id === vaId)?.full_name ?? 'Unknown';

  const unassignedOnPage = targets.filter((t) => !t.assigned_va_id).length;

  return (
    <FoiaLayout>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Assign Targets</h1>
          <p className="text-slate-500 text-sm mt-1">
            Bulk assign FOIA targets to VAs · {totalCount.toLocaleString()} total targets
          </p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 bg-white border border-slate-200 rounded-xl p-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search jurisdiction..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:border-blue-500"
            />
          </div>
          <select
            value={filterState}
            onChange={(e) => { setFilterState(e.target.value); setPage(0); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">All States</option>
            {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setPage(0); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="">All Types</option>
            {Object.entries(TARGET_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select
            value={filterAssigned}
            onChange={(e) => { setFilterAssigned(e.target.value as 'all' | 'unassigned' | 'assigned'); setPage(0); }}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">All</option>
            <option value="unassigned">Unassigned ({unassignedOnPage})</option>
            <option value="assigned">Assigned</option>
          </select>
        </div>

        {/* Selection helpers */}
        <div className="flex flex-wrap items-center gap-3 bg-white border border-slate-200 rounded-xl p-4">
          <button
            onClick={handleSelectAllUnassigned}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            Select All Unassigned
          </button>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              max={5000}
              value={assignCount}
              onChange={(e) => setAssignCount(e.target.value)}
              placeholder="# to select"
              className="w-32 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
            />
            <button
              onClick={handleSelectCount}
              disabled={!assignCount || parseInt(assignCount, 10) <= 0}
              className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-3 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-colors"
            >
              Select
            </button>
          </div>
          <span className="text-sm text-slate-400">
            {selectedIds.size > 0 ? `${selectedIds.size.toLocaleString()} selected` : 'No selection'}
          </span>
        </div>

        {/* Bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-5 py-3">
            <span className="text-blue-800 text-sm font-medium">
              {selectedIds.size.toLocaleString()} selected
            </span>
            <select
              value={bulkVaId}
              onChange={(e) => setBulkVaId(e.target.value)}
              className="border border-blue-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none"
            >
              <option value="">Choose VA to assign...</option>
              {vas.map((va) => (
                <option key={va.id} value={va.id}>{va.full_name}</option>
              ))}
            </select>
            <button
              onClick={handleBulkAssign}
              disabled={!bulkVaId || assigning}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
            >
              {assigning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Shuffle className="h-3.5 w-3.5" />}
              Assign (Shuffled)
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-blue-600 text-sm hover:text-blue-800"
            >
              Clear
            </button>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={selectedIds.size === targets.length && targets.length > 0}
                onChange={handleSelectAllPage}
                className="rounded"
              />
              <span className="text-slate-500">
                {targets.length.toLocaleString()} targets on this page
              </span>
            </div>
            <div className="divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
              {targets.map((target) => (
                <div
                  key={target.id}
                  className={cn(
                    'flex items-center gap-3 px-5 py-3 hover:bg-slate-50 cursor-pointer',
                    selectedIds.has(target.id) && 'bg-blue-50'
                  )}
                  onClick={() => handleToggleSelect(target.id)}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(target.id)}
                    onChange={() => handleToggleSelect(target.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 text-sm">{target.jurisdiction_name}</span>
                      <span className="text-xs text-slate-400">{target.state}</span>
                      <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                        {TARGET_TYPE_LABELS[target.target_type]}
                      </span>
                    </div>
                    {target.population && (
                      <p className="text-xs text-slate-400">Pop: {target.population.toLocaleString()}</p>
                    )}
                  </div>
                  <div className="text-right">
                    {target.assigned_va_id ? (
                      <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        {getVaName(target.assigned_va_id)}
                      </span>
                    ) : (
                      <span className="text-xs bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">
                        Unassigned
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {targets.length === 0 && (
                <div className="py-12 text-center text-slate-400 text-sm">No targets match your filters</div>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-500">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-50"
              >
                Previous
              </button>
              <span>Page {page + 1} · {PAGE_SIZE} per page</span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={targets.length < PAGE_SIZE}
                className="px-3 py-1 border border-slate-300 rounded disabled:opacity-40 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </FoiaLayout>
  );
}
