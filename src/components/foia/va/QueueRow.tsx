import { useState } from 'react';
import { ExternalLink, Save, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { StatusDropdown } from './StatusDropdown';
import type { FoiaRequest, FoiaRequestStatus, QueueItem } from '@/types/foia';
import { TARGET_TYPE_LABELS } from '@/types/foia';
import { cn } from '@/lib/utils';

const db = supabase as any;

interface QueueRowProps {
  item: QueueItem;
  vaId: string;
  onSaved: (request: FoiaRequest) => void;
}

export function QueueRow({ item, vaId, onSaved }: QueueRowProps) {
  const [status, setStatus] = useState<FoiaRequestStatus>(
    item.latest_request?.status ?? 'pending'
  );
  const [notes, setNotes] = useState(item.latest_request?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const pressAccount = item.press_account_this_month;

  const handleSave = async () => {
    setSaving(true);
    try {
      const pressAccountId = pressAccount?.id ?? item.latest_request?.press_account_id ?? null;

      if (item.latest_request) {
        const { data, error } = await db
          .from('foia_requests')
          .update({
            status,
            notes,
            press_account_id: pressAccountId,
            ...(status === 'sent' && !item.latest_request.sent_at
              ? { sent_at: new Date().toISOString() }
              : {}),
          })
          .eq('id', item.latest_request.id)
          .select('*')
          .single();

        if (error) throw error;
        onSaved(data as FoiaRequest);
      } else {
        const { data, error } = await db
          .from('foia_requests')
          .insert({
            target_id: item.id,
            va_id: vaId,
            press_account_id: pressAccountId,
            status,
            notes,
            sent_at: status === 'sent' ? new Date().toISOString() : null,
          })
          .select('*')
          .single();

        if (error) throw error;
        onSaved(data as FoiaRequest);
      }

      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const isDirty =
    status !== (item.latest_request?.status ?? 'pending') ||
    notes !== (item.latest_request?.notes ?? '');

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* Main row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 truncate">{item.jurisdiction_name}</span>
            <span className="text-xs text-slate-400">{item.state}</span>
            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {TARGET_TYPE_LABELS[item.target_type]}
            </span>
          </div>
          {pressAccount && (
            <p className="text-xs text-blue-600 mt-0.5">
              Use: <strong>{pressAccount.name}</strong> ({pressAccount.domain})
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusDropdown value={status} onChange={setStatus} />

          {item.foia_url && (
            <a
              href={item.foia_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-slate-900 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
            >
              Open FOIA <ExternalLink className="h-3 w-3" />
            </a>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-slate-400 hover:text-slate-600"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="px-4 pb-3 border-t border-slate-100 pt-3 bg-slate-50">
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add notes about this request..."
                rows={2}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
            <button
              onClick={handleSave}
              disabled={saving || (!isDirty && !saved)}
              className={cn(
                'flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                saved
                  ? 'bg-green-600 text-white'
                  : isDirty
                  ? 'bg-blue-600 hover:bg-blue-700 text-white'
                  : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {saved ? 'Saved!' : 'Save'}
            </button>
          </div>

          {item.latest_request?.sent_at && (
            <p className="text-xs text-slate-400 mt-2">
              Last sent: {new Date(item.latest_request.sent_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
