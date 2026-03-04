import { Clock } from 'lucide-react';
import type { FoiaRequestStatus } from '@/types/foia';
import { STATUS_LABELS, STATUS_COLORS } from '@/types/foia';

interface StatusEntry {
  id: string;
  status: FoiaRequestStatus;
  notes: string | null;
  updated_at: string;
  sent_at: string | null;
  va?: { full_name: string } | null;
}

interface StatusTimelineProps {
  entries: StatusEntry[];
  loading: boolean;
}

export function StatusTimeline({ entries, loading }: StatusTimelineProps) {
  if (loading) {
    return <p className="text-xs text-slate-400 py-2">Loading history…</p>;
  }

  if (entries.length === 0) {
    return <p className="text-xs text-slate-400 py-2">No status history yet.</p>;
  }

  return (
    <div className="space-y-2">
      {entries.map((entry, i) => (
        <div key={entry.id} className="flex gap-3 items-start">
          <div className="flex flex-col items-center">
            <div className="w-2 h-2 rounded-full bg-slate-400 mt-1.5" />
            {i < entries.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
          </div>
          <div className="flex-1 pb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[entry.status] ?? 'bg-slate-100 text-slate-600'}`}>
                {STATUS_LABELS[entry.status] ?? entry.status}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(entry.updated_at).toLocaleDateString()}
              </span>
              {entry.va?.full_name && (
                <span className="text-xs text-slate-500">by {entry.va.full_name}</span>
              )}
            </div>
            {entry.notes && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{entry.notes}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
