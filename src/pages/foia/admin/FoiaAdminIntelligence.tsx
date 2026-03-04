import { useEffect, useState } from 'react';
import { BarChart3, TrendingUp, TrendingDown, Shield, AlertTriangle, Star, Clock, FileCheck } from 'lucide-react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { db } from '@/lib/foia/db';
import { cn } from '@/lib/utils';
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

// ---- Types ----
interface JurisdictionIntel {
  target_id: string;
  jurisdiction_name: string;
  state: string;
  county: string | null;
  population: number | null;
  target_type: string;
  portal_difficulty_score: number | null;
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
  jis: number;
}

interface StateAnalytics {
  state: string;
  total_requests: number;
  fulfilled_count: number;
  avg_response_days: number;
  fulfillment_rate: number;
  rejection_rate: number;
  avg_data_quality: number;
}

interface FulfillmentOverview {
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

// ---- Helpers ----
function StatCard({ icon: Icon, label, value, color, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center gap-3">
        <div className={cn('p-2.5 rounded-lg', color)}>
          <Icon className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-slate-500 text-sm">{label}</p>
          <p className="text-2xl font-bold text-slate-900">{typeof value === 'number' ? value.toLocaleString() : value}</p>
          {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function JisBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 70 ? 'bg-green-500' : pct >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full', color)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium text-slate-700">{pct.toFixed(1)}</span>
    </div>
  );
}

function DifficultyStars({ score }: { score: number | null }) {
  if (!score) return <span className="text-xs text-slate-300">—</span>;
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={cn('h-3 w-3', i <= score ? 'text-amber-400 fill-amber-400' : 'text-slate-200')} />
      ))}
    </span>
  );
}

type SortField = 'jis' | 'fulfillment_rate' | 'avg_response_days' | 'rejection_rate' | 'hostility_score' | 'avg_data_quality';
type Tab = 'ranking' | 'states' | 'hostile' | 'fastest' | 'slowest';

