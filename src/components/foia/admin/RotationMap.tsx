import { useState } from 'react';
import { Loader2, RefreshCw, Edit2, Check, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { PressAccount, PressRotation } from '@/types/foia';

interface RotationRowData {
  target_id: string;
  jurisdiction_name: string;
  state: string;
  current: PressRotation | null;
  history: PressRotation[]; // last 3 months
}

interface RotationMapProps {
  rows: RotationRowData[];
  pressAccounts: PressAccount[];
  currentMonth: string;
  loading: boolean;
  onRefresh: () => void;
}

export function RotationMap({ rows, pressAccounts, currentMonth, loading, onRefresh }: RotationMapProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [saving, setSaving] = useState(false);

  const handleEdit = (targetId: string, currentAccountId: string) => {
    setEditingId(targetId);
    setEditValue(currentAccountId);
  };

  const handleSave = async (targetId: string) => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('press_rotation')
        .upsert(
          { target_id: targetId, press_account_id: editValue, rotation_month: currentMonth },
          { onConflict: 'target_id,rotation_month' }
        );
      if (!error) {
        setEditingId(null);
        onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-slate-900">Press Rotation — {currentMonth}</h3>
          <p className="text-slate-400 text-xs mt-0.5">
            {rows.length.toLocaleString()} targets
          </p>
        </div>
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </button>
      </div>

      {rows.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">
          No rotation generated yet for {currentMonth}
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Jurisdiction</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">State</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">This Month</th>
                <th className="text-left px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Last 3 Months</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row) => (
                <tr key={row.target_id} className="hover:bg-slate-50">
                  <td className="px-6 py-2.5 text-slate-900 font-medium">{row.jurisdiction_name}</td>
                  <td className="px-4 py-2.5 text-slate-500">{row.state}</td>
                  <td className="px-4 py-2.5">
                    {editingId === row.target_id ? (
                      <div className="flex items-center gap-2">
                        <select
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          className="border border-blue-300 rounded px-2 py-1 text-xs focus:outline-none"
                        >
                          {pressAccounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.name}</option>
                          ))}
                        </select>
                        <button onClick={() => handleSave(row.target_id)} disabled={saving}>
                          <Check className="h-4 w-4 text-green-600" />
                        </button>
                        <button onClick={() => setEditingId(null)}>
                          <X className="h-4 w-4 text-slate-400" />
                        </button>
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        row.current ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                      }`}>
                        {row.current?.press_account?.name ?? 'Not assigned'}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex gap-1">
                      {row.history.map((h) => (
                        <span key={h.id} className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded" title={h.rotation_month}>
                          {h.press_account?.name?.charAt(0) ?? '?'}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    {editingId !== row.target_id && (
                      <button
                        onClick={() => handleEdit(row.target_id, row.current?.press_account_id ?? '')}
                        className="text-slate-400 hover:text-slate-600"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
