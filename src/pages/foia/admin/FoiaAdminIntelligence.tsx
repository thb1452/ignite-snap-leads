import { useState, useEffect } from 'react';
import { BarChart2, TrendingUp, TrendingDown, AlertTriangle, Zap, Star } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { db } from '@/lib/foia/db';
import { cn } from '@/lib/utils';

interface JurisdictionRow {
  target_id: string;
  jurisdiction_name: string;
  state: string;
  total_requests: number;
  fulfilled_count: number;
  rejected_count: number;
  needs_review_count: number;
  no_portal_count: number;
  fulfillment_rate: number;
  rejection_rate: number;
  avg_response_days: number;
  avg_data_quality: number;
  hostility_score: number;
  portal_difficulty_score: number | null;
  jis: number;
}

interface StateRow {
  state: string;
  total_requests: number;
  fulfilled_count: number;
  avg_response_days: number;
  fulfillment_rate: number;
  rejection_rate: number;
  avg_data_quality: number;
}

interface OverviewRow {
  total_fulfilled: number;
  with_file: number;
  file_upload_rate: number;
  avg_quality: number;
  format_csv: number;
  format_pdf: number;
  format_image: number;
  format_mixed: number;
  format_other: number;
  avg_response_days: number;
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white border border-slate-200 rounded-lg p-4 flex items-start gap-3">
      <div className={cn('p-2 rounded-lg', color)}>
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div>
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xl font-bold text-slate-900">
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function JisBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 bg-slate-100 rounded-full h-1.5">
        <div className={cn('h-1.5 rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-slate-600 w-8">{pct.toFixed(1)}</span>
    </div>
  );
}

function DifficultyStars({ score }: { score: number | null }) {
  if (!score) return <span className="text-slate-300">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={cn('h-3 w-3', i <= score ? 'fill-amber-400 text-amber-400' : 'text-slate-200')}
        />
      ))}
    </div>
  );
}

type SortField =
  | 'jis'
  | 'fulfillment_rate'
  | 'avg_response_days'
  | 'rejection_rate'
  | 'hostility_score'
  | 'avg_data_quality';

type Tab = 'ranking' | 'states' | 'hostile' | 'fastest' | 'slowest';

const TABS: { id: Tab; label: string }[] = [
  { id: 'ranking', label: 'JIS Ranking' },
  { id: 'states', label: 'State Analytics' },
  { id: 'hostile', label: 'Most Hostile' },
  { id: 'fastest', label: 'Fastest 10' },
  { id: 'slowest', label: 'Slowest 10' },
];

