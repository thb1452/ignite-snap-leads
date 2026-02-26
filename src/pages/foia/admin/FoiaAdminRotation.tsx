import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, Calendar } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { RotationMap } from '@/components/foia/admin/RotationMap';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentMonth, generateMonthlyRotation, getPriorMonths } from '@/lib/foia/rotation';
import type { PressAccount, PressRotation } from '@/types/foia';

const db = supabase as any;

interface RotationRowData {
  target_id: string;
  jurisdiction_name: string;
  state: string;
  current: PressRotation | null;
  history: PressRotation[];
}

export default function FoiaAdminRotation() {
  const currentMonth = getCurrentMonth();
  const [rows, setRows] = useState<RotationRowData[]>([]);
  const [pressAccounts, setPressAccounts] = useState<PressAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generateProgress, setGenerateProgress] = useState({ done: 0, total: 0 });
  const [generateResult, setGenerateResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: accounts } = await db
        .from('press_accounts')
        .select('*')
        .eq('is_active', true)
        .order('name');
      setPressAccounts((accounts || []) as PressAccount[]);

      const { data: targets } = await db
        .from('targets')
        .select('id, jurisdiction_name, state')
        .not('foia_url', 'is', null)
        .eq('is_duplicate', false)
        .order('state')
        .limit(500);

      if (!targets || targets.length === 0) {
        setRows([]);
        return;
      }

      const targetIds = targets.map((t: any) => t.id);

      const { data: currentRotations } = await db
        .from('press_rotation')
        .select('*, press_account:press_accounts(*)')
        .eq('rotation_month', currentMonth)
        .in('target_id', targetIds);

      const priorMonths = getPriorMonths(currentMonth, 3);
      const { data: historyData } = await db
        .from('press_rotation')
        .select('*, press_account:press_accounts(*)')
        .in('rotation_month', priorMonths)
        .in('target_id', targetIds)
        .order('rotation_month', { ascending: false });

      const currentMap = new Map<string, PressRotation>();
      for (const r of (currentRotations || []) as PressRotation[]) {
        currentMap.set(r.target_id, r);
      }

      const historyMap = new Map<string, PressRotation[]>();
      for (const r of (historyData || []) as PressRotation[]) {
        if (!historyMap.has(r.target_id)) historyMap.set(r.target_id, []);
        historyMap.get(r.target_id)!.push(r);
      }

      const rowData: RotationRowData[] = targets.map((t: any) => ({
        target_id: t.id,
        jurisdiction_name: t.jurisdiction_name,
        state: t.state,
        current: currentMap.get(t.id) ?? null,
        history: historyMap.get(t.id) ?? [],
      }));

      setRows(rowData);
    } catch (err) {
      console.error('Failed to load rotation data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    setGenerateResult(null);
    try {
      const nextMonth = getNextMonth(currentMonth);
      const result = await generateMonthlyRotation(
        nextMonth,
        (done, total) => setGenerateProgress({ done, total })
      );
      setGenerateResult(result);
      await fetchData();
    } catch (err) {
      console.error('Generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  function getNextMonth(month: string): string {
    const [year, m] = month.split('-').map(Number);
    const d = new Date(year, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  const nextMonth = getNextMonth(currentMonth);
  const alreadyGenerated = rows.some((r) => r.current !== null);

  return (
    <FoiaLayout>
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Press Rotation</h1>
            <p className="text-slate-500 text-sm mt-1">
              Monthly press account assignments with cooldown enforcement
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-slate-500 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2">
              <Calendar className="h-4 w-4" />
              Current: <strong className="text-slate-700">{currentMonth}</strong>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
            >
              {generating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Generate {nextMonth} Rotation
            </button>
          </div>
        </div>

        {generating && generateProgress.total > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3">
            <div className="flex items-center gap-3 text-blue-800 text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              Generating rotation... {generateProgress.done.toLocaleString()} / {generateProgress.total.toLocaleString()}
            </div>
          </div>
        )}

        {generateResult && (
          <div className="bg-green-50 border border-green-200 rounded-lg px-5 py-3 text-sm text-green-800">
            Rotation generated for {nextMonth}: <strong>{generateResult.created.toLocaleString()}</strong> created,{' '}
            <strong>{generateResult.skipped.toLocaleString()}</strong> skipped (already existed),{' '}
            <strong>{generateResult.errors}</strong> errors
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 text-sm text-blue-700">
          <strong>Algorithm:</strong> Each target gets a different press account each month.
          Cooldown = {pressAccounts.length || 5} months (one per account). Oldest assignment wins when all accounts in cooldown.
        </div>

        <RotationMap
          rows={rows}
          pressAccounts={pressAccounts}
          currentMonth={currentMonth}
          loading={loading}
          onRefresh={fetchData}
        />
      </div>
    </FoiaLayout>
  );
}
