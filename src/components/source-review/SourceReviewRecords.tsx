import type { SourceReviewPage } from '@/services/sourceReview';
import { sourceLink } from '@/services/sourceReview';

const holdLabels: Record<string, string> = {
  confidentiality_not_provided: 'Confidentiality information was not supplied',
  unit_not_provided: 'The affected unit was not supplied',
  current_building_and_unit_scope_unverified: 'Present building and unit conditions are unverified',
  current_private_original_proof_not_bound: 'Original archive proof needs its release connection',
  customer_property_mapping_missing: 'Customer release mapping is pending',
  customer_entitlement_not_connected: 'Customer access rules are pending',
  customer_release_approval_missing: 'Release approval is pending',
  distribution_review_pending: 'Distribution review is pending',
};
function calendar(value: string | null) {
  if (!value) return 'Not supplied';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(value + 'T12:00:00Z').toLocaleDateString('en-US', {timeZone: 'UTC',year:'numeric',month:'short',day:'numeric'});
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString('en-US', {timeZone: 'UTC',year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) + ' UTC';
}
export function SourceReviewRecords({page, offset, busy, onPage, onRefresh}: {
  page: SourceReviewPage; offset: number; busy: boolean; onPage: (offset: number) => void; onRefresh: () => void;
}) {
  const url = sourceLink(page.batch.source_url);
  return <div className="space-y-6">
    <div className="grid gap-4 sm:grid-cols-3">
      <Summary label="Source violations" value={page.batch.event_count} />
      <Summary label="Distinct parcels" value={page.batch.property_count} />
      <Summary label="Collected" value={calendar(page.batch.collected_at)} />
    </div>
    <section className="rounded-xl border bg-card p-5 space-y-2">
      <h2 className="font-semibold">{page.batch.source_name}</h2>
      <p className="text-sm text-muted-foreground">These records are awaiting release review. Each violation remains separate, including violations that share a case or property.</p>
      {url && <a className="text-sm underline underline-offset-4" href={url} target="_blank" rel="noreferrer">View the government source</a>}
      {page.batch.limitations.length > 0 && <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">{page.batch.limitations.map((item,i) => <li key={i}>{item}</li>)}</ul>}
    </section>
    <div className="flex flex-wrap gap-3 items-center justify-between">
      <div><h2 className="font-semibold text-lg">Original records</h2><p className="text-sm text-muted-foreground">Showing {page.events.length ? offset + 1 : 0}–{offset + page.events.length} of {page.batch.event_count} violations</p></div>
      <button className="rounded-lg border px-4 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={busy} onClick={onRefresh}>Refresh records</button>
    </div>
    <div className="space-y-3">{page.events.map(event => <article key={event.record_key} className="rounded-xl border bg-card p-5">
      <div className="flex flex-wrap justify-between gap-3">
        <div><h3 className="font-semibold">{event.property.address}</h3><p className="text-sm text-muted-foreground">{event.property.city}, {event.property.state} {event.property.zip}</p></div>
        <div className="text-sm sm:text-right"><p>{event.source_status || 'Status not supplied'}</p><p className="text-muted-foreground">Violation date: {calendar(event.violation_date)}</p></div>
      </div>
      <p className="mt-4 whitespace-pre-wrap">{event.original_description || 'Description not supplied'}</p>
      <p className="mt-3 text-xs text-muted-foreground break-words">Case {event.case_id} · Violation {event.published_violation_number || event.government_violation_id} · Parcel {event.property.source_parcel_reference}</p>
      <details className="mt-4 border-t pt-3">
        <summary className="cursor-pointer text-sm font-medium">Source evidence and review notes</summary>
        <div className="mt-4 grid gap-5 md:grid-cols-2 text-sm">
          <div className="space-y-2"><h4 className="font-semibold">Dates recorded by the agency</h4><p>Case opened: {calendar(event.opened_date)}</p><p>Status changed: {calendar(event.status_changed_utc)}</p><p>Compliance due: {calendar(event.compliance_due_utc)}</p><p className="text-muted-foreground">{event.source_attribution}</p><p className="whitespace-pre-wrap text-muted-foreground">{event.source_notice}</p></div>
          <div className="space-y-2"><h4 className="font-semibold">Dated parcel evidence</h4>{event.parcel_evidence ? <>
            <p>{event.parcel_evidence.map_title}</p>
            <p>Recorded residential units: {event.parcel_evidence.recorded_residential_units ?? 'Not supplied'}</p><p className="text-muted-foreground">{event.parcel_evidence.field_notes.n_ResUnits}</p>
            <p>Recorded year built: {event.parcel_evidence.recorded_year_built ?? 'Not supplied'}</p><p className="text-muted-foreground">{event.parcel_evidence.field_notes.yr_built}</p>
            <p>Recorded lot acres: {event.parcel_evidence.recorded_lot_acres ?? 'Not supplied'}</p><p className="text-muted-foreground">{event.parcel_evidence.field_notes.ACRES}</p>
            <p>Retrieved: {calendar(event.parcel_evidence.source_retrieved_at)}</p><p className="text-muted-foreground">{event.parcel_evidence.vintage_note}</p>
            {sourceLink(event.parcel_evidence.source_url) && <a className="inline-block underline underline-offset-4" href={sourceLink(event.parcel_evidence.source_url)!} target="_blank" rel="noreferrer">View the parcel source</a>}
            <ul className="list-disc pl-5 text-muted-foreground space-y-1">{event.parcel_evidence.limitations.map((item,i) => <li key={i}>{item}</li>)}</ul>
          </> : <p className="text-muted-foreground">Parcel evidence is not connected to this record.</p>}</div>
        </div>
        <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm"><h4 className="font-semibold">Original intake review flags</h4><p className="mt-1 text-muted-foreground">Preserved from intake. Later evidence needs to be considered when deciding whether to release the record.</p><ul className="mt-2 list-disc pl-5 space-y-1">{event.review_reasons.map(reason => <li key={reason}>{holdLabels[reason] || reason.replace(/_/g,' ')}</li>)}</ul></div>
      </details>
    </article>)}</div>
    <div className="flex items-center justify-between gap-4">
      <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={busy || offset === 0} onClick={() => onPage(Math.max(0, offset - 25))}>Previous</button>
      <p className="text-xs text-muted-foreground">Checked {calendar(page.checked_at)}</p>
      <button className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40" disabled={busy || page.next_offset === null} onClick={() => page.next_offset !== null && onPage(page.next_offset)}>Next</button>
    </div>
  </div>;
}
function Summary({label,value}: {label: string;value: string | number}) {
  return <div className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-2 text-xl font-semibold">{value}</p></div>;
}
