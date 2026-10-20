import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  BUFFALO_REVIEW_PAGE_SIZE, buffaloCalendarDate, loadBuffaloSourceReview,
  type BuffaloReviewResult, type BuffaloReviewRpc,
} from '@/services/buffaloSourceReview';

const observedTime = (value: string) => new Date(value).toLocaleString('en-US', {
  timeZone: 'America/New_York', year: 'numeric', month: 'short', day: 'numeric',
  hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
});

/** Read-only. Buffalo is never passed into the Syracuse release or acceptance actions. */
export function BuffaloSourceReview({actor}: {actor: string}) {
  const [offset, setOffset] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState<{actor: string; offset: number; page: BuffaloReviewResult} | null>(null);
  const [failure, setFailure] = useState<{actor: string; offset: number; message: string} | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    setResult(null); setFailure(null); setBusy(true);
    loadBuffaloSourceReview(supabase as unknown as BuffaloReviewRpc, offset, controller.signal)
      .then(page => { if (active) setResult({actor, offset, page}); })
      .catch(reason => {
        if (active) setFailure({actor, offset, message: controller.signal.aborted ?
          'The Buffalo record check took too long. Please try again.' :
          reason instanceof Error ? reason.message : 'The Buffalo records could not be loaded.'});
      })
      .finally(() => { clearTimeout(timeout); if (active) setBusy(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [actor, offset, refresh]);
  const visible = result?.actor === actor && result.offset === offset ? result.page : null;
  const error = failure?.actor === actor && failure.offset === offset ? failure.message : null;
  const page = visible?.status === 'available' ? visible : null;

  return <section aria-labelledby="buffalo-review-heading" className="space-y-5 border-b pb-7">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h2 id="buffalo-review-heading" className="text-2xl font-semibold">Buffalo residential pilot</h2>
        <p className="mt-1 text-sm text-muted-foreground">Residential Code records, preserved as separate agency violations.</p></div>
      <button type="button" className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50" disabled={busy}
        onClick={() => setRefresh(value => value + 1)}>Refresh Buffalo records</button>
    </header>
    {busy && <p role="status" className="rounded-xl border p-5">Checking Buffalo records…</p>}
    {error && <p role="alert" className="rounded-xl border p-5">{error}</p>}
    {visible?.status === 'unavailable' && <p role="status" className="rounded-xl border p-5">No Buffalo pilot is assigned to this account.</p>}
    {page && <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Summary label="Source violations" value={page.batch.event_count} />
        <Summary label="Distinct cases" value={page.batch.case_count} />
        <Summary label="Complete addresses" value={page.batch.address_count} />
      </div>
      <div className="rounded-xl border bg-card p-5 space-y-2 text-sm">
        <h3 className="font-semibold">{page.batch.source_name}</h3>
        <p>Collected {observedTime(page.batch.collected_at)}. ACTIVE is the agency status in that snapshot; it does not confirm the status or physical condition today.</p>
        <p>Dates below are agency violation dates. Case opening dates, days open and an investment score are not supplied by this batch.</p>
        <p>Multiple parcels can share an address; these counts do not establish a unique property total.</p>
        <p>{page.batch.held_count} records are held separately for duplicate review and excluded from these counts.</p>
        <a className="inline-block underline underline-offset-4" href={page.batch.source_url} target="_blank" rel="noopener noreferrer">View the City of Buffalo source</a>
        {page.batch.limitations.length > 0 && <details><summary className="cursor-pointer">Collection limitations</summary>
          <ul className="mt-2 list-disc pl-5 text-muted-foreground space-y-1">{page.batch.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </details>}
      </div>
      <p className="text-sm text-muted-foreground">Showing {offset + 1}–{offset + page.events.length} of {page.batch.event_count} Buffalo violations</p>
      <div className="space-y-3">{page.events.map(event => <article key={event.agency_record_id} className="rounded-xl border bg-card p-5 space-y-3">
        <div className="flex flex-wrap justify-between gap-3">
          <div><h3 className="font-semibold">{event.address}</h3><p className="text-sm text-muted-foreground">{event.city}, {event.state} {event.zip}</p></div>
          <div className="text-sm sm:text-right"><p>{event.source_status} at collection</p><p>Violation date: {buffaloCalendarDate(event.violation_date)}</p></div>
        </div>
        <p className="whitespace-pre-wrap">{event.violation_description || 'Description not supplied'}</p>
        {event.comments && <p className="whitespace-pre-wrap text-sm">{event.comments}</p>}
        {event.violation_location && <p className="text-sm"><strong>Violation location:</strong> {event.violation_location}</p>}
        <p className="text-xs text-muted-foreground break-words">Case {event.case_number} · Agency violation ID {event.agency_record_id}</p>
        <details className="border-t pt-3 text-sm">
          <summary className="cursor-pointer font-medium">Source evidence</summary>
          <div className="mt-3 space-y-2 break-words">
            <p>Violation code: {event.violation_code || 'Not supplied'}</p>
            <p>Code section: {event.code_section || 'Not supplied'} · Case type: {event.case_type || 'Not supplied'}</p>
            <p>Parcel: {event.parcel_id || 'Not supplied'} · Residential class: {event.property_class}</p>
            <p className="text-muted-foreground">{event.residential_evidence}</p>
            <p>Original source date: {event.source_date_raw}. No timezone or case opening date is inferred from this value.</p>
            <p>Original source row: {event.source_row_number}</p>
            <p className="text-xs text-muted-foreground">Source content SHA-256: {event.source_content_hash}</p>
          </div>
        </details>
      </article>)}</div>
      <div className="flex items-center justify-between gap-4">
        <button type="button" className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
          disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - BUFFALO_REVIEW_PAGE_SIZE))}>Previous Buffalo records</button>
        <button type="button" className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40"
          disabled={busy || page.next_offset === null} onClick={() => {if (page.next_offset !== null) setOffset(page.next_offset);}}>Next Buffalo records</button>
      </div>
      <p className="text-xs text-muted-foreground">Checked {observedTime(page.checked_at)}. Review access does not publish these records to customer leads.</p>
    </>}
  </section>;
}

function Summary({label, value}: {label: string; value: number}) {
  return <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold">{value.toLocaleString('en-US')}</p></div>;
}
