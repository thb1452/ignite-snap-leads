import { useEffect, useState } from 'react';
import { Bell, Check, RotateCw, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/foia/db';
import { cn } from '@/lib/utils';

interface RotationAlert {
  id: string;
  va_id: string;
  old_press_account_id: string | null;
  new_press_account_id: string | null;
  targets_assigned: number;
  reason: string;
  acknowledged: boolean;
  created_at: string;
  va_name?: string;
  old_credential_name?: string;
  new_credential_name?: string;
}

const REASON_LABELS: Record<string, string> = {
  batch_complete: 'Batch Complete',
  manual: 'Manual Rotation',
  cooldown_exhausted: 'Cooldown Exhausted',
  initial_assignment: 'Initial Assignment',
};

const REASON_COLORS: Record<string, string> = {
  batch_complete: 'bg-green-100 text-green-700',
  manual: 'bg-blue-100 text-blue-700',
  cooldown_exhausted: 'bg-orange-100 text-orange-700',
  initial_assignment: 'bg-purple-100 text-purple-700',
};

export function RotationAlertsPanel() {
  const [alerts, setAlerts] = useState<RotationAlert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAlerts();
  }, []);

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const { data } = await db
        .from('rotation_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);

      if (!data) { setAlerts([]); return; }

      // Enrich with names
      const vaIds = [...new Set(data.map((a: any) => a.va_id))];
      const credIds = [
        ...new Set([
          ...data.map((a: any) => a.old_press_account_id).filter(Boolean),
          ...data.map((a: any) => a.new_press_account_id).filter(Boolean),
        ]),
      ];

      const { data: vas } = await db.from('foia_profiles').select('id, full_name').in('id', vaIds);
      const vaMap = new Map((vas || []).map((v: any) => [v.id, v.full_name]));

      let credMap = new Map<string, string>();
      if (credIds.length > 0) {
        const { data: creds } = await db.from('press_accounts').select('id, name').in('id', credIds);
        credMap = new Map((creds || []).map((c: any) => [c.id, c.name]));
      }

      setAlerts(
        data.map((a: any) => ({
          ...a,
          va_name: vaMap.get(a.va_id) ?? 'Unknown',
          old_credential_name: a.old_press_account_id ? credMap.get(a.old_press_account_id) ?? null : null,
          new_credential_name: a.new_press_account_id ? credMap.get(a.new_press_account_id) ?? null : null,
        }))
      );
    } finally {
      setLoading(false);
    }
  };

  const handleAcknowledge = async (id: string) => {
    await db.from('rotation_alerts').update({ acknowledged: true }).eq('id', id);
    setAlerts((prev) => prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)));
  };

  const unacknowledgedCount = alerts.filter((a) => !a.acknowledged).length;

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="animate-pulse h-6 bg-slate-200 rounded w-1/3" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-slate-600" />
          <h3 className="font-semibold text-slate-900">Rotation Alerts</h3>
          {unacknowledgedCount > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              {unacknowledgedCount}
            </span>
          )}
        </div>
        <button
          onClick={fetchAlerts}
          className="text-slate-400 hover:text-slate-600 p-1"
        >
          <RotateCw className="h-4 w-4" />
        </button>
      </div>

      {alerts.length === 0 ? (
        <div className="py-8 text-center text-slate-400 text-sm">
          No rotation alerts yet
        </div>
      ) : (
        <div className="divide-y divide-slate-100 max-h-[400px] overflow-y-auto">
          {alerts.map((alert) => (
            <div
              key={alert.id}
              className={cn(
                'px-5 py-3 flex items-start gap-3',
                !alert.acknowledged && 'bg-amber-50'
              )}
            >
              <div className="pt-0.5">
                {alert.reason === 'cooldown_exhausted' ? (
                  <AlertTriangle className="h-4 w-4 text-orange-500" />
                ) : (
                  <RotateCw className="h-4 w-4 text-blue-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-900 text-sm">{alert.va_name}</span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full', REASON_COLORS[alert.reason] ?? 'bg-slate-100 text-slate-500')}>
                    {REASON_LABELS[alert.reason] ?? alert.reason}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  {alert.old_credential_name && (
                    <><span className="text-slate-400">{alert.old_credential_name}</span> → </>
                  )}
                  <span className="font-medium">{alert.new_credential_name ?? 'None'}</span>
                  {' · '}
                  {alert.targets_assigned.toLocaleString()} targets
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {new Date(alert.created_at).toLocaleString()}
                </p>
              </div>
              {!alert.acknowledged && (
                <button
                  onClick={() => handleAcknowledge(alert.id)}
                  className="text-slate-400 hover:text-green-600 p-1 flex-shrink-0"
                  title="Acknowledge"
                >
                  <Check className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
