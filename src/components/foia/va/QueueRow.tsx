import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Save, Loader2, ChevronDown, ChevronUp, Bookmark, Users, Star } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { db } from '@/lib/foia/db';
import { supabase } from '@/integrations/supabase/client';
import { StatusDropdown } from './StatusDropdown';
import { StatusTimeline } from './StatusTimeline';
import { FulfillmentModal, type FulfillmentMetadata } from './FulfillmentModal';
import { Badge } from '@/components/ui/badge';
import type { FoiaRequest, FoiaRequestStatus, QueueItem } from '@/types/foia';
import { TARGET_TYPE_LABELS } from '@/types/foia';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

function PortalDifficultyRating({ targetId, currentScore }: { targetId: string; currentScore: number | null }) {
  const [score, setScore] = useState(currentScore);
  const [saving, setSaving] = useState(false);

  const handleRate = async (value: number) => {
    setSaving(true);
    setScore(value);
    try {
      await db.from('targets').update({ portal_difficulty_score: value }).eq('id', targetId);
    } catch (err) {
      console.error('Failed to save difficulty:', err);
      setScore(currentScore);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 pb-2 flex items-center gap-2">
      <span className="text-xs text-slate-500">Portal difficulty:</span>
      <span className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <button
            key={i}
            onClick={() => handleRate(i)}
            disabled={saving}
            className="transition-colors disabled:opacity-50"
          >
            <Star className={cn('h-3.5 w-3.5', i <= (score ?? 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-300 hover:text-amber-300')} />
          </button>
        ))}
      </span>
      {score && <span className="text-xs text-slate-400">{score}/5</span>}
    </div>
  );
}

interface QueueRowProps {
  item: QueueItem;
  vaId: string;
  onSaved: (request: FoiaRequest) => void;
  flagged: boolean;
  onToggleFlag: (targetId: string) => void;
}

function getFollowUpBadge(sentAt: string | null | undefined, status: FoiaRequestStatus) {
  if (!sentAt || status === 'fulfilled' || status === 'rejected') return null;
  const days = Math.floor((Date.now() - new Date(sentAt).getTime()) / 86400000);
  if (days >= 60) return { label: 'Overdue', className: 'bg-red-100 text-red-700 border-red-200' };
  if (days >= 30) return { label: 'Follow Up', className: 'bg-yellow-100 text-yellow-700 border-yellow-200' };
  return null;
}

function formatDaysAgo(sentAt: string | null | undefined) {
  if (!sentAt) return null;
  const days = Math.floor((Date.now() - new Date(sentAt).getTime()) / 86400000);
  if (days === 0) return 'Sent today';
  if (days === 1) return 'Sent 1 day ago';
  return `Sent ${days} days ago`;
}

function formatPopulation(pop: number | null | undefined) {
  if (!pop) return null;
  if (pop >= 1_000_000) return `${(pop / 1_000_000).toFixed(1)}M`;
  if (pop >= 1_000) return `${(pop / 1_000).toFixed(0)}K`;
  return pop.toLocaleString();
}

export function QueueRow({ item, vaId, onSaved, flagged, onToggleFlag }: QueueRowProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [persistedRequest, setPersistedRequest] = useState<FoiaRequest | undefined>(item.latest_request);
  const [status, setStatus] = useState<FoiaRequestStatus>((persistedRequest?.status as FoiaRequestStatus) ?? 'pending');
  const [notes, setNotes] = useState(persistedRequest?.notes ?? '');
  const [foiaUrl, setFoiaUrl] = useState(item.foia_url ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const noteSaveTimerRef = useRef<number | null>(null);
  const [showFulfillmentModal, setShowFulfillmentModal] = useState(false);
  const [pendingFulfillmentStatus, setPendingFulfillmentStatus] = useState(false);

  const pressAccount = item.press_account_this_month;
  const followUpBadge = getFollowUpBadge(persistedRequest?.sent_at, status);
  const sentAgoText = formatDaysAgo(persistedRequest?.sent_at);
  const popLabel = formatPopulation(item.population);

  useEffect(() => {
    if (item.latest_request) {
      setPersistedRequest(item.latest_request);
    }
  }, [item.latest_request]);

  useEffect(() => {
    return () => {
      if (noteSaveTimerRef.current) window.clearTimeout(noteSaveTimerRef.current);
    };
  }, []);

  // Fetch status history when expanded
  useEffect(() => {
    if (!expanded) return;
    setHistoryLoading(true);
    db.from('foia_requests')
      .select('id, status, notes, updated_at, sent_at, va:foia_profiles!foia_requests_va_id_fkey(full_name)')
      .eq('target_id', item.id)
      .order('updated_at', { ascending: false })
      .limit(20)
      .then((result: any) => {
        setHistory(result?.data ?? []);
        setHistoryLoading(false);
      });
  }, [expanded, item.id]);

  const persistRequest = async (
    nextStatus: FoiaRequestStatus,
    nextNotes: string,
    options?: { showSavedBadge?: boolean }
  ) => {
    setSaving(true);
    try {
      const pressAccountId = pressAccount?.id ?? persistedRequest?.press_account_id ?? null;
      const showSavedBadge = options?.showSavedBadge ?? true;
      const nowIso = new Date().toISOString();
      let result: FoiaRequest;

      if (persistedRequest) {
        const { data, error } = await db
          .from('foia_requests')
          .update({
            status: nextStatus,
            notes: nextNotes,
            press_account_id: pressAccountId,
            updated_at: nowIso,
            ...(nextStatus === 'sent' && !persistedRequest.sent_at ? { sent_at: nowIso } : {}),
            ...(nextStatus === 'fulfilled' && !persistedRequest.response_received_at ? { response_received_at: nowIso } : {}),
          })
          .eq('id', persistedRequest.id)
          .select('*')
          .single();
        if (error) throw error;
        result = data as FoiaRequest;
      } else {
        // Optimistic lock: use upsert with unique constraint to prevent duplicate inserts
        const { data, error } = await db
          .from('foia_requests')
          .upsert({
            target_id: item.id,
            va_id: vaId,
            requested_by: vaId,
            press_account_id: pressAccountId,
            status: nextStatus,
            notes: nextNotes,
            sent_at: nextStatus === 'sent' ? nowIso : null,
            response_received_at: nextStatus === 'fulfilled' ? nowIso : null,
            updated_at: nowIso,
          }, { onConflict: 'target_id,va_id' })
          .select('*')
          .single();
        if (error) throw error;
        result = data as FoiaRequest;
      }

      setPersistedRequest(result);
      onSaved(result);
      queryClient.invalidateQueries({ queryKey: ['va-dashboard', vaId] });

      const terminalStatuses = new Set(['sent', 'fulfilled', 'rejected']);
      if (terminalStatuses.has(nextStatus)) {
        supabase.functions.invoke('rotate-va-batch', {
          body: { action: 'check-batch-completion', va_id: vaId },
        }).catch(() => {});
      }

      if (showSavedBadge) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      }
    } catch (err) {
      const message = (err as any)?.message ?? 'Failed to save changes';
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
      console.error('Save failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persistRequest(status, notes, { showSavedBadge: true });
  const handleStatusChange = (nextStatus: FoiaRequestStatus) => {
    setStatus(nextStatus);
    if (nextStatus === 'fulfilled') {
      // Open fulfillment modal instead of saving immediately
      setPendingFulfillmentStatus(true);
      setShowFulfillmentModal(true);
    } else {
      persistRequest(nextStatus, notes, { showSavedBadge: false });
    }
  };

  const handleFulfillmentSubmit = async (metadata: FulfillmentMetadata) => {
    setShowFulfillmentModal(false);
    setPendingFulfillmentStatus(false);
    setSaving(true);
    try {
      const pressAccountId = pressAccount?.id ?? persistedRequest?.press_account_id ?? null;
      const nowIso = new Date().toISOString();
      let result: FoiaRequest;

      const fulfillmentFields = {
        status: 'fulfilled' as const,
        notes,
        press_account_id: pressAccountId,
        updated_at: nowIso,
        response_received_at: nowIso,
        data_quality_score: metadata.data_quality_score,
        data_format: metadata.data_format,
        fee_amount: metadata.fee_amount,
        redaction_flag: metadata.redaction_flag,
        estimated_row_count: metadata.estimated_row_count,
        is_snap_usable: metadata.is_snap_usable,
        fulfillment_file_url: metadata.fulfillment_file_url,
        fulfillment_received_at: nowIso,
      };

      if (persistedRequest) {
        const { data, error } = await db
          .from('foia_requests')
          .update(fulfillmentFields)
          .eq('id', persistedRequest.id)
          .select('*')
          .single();
        if (error) throw error;
        result = data as FoiaRequest;
      } else {
        const { data, error } = await db
          .from('foia_requests')
          .upsert({
            target_id: item.id,
            va_id: vaId,
            requested_by: vaId,
            ...fulfillmentFields,
            sent_at: null,
          }, { onConflict: 'target_id,va_id' })
          .select('*')
          .single();
        if (error) throw error;
        result = data as FoiaRequest;
      }

      setPersistedRequest(result);
      onSaved(result);
      queryClient.invalidateQueries({ queryKey: ['va-dashboard', vaId] });

      supabase.functions.invoke('rotate-va-batch', {
        body: { action: 'check-batch-completion', va_id: vaId },
      }).catch(() => {});

      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      const message = (err as any)?.message ?? 'Failed to save fulfillment';
      toast({ title: 'Save failed', description: message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleFulfillmentClose = () => {
    setShowFulfillmentModal(false);
    if (pendingFulfillmentStatus) {
      // Revert status if they close without completing
      setStatus((persistedRequest?.status as FoiaRequestStatus) ?? 'pending');
      setPendingFulfillmentStatus(false);
    }
  };

  const handleSaveUrl = async () => {
    setSavingUrl(true);
    try {
      const trimmed = foiaUrl.trim();
      const { error } = await db.from('targets').update({ foia_url: trimmed || null }).eq('id', item.id);
      if (error) throw error;
      setEditingUrl(false);
      toast({ title: 'URL saved', description: 'FOIA portal URL updated.' });
    } catch (err) {
      const message = (err as any)?.message ?? 'Failed to save URL';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    } finally {
      setSavingUrl(false);
    }
  };

  const handleNotesChange = (value: string) => {
    setNotes(value);
    if (noteSaveTimerRef.current) window.clearTimeout(noteSaveTimerRef.current);
    noteSaveTimerRef.current = window.setTimeout(() => {
      const originalNotes = persistedRequest?.notes ?? '';
      if (value !== originalNotes) {
        void persistRequest(status, value, { showSavedBadge: true });
      }
    }, 800);
  };

  const handleNotesBlur = async () => {
    if (noteSaveTimerRef.current) {
      window.clearTimeout(noteSaveTimerRef.current);
      noteSaveTimerRef.current = null;
    }
    const originalNotes = persistedRequest?.notes ?? '';
    if (notes !== originalNotes) {
      await persistRequest(status, notes, { showSavedBadge: true });
    }
  };

  const isDirty =
    status !== ((persistedRequest?.status as FoiaRequestStatus) ?? 'pending') ||
    notes !== (persistedRequest?.notes ?? '');

  return (
    <div className={cn('bg-white border rounded-lg overflow-hidden', flagged ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200')}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        {/* Flag / bookmark */}
        <button
          onClick={() => onToggleFlag(item.id)}
          className={cn('flex-shrink-0 transition-colors', flagged ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400')}
          title={flagged ? 'Remove reminder' : 'Remind me'}
        >
          <Bookmark className={cn('h-4 w-4', flagged && 'fill-amber-500')} />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-900 truncate">{item.jurisdiction_name}</span>
            <span className="text-xs text-slate-400">{item.state}</span>
            <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">
              {TARGET_TYPE_LABELS[item.target_type]}
            </span>
            {popLabel && (
              <span className="text-xs bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                <Users className="h-3 w-3" /> {popLabel}
              </span>
            )}
            {followUpBadge && (
              <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded border', followUpBadge.className)}>
                {followUpBadge.label}
              </span>
            )}
          </div>

          {/* Press credential label */}
          {pressAccount && (
            <p className="text-xs text-blue-600 mt-0.5">
              Submit as: <strong>{pressAccount.name}</strong>
              {pressAccount.domain && <span className="text-blue-400 ml-1">— {pressAccount.domain}</span>}
            </p>
          )}

          {/* Sent ago text */}
          {sentAgoText && (
            <p className="text-xs text-slate-400 mt-0.5">{sentAgoText}</p>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <StatusDropdown value={status} onChange={handleStatusChange} disabled={saving} />

          {foiaUrl && !editingUrl ? (
            <a
              href={foiaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-slate-900 hover:bg-slate-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
              onDoubleClick={(e) => { e.preventDefault(); setEditingUrl(true); }}
              title="Double-click to edit URL"
            >
              Open FOIA <ExternalLink className="h-3 w-3" />
            </a>
          ) : !editingUrl ? (
            <button onClick={() => setEditingUrl(true)} className="text-xs text-blue-600 hover:text-blue-800 underline">
              + Add URL
            </button>
          ) : null}

          <button onClick={() => setExpanded(!expanded)} className="text-slate-400 hover:text-slate-600">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* URL editor */}
      {editingUrl && (
        <div className="px-4 py-2 border-t border-slate-100 bg-blue-50 flex items-center gap-2">
          <input
            value={foiaUrl}
            onChange={(e) => setFoiaUrl(e.target.value)}
            placeholder="https://foia-portal-url.gov..."
            className="flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500"
          />
          <button onClick={handleSaveUrl} disabled={savingUrl} className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg font-medium">
            {savingUrl ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Save URL'}
          </button>
          <button onClick={() => { setEditingUrl(false); setFoiaUrl(item.foia_url ?? ''); }} className="text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      )}

      {/* Notes - always visible */}
      <div className="px-4 pb-3 pt-1">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <textarea
              value={notes}
              onChange={(e) => handleNotesChange(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Notes..."
              rows={1}
              className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-blue-500 resize-none bg-slate-50"
            />
          </div>
          {(isDirty || saving || saved) && (
            <button
              onClick={handleSave}
              disabled={saving || (!isDirty && !saved)}
              className={cn(
                'flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                saved ? 'bg-green-600 text-white' : isDirty ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
              )}
            >
              {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              {saved ? 'Saved!' : 'Save'}
            </button>
          )}
        </div>
      </div>

      {/* Portal difficulty rating - shown after marking "sent" */}
      {(status === 'sent' || status === 'fulfilled' || status === 'rejected') && (
        <PortalDifficultyRating targetId={item.id} currentScore={item.portal_difficulty_score ?? null} />
      )}

      {/* Expanded: Status History Timeline */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-slate-100 pt-3 bg-slate-50">
          <h4 className="text-xs font-semibold text-slate-600 mb-2">Status History</h4>
          <StatusTimeline entries={history} loading={historyLoading} />
        </div>
      )}

      {/* Fulfillment Intelligence Modal */}
      <FulfillmentModal
        open={showFulfillmentModal}
        onClose={handleFulfillmentClose}
        onSubmit={handleFulfillmentSubmit}
        requestId={persistedRequest?.id ?? null}
        jurisdictionName={item.jurisdiction_name}
      />
    </div>
  );
}