export default function FoiaAdminIntelligence() {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionRow[]>([]);
  const [stateAnalytics, setStateAnalytics] = useState<StateRow[]>([]);
  const [overview, setOverview] = useState<OverviewRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState<SortField>('jis');
  const [sortAsc, setSortAsc] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('ranking');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [{ data: jData }, { data: sData }, { data: oData }] = await Promise.all([
          db.rpc('fn_jurisdiction_intelligence'),
          db.rpc('fn_state_response_analytics'),
          db.rpc('fn_fulfillment_overview'),
        ]);
        setJurisdictions(
          ((jData as any[]) || []).map(r => ({
            ...r,
            total_requests: Number(r.total_requests),
            fulfilled_count: Number(r.fulfilled_count),
            rejected_count: Number(r.rejected_count),
            needs_review_count: Number(r.needs_review_count),
            no_portal_count: Number(r.no_portal_count),
            fulfillment_rate: Number(r.fulfillment_rate),
            rejection_rate: Number(r.rejection_rate),
            avg_response_days: Number(r.avg_response_days),
            avg_data_quality: Number(r.avg_data_quality),
            hostility_score: Number(r.hostility_score),
            portal_difficulty_score: r.portal_difficulty_score ? Number(r.portal_difficulty_score) : null,
            jis: Number(r.jis),
          }))
        );
        setStateAnalytics(
          ((sData as any[]) || []).map(r => ({
            ...r,
            total_requests: Number(r.total_requests),
            fulfilled_count: Number(r.fulfilled_count),
            avg_response_days: Number(r.avg_response_days),
            fulfillment_rate: Number(r.fulfillment_rate),
            rejection_rate: Number(r.rejection_rate),
            avg_data_quality: Number(r.avg_data_quality),
          }))
        );
        if (oData) {
          const o = Array.isArray(oData) ? (oData as any[])[0] : oData;
          if (o) {
            setOverview({
              total_fulfilled: Number(o.total_fulfilled),
              with_file: Number(o.with_file),
              file_upload_rate: Number(o.file_upload_rate || 0),
              avg_quality: Number(o.avg_quality || 0),
              format_csv: Number(o.format_csv),
              format_pdf: Number(o.format_pdf),
              format_image: Number(o.format_image),
              format_mixed: Number(o.format_mixed),
              format_other: Number(o.format_other),
              avg_response_days: Number(o.avg_response_days || 0),
            });
          }
        }
      } catch (err) {
        console.error('Failed to load intelligence data:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const withRequests = jurisdictions.filter(j => j.total_requests > 0);
  const sorted = [...withRequests].sort((a, b) => {
    const diff = (a[sortField] ?? 0) - (b[sortField] ?? 0);
    return sortAsc ? diff : -diff;
  });
  const hostile = [...withRequests]
    .sort((a, b) => b.hostility_score - a.hostility_score)
    .slice(0, 10);
  const fastest = [...withRequests]
    .filter(j => j.avg_response_days > 0)
    .sort((a, b) => a.avg_response_days - b.avg_response_days)
    .slice(0, 10);
  const slowest = [...withRequests]
    .filter(j => j.avg_response_days > 0)
    .sort((a, b) => b.avg_response_days - a.avg_response_days)
    .slice(0, 10);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else {
      setSortField(field);
      setSortAsc(false);
    }
  };

  const SortHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <th
      onClick={() => handleSort(field)}
      className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide cursor-pointer hover:text-slate-700 select-none whitespace-nowrap"
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && (sortAsc ? '↑' : '↓')}
      </span>
    </th>
  );

  return (
    <FoiaLayout>
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jurisdiction Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">
            Analytics on fulfillment, response times, hostility, and data quality
          </p>
        </div>

        {/* Overview cards */}
        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-lg p-4 h-20 animate-pulse bg-slate-50" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              icon={TrendingUp}
              label="Total Fulfilled"
              value={overview?.total_fulfilled ?? 0}
              color="bg-green-500"
              sub={`${overview?.file_upload_rate ?? 0}% with file`}
            />
            <StatCard
              icon={BarChart2}
              label="Avg Response Days"
              value={overview?.avg_response_days ?? '—'}
              color="bg-blue-500"
            />
            <StatCard
              icon={Star}
              label="Avg Data Quality"
              value={overview ? `${overview.avg_quality}/5` : '—'}
              color="bg-amber-500"
            />
            <StatCard
              icon={AlertTriangle}
              label="High-Hostility Jurisdictions"
              value={withRequests.filter(h => h.hostility_score > 30).length}
              color="bg-red-600"
              sub="Hostility > 30"
            />
          </div>
        )}

        {/* Format breakdown */}
        {overview && !loading && (
          <div className="bg-white border border-slate-200 rounded-lg p-4">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
              Data Format Breakdown
            </p>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'CSV', count: overview.format_csv, color: 'bg-emerald-100 text-emerald-700' },
                { label: 'PDF', count: overview.format_pdf, color: 'bg-blue-100 text-blue-700' },
                { label: 'Image', count: overview.format_image, color: 'bg-purple-100 text-purple-700' },
                { label: 'Mixed', count: overview.format_mixed, color: 'bg-orange-100 text-orange-700' },
                { label: 'Other', count: overview.format_other, color: 'bg-slate-100 text-slate-700' },
              ].map(f => (
                <span key={f.label} className={cn('text-xs px-2.5 py-1 rounded-full font-medium', f.color)}>
                  {f.label}: {f.count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 p-1 rounded-lg w-fit">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                activeTab === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* JIS Ranking */}
        {!loading && activeTab === 'ranking' && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Jurisdiction
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      State
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Requests
                    </th>
                    <SortHeader field="fulfillment_rate">Fulfillment %</SortHeader>
                    <SortHeader field="avg_response_days">Avg Days</SortHeader>
                    <SortHeader field="rejection_rate">Rejection %</SortHeader>
                    <SortHeader field="avg_data_quality">Quality</SortHeader>
                    <th className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                      Difficulty
                    </th>
                    <SortHeader field="hostility_score">Hostility</SortHeader>
                    <SortHeader field="jis">JIS</SortHeader>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sorted.slice(0, 50).map(j => (
                    <tr key={j.target_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900 max-w-[180px] truncate">
                        {j.jurisdiction_name}
                      </td>
                      <td className="px-3 py-2 text-slate-500">{j.state}</td>
                      <td className="px-3 py-2 text-slate-600">{j.total_requests}</td>
                      <td className={cn('px-3 py-2', j.fulfillment_rate >= 50 ? 'text-green-600 font-medium' : 'text-slate-600')}>
                        {j.fulfillment_rate}%
                      </td>
                      <td className="px-3 py-2 text-slate-600">{j.avg_response_days || '—'}</td>
                      <td className={cn('px-3 py-2', j.rejection_rate > 30 ? 'text-red-600 font-medium' : 'text-slate-600')}>
                        {j.rejection_rate}%
                      </td>
                      <td className="px-3 py-2 text-slate-600">{j.avg_data_quality || '—'}</td>
                      <td className="px-3 py-2">
                        <DifficultyStars score={j.portal_difficulty_score} />
                      </td>
                      <td className={cn(
                        'px-3 py-2 font-medium',
                        j.hostility_score > 30 ? 'text-red-600' : j.hostility_score > 15 ? 'text-amber-600' : 'text-slate-600'
                      )}>
                        {j.hostility_score}
                      </td>
                      <td className="px-3 py-2">
                        <JisBar value={j.jis} />
                      </td>
                    </tr>
                  ))}
                  {sorted.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-8 text-center text-slate-400 text-sm">
                        No request data yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* State Analytics */}
        {!loading && activeTab === 'states' && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['State', 'Total Requests', 'Fulfilled', 'Fulfillment %', 'Avg Response Days', 'Rejection %', 'Avg Quality'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stateAnalytics.map(s => (
                    <tr key={s.state} className="hover:bg-slate-50">
                      <td className="px-3 py-2 font-medium text-slate-900">{s.state}</td>
                      <td className="px-3 py-2 text-slate-600">{s.total_requests}</td>
                      <td className="px-3 py-2 text-slate-600">{s.fulfilled_count}</td>
                      <td className={cn('px-3 py-2 font-medium', s.fulfillment_rate >= 50 ? 'text-green-600' : 'text-slate-600')}>
                        {s.fulfillment_rate}%
                      </td>
                      <td className="px-3 py-2 text-slate-600">{s.avg_response_days || '—'}</td>
                      <td className={cn('px-3 py-2', s.rejection_rate > 30 ? 'text-red-600 font-medium' : 'text-slate-600')}>
                        {s.rejection_rate}%
                      </td>
                      <td className="px-3 py-2 text-slate-600">{s.avg_data_quality || '—'}</td>
                    </tr>
                  ))}
                  {stateAnalytics.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-3 py-8 text-center text-slate-400 text-sm">
                        No state data yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Most Hostile */}
        {!loading && activeTab === 'hostile' && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-500" />
              <span className="font-medium text-slate-700 text-sm">Top 10 Most Resistant Jurisdictions</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['#', 'Jurisdiction', 'State', 'Rejected', 'Needs Review', 'No Portal', 'Hostility Score'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {hostile.map((j, i) => (
                    <tr key={j.target_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400 font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{j.jurisdiction_name}</td>
                      <td className="px-3 py-2 text-slate-500">{j.state}</td>
                      <td className="px-3 py-2 text-red-600 font-medium">{j.rejected_count}</td>
                      <td className="px-3 py-2 text-amber-600">{j.needs_review_count}</td>
                      <td className="px-3 py-2 text-slate-600">{j.no_portal_count}</td>
                      <td className={cn(
                        'px-3 py-2 font-bold',
                        j.hostility_score > 50 ? 'text-red-600' : j.hostility_score > 25 ? 'text-amber-600' : 'text-slate-600'
                      )}>
                        {j.hostility_score}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Fastest / Slowest */}
        {!loading && (activeTab === 'fastest' || activeTab === 'slowest') && (
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center gap-2">
              {activeTab === 'fastest' ? (
                <Zap className="h-4 w-4 text-green-500" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-500" />
              )}
              <span className="font-medium text-slate-700 text-sm">
                {activeTab === 'fastest' ? 'Fastest 10 Responders' : 'Slowest 10 Responders'}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    {['#', 'Jurisdiction', 'State', 'Avg Response Days', 'Fulfillment %', 'JIS'].map(h => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-medium text-slate-500 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(activeTab === 'fastest' ? fastest : slowest).map((j, i) => (
                    <tr key={j.target_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2 text-slate-400 font-mono text-xs">{i + 1}</td>
                      <td className="px-3 py-2 font-medium text-slate-900">{j.jurisdiction_name}</td>
                      <td className="px-3 py-2 text-slate-500">{j.state}</td>
                      <td className={cn(
                        'px-3 py-2 font-medium',
                        activeTab === 'fastest'
                          ? j.avg_response_days <= 14 ? 'text-green-600' : 'text-slate-700'
                          : j.avg_response_days >= 45 ? 'text-red-600' : 'text-slate-700'
                      )}>
                        {j.avg_response_days} days
                      </td>
                      <td className="px-3 py-2 text-slate-600">{j.fulfillment_rate}%</td>
                      <td className="px-3 py-2">
                        <JisBar value={j.jis} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </FoiaLayout>
  );
}