export default function FoiaAdminIntelligence() {
  const [jurisdictions, setJurisdictions] = useState<JurisdictionIntel[]>([]);
  const [stateAnalytics, setStateAnalytics] = useState<StateAnalytics[]>([]);
  const [overview, setOverview] = useState<FulfillmentOverview | null>(null);
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
        setJurisdictions((jData || []).map((r: any) => ({
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
          jis: Number(r.jis),
        })));
        setStateAnalytics((sData || []).map((r: any) => ({
          ...r,
          total_requests: Number(r.total_requests),
          fulfilled_count: Number(r.fulfilled_count),
          avg_response_days: Number(r.avg_response_days),
          fulfillment_rate: Number(r.fulfillment_rate),
          rejection_rate: Number(r.rejection_rate),
          avg_data_quality: Number(r.avg_data_quality),
        })));
        if (oData) {
          const o = Array.isArray(oData) ? oData[0] : oData;
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
  const hostile = [...withRequests].sort((a, b) => b.hostility_score - a.hostility_score).slice(0, 10);
  const fastest = [...withRequests].filter(j => j.avg_response_days > 0).sort((a, b) => a.avg_response_days - b.avg_response_days).slice(0, 10);
  const slowest = [...withRequests].filter(j => j.avg_response_days > 0).sort((a, b) => b.avg_response_days - a.avg_response_days).slice(0, 10);

  const handleSort = (field: SortField) => {
    if (sortField === field) setSortAsc(!sortAsc);
    else { setSortField(field); setSortAsc(false); }
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <TableHead
      className="cursor-pointer select-none hover:text-slate-900 transition-colors"
      onClick={() => handleSort(field)}
    >
      <span className="flex items-center gap-1">
        {children}
        {sortField === field && (sortAsc ? '↑' : '↓')}
      </span>
    </TableHead>
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ranking', label: 'JIS Ranking' },
    { id: 'states', label: 'State Analytics' },
    { id: 'hostile', label: 'Most Hostile' },
    { id: 'fastest', label: 'Fastest 10' },
    { id: 'slowest', label: 'Slowest 10' },
  ];

  return (
    <FoiaLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Jurisdiction Intelligence</h1>
          <p className="text-slate-500 text-sm mt-1">Analytics on fulfillment, response times, hostility, and data quality</p>
        </div>

        {/* Overview cards */}
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-white rounded-xl border border-slate-200 p-5 animate-pulse"><div className="h-8 bg-slate-200 rounded w-2/3" /></div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard icon={FileCheck} label="Fulfillment Rate" value={`${overview?.file_upload_rate ?? 0}%`} color="bg-green-600" sub={`${overview?.with_file ?? 0} / ${overview?.total_fulfilled ?? 0} with files`} />
            <StatCard icon={Clock} label="Avg Response Days" value={overview?.avg_response_days ?? '—'} color="bg-blue-600" />
            <StatCard icon={Star} label="Avg Data Quality" value={`${overview?.avg_quality ?? 0} / 5`} color="bg-amber-500" />
            <StatCard icon={AlertTriangle} label="Hostile Jurisdictions" value={hostile.filter(h => h.hostility_score > 30).length} color="bg-red-600" sub="Hostility > 30" />
          </div>
        )}

        {/* Format breakdown */}
        {overview && !loading && (
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-3">Data Format Breakdown</h3>
            <div className="flex gap-3 flex-wrap">
              {[
                { label: 'CSV', count: overview.format_csv, color: 'bg-emerald-100 text-emerald-700' },
                { label: 'PDF', count: overview.format_pdf, color: 'bg-blue-100 text-blue-700' },
                { label: 'Image', count: overview.format_image, color: 'bg-purple-100 text-purple-700' },
                { label: 'Mixed', count: overview.format_mixed, color: 'bg-orange-100 text-orange-700' },
                { label: 'Other', count: overview.format_other, color: 'bg-slate-100 text-slate-700' },
              ].map(f => (
                <span key={f.label} className={cn('text-sm font-medium px-3 py-1.5 rounded-lg', f.color)}>
                  {f.label}: {f.count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-md transition-colors',
                activeTab === tab.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {!loading && activeTab === 'ranking' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Requests</TableHead>
                  <SortHeader field="fulfillment_rate">Fulfillment %</SortHeader>
                  <SortHeader field="avg_response_days">Avg Days</SortHeader>
                  <SortHeader field="rejection_rate">Rejection %</SortHeader>
                  <SortHeader field="avg_data_quality">Quality</SortHeader>
                  <TableHead>Difficulty</TableHead>
                  <SortHeader field="hostility_score">Hostility</SortHeader>
                  <SortHeader field="jis">JIS</SortHeader>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.slice(0, 50).map(j => (
                  <TableRow key={j.target_id}>
                    <TableCell className="font-medium text-slate-900 max-w-[200px] truncate">{j.jurisdiction_name}</TableCell>
                    <TableCell className="text-slate-500">{j.state}</TableCell>
                    <TableCell>{j.total_requests}</TableCell>
                    <TableCell>
                      <span className={cn('font-medium', j.fulfillment_rate >= 50 ? 'text-green-600' : 'text-slate-600')}>{j.fulfillment_rate}%</span>
                    </TableCell>
                    <TableCell>{j.avg_response_days || '—'}</TableCell>
                    <TableCell>
                      <span className={cn('font-medium', j.rejection_rate > 30 ? 'text-red-600' : 'text-slate-600')}>{j.rejection_rate}%</span>
                    </TableCell>
                    <TableCell>{j.avg_data_quality || '—'}</TableCell>
                    <TableCell><DifficultyStars score={j.portal_difficulty_score} /></TableCell>
                    <TableCell>
                      <span className={cn('font-medium', j.hostility_score > 30 ? 'text-red-600' : j.hostility_score > 15 ? 'text-amber-600' : 'text-slate-600')}>
                        {j.hostility_score}
                      </span>
                    </TableCell>
                    <TableCell><JisBar value={j.jis} /></TableCell>
                  </TableRow>
                ))}
                {sorted.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center text-slate-400 py-8">No request data yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && activeTab === 'states' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead>Total Requests</TableHead>
                  <TableHead>Fulfilled</TableHead>
                  <TableHead>Fulfillment %</TableHead>
                  <TableHead>Avg Response Days</TableHead>
                  <TableHead>Rejection %</TableHead>
                  <TableHead>Avg Quality</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stateAnalytics.map(s => (
                  <TableRow key={s.state}>
                    <TableCell className="font-medium text-slate-900">{s.state}</TableCell>
                    <TableCell>{s.total_requests}</TableCell>
                    <TableCell>{s.fulfilled_count}</TableCell>
                    <TableCell><span className={cn('font-medium', s.fulfillment_rate >= 50 ? 'text-green-600' : 'text-slate-600')}>{s.fulfillment_rate}%</span></TableCell>
                    <TableCell>{s.avg_response_days || '—'}</TableCell>
                    <TableCell><span className={cn(s.rejection_rate > 30 ? 'text-red-600 font-medium' : '')}>{s.rejection_rate}%</span></TableCell>
                    <TableCell>{s.avg_data_quality || '—'}</TableCell>
                  </TableRow>
                ))}
                {stateAnalytics.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-slate-400 py-8">No state data yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && activeTab === 'hostile' && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                <Shield className="h-4 w-4 text-red-500" /> Top 10 Most Resistant Jurisdictions
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Rejected</TableHead>
                  <TableHead>Needs Review</TableHead>
                  <TableHead>No Portal</TableHead>
                  <TableHead>Hostility Score</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {hostile.map((j, i) => (
                  <TableRow key={j.target_id}>
                    <TableCell className="font-bold text-slate-400">{i + 1}</TableCell>
                    <TableCell className="font-medium text-slate-900">{j.jurisdiction_name}</TableCell>
                    <TableCell>{j.state}</TableCell>
                    <TableCell><Badge variant="destructive" className="text-xs">{j.rejected_count}</Badge></TableCell>
                    <TableCell>{j.needs_review_count}</TableCell>
                    <TableCell>{j.no_portal_count}</TableCell>
                    <TableCell>
                      <span className={cn('text-lg font-bold', j.hostility_score > 50 ? 'text-red-600' : j.hostility_score > 25 ? 'text-amber-600' : 'text-slate-600')}>
                        {j.hostility_score}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!loading && (activeTab === 'fastest' || activeTab === 'slowest') && (
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100">
              <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                {activeTab === 'fastest' ? <TrendingUp className="h-4 w-4 text-green-500" /> : <TrendingDown className="h-4 w-4 text-red-500" />}
                {activeTab === 'fastest' ? 'Fastest 10 Responders' : 'Slowest 10 Responders'}
              </h3>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Jurisdiction</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Avg Response Days</TableHead>
                  <TableHead>Fulfillment %</TableHead>
                  <TableHead>JIS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(activeTab === 'fastest' ? fastest : slowest).map((j, i) => (
                  <TableRow key={j.target_id}>
                    <TableCell className="font-bold text-slate-400">{i + 1}</TableCell>
                    <TableCell className="font-medium text-slate-900">{j.jurisdiction_name}</TableCell>
                    <TableCell>{j.state}</TableCell>
                    <TableCell>
                      <span className={cn('font-medium', j.avg_response_days <= 14 ? 'text-green-600' : j.avg_response_days >= 45 ? 'text-red-600' : 'text-slate-700')}>
                        {j.avg_response_days} days
                      </span>
                    </TableCell>
                    <TableCell>{j.fulfillment_rate}%</TableCell>
                    <TableCell><JisBar value={j.jis} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </FoiaLayout>
  );
}
