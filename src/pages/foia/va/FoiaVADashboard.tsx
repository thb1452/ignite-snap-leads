import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Send, CheckCircle, MapPin, ArrowRight, Loader2 } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { useFoiaAuth } from '@/lib/foia/hooks';
import { supabase } from '@/integrations/supabase/client';
import { getCurrentMonth } from '@/lib/foia/rotation';
import type { QueueItem, FoiaRequest } from '@/types/foia';
import { STATUS_LABELS, STATUS_COLORS, TARGET_TYPE_LABELS } from '@/types/foia';

const db = supabase as any;

interface VAStats {
  sent_this_week: number;
  total_assigned: number;
  fulfilled: number;
  response_rate: number;
}

export default function FoiaVADashboard() {
  const { profile } = useFoiaAuth();
  const [stats, setStats] = useState<VAStats | null>(null);
  const [priorityItems, setPriorityItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile) return;

    const fetch = async () => {
      setLoading(true);
      try {
        const currentMonth = getCurrentMonth();
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        weekStart.setHours(0, 0, 0, 0);

        const { data: assignments } = await db
          .from('foia_assignments')
          .select('target_id, target:targets(*)')
          .eq('va_id', profile.id);

        const targetIds = (assignments || []).map((a: any) => a.target_id);

        const { data: requests } = await db
          .from('foia_requests')
          .select('*')
          .eq('va_id', profile.id);

        const allRequests = (requests || []) as FoiaRequest[];
        const weekRequests = allRequests.filter((r) =>
          r.sent_at && new Date(r.sent_at) >= weekStart
        );

        const latestRequestMap = new Map<string, FoiaRequest>();
        for (const req of allRequests) {
          const existing = latestRequestMap.get(req.target_id);
          if (!existing || new Date(req.updated_at) > new Date(existing.updated_at)) {
            latestRequestMap.set(req.target_id, req);
          }
        }

        const { data: rotations } = targetIds.length > 0
          ? await db
              .from('press_rotation')
              .select('*, press_account:press_accounts(*)')
              .eq('rotation_month', currentMonth)
              .in('target_id', targetIds)
          : { data: [] };

        const rotationMap = new Map<string, { name: string; domain: string; id: string }>();
        for (const r of (rotations || [])) {
          if (r.press_account) rotationMap.set(r.target_id, r.press_account);
        }

        const items: QueueItem[] = (assignments || [])
          .filter((a: any) => a.target)
          .map((a: any) => {
            const target = a.target as QueueItem;
            const latestReq = latestRequestMap.get(a.target_id);
            const pressAccount = rotationMap.get(a.target_id);
            return {
              ...target,
              latest_request: latestReq,
              press_account_this_month: pressAccount ? {
                id: pressAccount.id,
                name: pressAccount.name,
                domain: pressAccount.domain,
                email: null,
                notes: null,
                is_active: true,
                created_at: '',
              } : undefined,
            };
          });

        items.sort((a, b) => {
          const aSent = a.latest_request?.sent_at;
          const bSent = b.latest_request?.sent_at;
          if (!aSent && !bSent) return 0;
          if (!aSent) return -1;
          if (!bSent) return 1;
          const now = Date.now();
          const aAge = now - new Date(aSent).getTime();
          const bAge = now - new Date(bSent).getTime();
          const sixtyDays = 60 * 24 * 60 * 60 * 1000;
          const thirtyDays = 30 * 24 * 60 * 60 * 1000;
          const aScore = aAge > sixtyDays ? 2 : aAge > thirtyDays ? 1 : 0;
          const bScore = bAge > sixtyDays ? 2 : bAge > thirtyDays ? 1 : 0;
          return bScore - aScore;
        });

        const fulfilled = allRequests.filter((r) => r.status === 'fulfilled');
        const sent = allRequests.filter((r) => ['sent', 'fulfilled', 'rejected'].includes(r.status));

        setStats({
          sent_this_week: weekRequests.length,
          total_assigned: targetIds.length,
          fulfilled: fulfilled.length,
          response_rate: sent.length > 0 ? (fulfilled.length / sent.length) * 100 : 0,
        });

        setPriorityItems(items.slice(0, 10));
      } catch (err) {
        console.error('Failed to load VA dashboard:', err);
      } finally {
        setLoading(false);
      }
    };

    fetch();
  }, [profile]);

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <FoiaLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {profile?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-0.5">{today}</p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 animate-pulse">
                <div className="h-6 bg-slate-200 rounded w-1/2 mb-1" />
                <div className="h-8 bg-slate-200 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                <Send className="h-4 w-4" /> Sent This Week
              </div>
              <p className="text-3xl font-bold text-slate-900">{stats.sent_this_week}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                <CheckCircle className="h-4 w-4" /> Fulfilled
              </div>
              <p className="text-3xl font-bold text-green-600">{stats.fulfilled}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-slate-500 text-sm mb-1">
                <MapPin className="h-4 w-4" /> Assigned
              </div>
              <p className="text-3xl font-bold text-slate-900">{stats.total_assigned}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-slate-500 text-sm mb-1">Response Rate</div>
              <p className="text-3xl font-bold text-slate-900">{stats.response_rate.toFixed(0)}%</p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-slate-900">Priority Queue</h3>
              <p className="text-xs text-slate-400 mt-0.5">Targets that need your attention first</p>
            </div>
            <Link
              to="/foia/va/queue"
              className="flex items-center gap-1 text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              View All <ArrowRight className="h-4 w-4" />
            </Link>
          </div>

          {loading ? (
            <div className="py-8 text-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-300 mx-auto" />
            </div>
          ) : priorityItems.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              No targets assigned yet. Ask your admin to assign you some targets.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {priorityItems.map((item) => {
                const req = item.latest_request;
                const sentDaysAgo = req?.sent_at
                  ? Math.floor((Date.now() - new Date(req.sent_at).getTime()) / (1000 * 60 * 60 * 24))
                  : null;

                return (
                  <div key={item.id} className="flex items-center gap-4 px-6 py-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-slate-900 text-sm">{item.jurisdiction_name}</span>
                        <span className="text-xs text-slate-400">{item.state}</span>
                        <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
                          {TARGET_TYPE_LABELS[item.target_type]}
                        </span>
                      </div>
                      {item.press_account_this_month && (
                        <p className="text-xs text-blue-600 mt-0.5">
                          Use: {item.press_account_this_month.name}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm flex-shrink-0">
                      {req ? (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[req.status]}`}>
                          {STATUS_LABELS[req.status]}
                        </span>
                      ) : (
                        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                          Never Sent
                        </span>
                      )}
                      {sentDaysAgo !== null && (
                        <span className="text-xs text-slate-400">{sentDaysAgo}d ago</span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </FoiaLayout>
  );
}
