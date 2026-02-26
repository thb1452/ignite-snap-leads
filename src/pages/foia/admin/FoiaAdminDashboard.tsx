import { useEffect, useState } from 'react';
import { Database, Send, Clock, Users, CheckCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { VABreakdownTable } from '@/components/foia/admin/VABreakdownTable';
import type { AdminStats, VABreakdown, FoiaProfile } from '@/types/foia';

const db = supabase as any;

function StatCard({ icon: Icon, label, value, color }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3">
        <div className={`p-2.5 rounded-lg ${color}`}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-slate-500 text-sm">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{value.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

export default function FoiaAdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      setLoading(true);
      try {
        const { count: totalTargets } = await db
          .from('targets')
          .select('*', { count: 'exact', head: true })
          .eq('is_duplicate', false);

        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const { count: requestsToday } = await db
          .from('foia_requests')
          .select('*', { count: 'exact', head: true })
          .gte('sent_at', todayStart.toISOString());

        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);
        const { count: requestsThisWeek } = await db
          .from('foia_requests')
          .select('*', { count: 'exact', head: true })
          .gte('sent_at', weekStart.toISOString());

        const { data: targetsWithRequests } = await db
          .from('foia_requests')
          .select('target_id');
        const assignedTargetIds = new Set((targetsWithRequests || []).map((r: any) => r.target_id));
        const pendingTargets = (totalTargets ?? 0) - assignedTargetIds.size;

        const { data: vas } = await db
          .from('foia_profiles')
          .select('*')
          .eq('role', 'va')
          .eq('is_active', true);

        const breakdowns: VABreakdown[] = [];

        for (const va of (vas || []) as FoiaProfile[]) {
          const { data: allRequests } = await db
            .from('foia_requests')
            .select('status, sent_at')
            .eq('va_id', va.id);

          const all = allRequests || [];
          const todayReqs = all.filter((r: any) =>
            r.sent_at && new Date(r.sent_at) >= todayStart
          );
          const weekReqs = all.filter((r: any) =>
            r.sent_at && new Date(r.sent_at) >= weekStart
          );
          const sent = all.filter((r: any) => ['sent', 'fulfilled', 'rejected'].includes(r.status));
          const fulfilled = all.filter((r: any) => r.status === 'fulfilled');

          const { count: assignedCount } = await db
            .from('foia_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('va_id', va.id);

          breakdowns.push({
            va,
            sent_today: todayReqs.length,
            sent_this_week: weekReqs.length,
            total_sent: sent.length,
            fulfilled: fulfilled.length,
            response_rate: sent.length > 0 ? (fulfilled.length / sent.length) * 100 : 0,
            assigned_count: assignedCount ?? 0,
          });
        }

        setStats({
          total_targets: totalTargets ?? 0,
          requests_today: requestsToday ?? 0,
          requests_this_week: requestsThisWeek ?? 0,
          pending_targets: Math.max(0, pendingTargets),
          va_breakdown: breakdowns,
        });
      } catch (err) {
        console.error('Failed to load stats:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  return (
    <FoiaLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Admin Dashboard</h1>
          <p className="text-slate-500 text-sm mt-1">FOIA Operations Overview</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse">
                <div className="h-8 bg-slate-200 rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={Database} label="Total Targets" value={stats.total_targets} color="bg-blue-600" />
            <StatCard icon={Send} label="Sent Today" value={stats.requests_today} color="bg-green-600" />
            <StatCard icon={Clock} label="Sent This Week" value={stats.requests_this_week} color="bg-purple-600" />
            <StatCard icon={CheckCircle} label="Pending (No Request)" value={stats.pending_targets} color="bg-orange-500" />
          </div>
        )}

        <VABreakdownTable
          breakdowns={stats?.va_breakdown ?? []}
          loading={loading}
        />
      </div>
    </FoiaLayout>
  );
}
