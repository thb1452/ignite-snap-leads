import { TrendingUp, User } from 'lucide-react';
import type { VABreakdown } from '@/types/foia';

interface VABreakdownTableProps {
  breakdowns: VABreakdown[];
  loading: boolean;
}

export function VABreakdownTable({ breakdowns, loading }: VABreakdownTableProps) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-slate-200 rounded w-1/3" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
          <div className="h-10 bg-slate-100 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-slate-400" />
        <h3 className="font-semibold text-slate-900">VA Performance</h3>
      </div>
      {breakdowns.length === 0 ? (
        <div className="px-6 py-8 text-center text-slate-400 text-sm">No VA data yet</div>
      ) : (
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">VA</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Sent Today</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">This Week</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Total Sent</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Fulfilled</th>
              <th className="text-right px-4 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Response %</th>
              <th className="text-right px-6 py-2 text-xs font-medium text-slate-500 uppercase tracking-wide">Assigned</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {breakdowns.map(({ va, sent_today, sent_this_week, total_sent, fulfilled, response_rate, assigned_count }) => (
              <tr key={va.id} className="hover:bg-slate-50">
                <td className="px-6 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-blue-700 text-xs font-bold">
                      {va.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-medium text-slate-900">{va.full_name}</p>
                      <p className="text-xs text-slate-400">{va.email}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-medium text-slate-900">{sent_today}</td>
                <td className="px-4 py-3 text-right text-slate-700">{sent_this_week}</td>
                <td className="px-4 py-3 text-right text-slate-700">{total_sent}</td>
                <td className="px-4 py-3 text-right text-green-700 font-medium">{fulfilled}</td>
                <td className="px-4 py-3 text-right">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    response_rate >= 50 ? 'bg-green-100 text-green-700' :
                    response_rate >= 20 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-slate-100 text-slate-600'
                  }`}>
                    {response_rate.toFixed(0)}%
                  </span>
                </td>
                <td className="px-6 py-3 text-right text-slate-500">{assigned_count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
