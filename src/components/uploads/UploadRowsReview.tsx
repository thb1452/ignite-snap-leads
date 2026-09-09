import { Fragment, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/externalClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  readUploadReviewPage, UPLOAD_REVIEW_PAGE_SIZE,
  type UploadReviewPage, type UploadReviewRow,
} from '@/services/uploadStagingReview';

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
}

function text(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : 'Not supplied';
}

function kind(row: UploadReviewRow): 'legacy' | 'source' | 'unavailable' {
  const value = row.source_semantics;
  if (value == null || object(value).source_key === 'legacy_unknown') return 'legacy';
  const source = object(value);
  return source.version === 'municipal-source-semantics-v1'
    && ['syracuse_code_violations_v2', 'chicago_22u3_xenr'].includes(String(source.source_key))
    && source.review_state === 'pending_review' && source.customer_accepted === false
    && source.usable_records === false ? 'source' : 'unavailable';
}

function Fields({ items }: { items: [string, unknown][] }) {
  return <dl className="grid gap-2 sm:grid-cols-2">
    {items.map(([label, value]) => <div key={label}>
      <dt className="font-medium">{label}</dt>
      <dd className="whitespace-pre-wrap break-words">{text(value)}</dd>
    </div>)}
  </dl>;
}

export function SourceReviewDetails({ row }: { row: UploadReviewRow }) {
  const state = kind(row);
  if (state === 'legacy') return <p>Legacy upload: source field meanings have not been verified.</p>;
  if (state === 'unavailable') return <p role="alert">Source details cannot be interpreted by this viewer. Keep this row in review; no acceptance is shown.</p>;
  const source = object(row.source_semantics);
  const ids = object(source.identifiers);
  const status = object(source.status);
  const type = object(source.violation_type);
  const originalText = object(source.text);
  const dates = object(source.dates);
  const holds = Array.isArray(source.holds) ? source.holds.filter((value): value is string => typeof value === 'string') : [];
  const dateLabels = [
    ['citation', 'Citation / recorded violation date'],
    ['case_opened', 'Case opening date'],
    ['violation_opened', 'Violation opening date'],
    ['status_changed', 'Source status-change date'],
    ['source_modified', 'Source modification date'],
    ['compliance_due', 'Compliance due date'],
  ];
  return <div className="space-y-5">
    <p className="font-medium">Held for review. Not customer accepted or available for use. A source status does not establish a property's current condition.</p>
    <Fields items={[
      ['Source key', source.source_key], ['Source namespace', source.source_namespace],
      ['Observation ID', source.source_event_id], ['Collected at (as recorded)', source.collected_at],
      ['Source URL', source.source_url], ['Record grain', source.record_grain],
      ['Original source row', source.source_row], ['Source record ID', ids.source_record_id],
      ['Government violation ID', ids.government_violation_id], ['Published violation number', ids.published_violation_number],
      ['Case ID', ids.case_id], ['Case identifier availability', ids.case_identifier_available === false ? 'Not supplied by this source' : ids.case_identifier_available === true ? 'Available in this source' : null],
      ['Inspection number (separate from case)', ids.inspection_number],
      ['Property reference', ids.property_reference], ['Property reference meaning', ids.property_reference_kind],
    ]} />
    <p>Source property references are not customer property matches. An address group is not a verified tax parcel.</p>
    <Fields items={[
      ['Original violation type / code', type.original_value], ['Source-specific violation type', type.namespaced_value],
      ['Violation type meaning', type.value_kind], ['Source type description', type.source_description],
      ['Original violation status', status.original], ['Source mapping of violation status', status.normalized],
      ['Status meaning', status.meaning], ['Inspection status (separate)', status.inspection_status],
    ]} />
    <Fields items={[
      ['Original description', originalText.description], ['Inspector comments', originalText.inspector_comments],
      ['Ordinance', originalText.ordinance], ['Violation location', originalText.violation_location],
    ]} />
    <section className="space-y-3" aria-label="Source dates">
      <p>Dates retain their source meanings. Offset-free timestamps are shown as recorded, without a timezone conversion. Case opening and source modification dates are not violation opening dates.</p>
      {dateLabels.map(([key, label]) => {
        const date = object(dates[key]);
        return <div key={key} className="border-t pt-2">
          <h4 className="font-semibold">{label}</h4>
          {Object.keys(date).length === 0 ? <p>Not supplied</p> : <Fields items={[
            ['Meaning', date.meaning], ['Raw source value', date.raw], ['Source calendar date', date.calendar_date],
            ['UTC representation of the source timestamp', date.iso_utc],
            ['Timezone', date.timezone ?? 'Not specified by source'], ['Precision', date.precision],
          ]} />}
        </div>;
      })}
    </section>
    <section aria-label="Review holds">
      <h4 className="font-semibold">Review holds</h4>
      {holds.length ? <ul className="list-disc pl-5">{holds.map((hold, index) => <li key={`${index}:${hold}`}>{hold}</li>)}</ul>
        : <p>Hold details unavailable. This row remains in review.</p>}
    </section>
  </div>;
}

export function UploadReviewPageView({ page }: { page: UploadReviewPage }) {
  return <>
    {page.rows.some(row => kind(row) !== 'legacy') && <p className="mb-4">
      Source-native rows are staged for review only. Upload completion is not customer acceptance, an import into CRM, or an assessment of current conditions.
    </p>}
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="border-b">
          {['Row', 'Address', 'City', 'Violation', 'Processing / review state', 'Error / hold'].map(label => <th className="text-left p-2" key={label}>{label}</th>)}
        </tr></thead>
        <tbody>{page.rows.map(row => <Fragment key={row.id}>
          <tr className="border-b">
            <td className="p-2">{row.row_num}</td><td className="p-2">{row.address}</td><td className="p-2">{row.city}</td>
            <td className="p-2 whitespace-pre-wrap break-words">{row.violation}</td>
            <td className="p-2">{kind(row) === 'legacy' ? (row.processed ? 'Processed' : 'Pending processing') : 'Held for review'}</td>
            <td className="p-2 whitespace-pre-wrap break-words">{row.error || '—'}</td>
          </tr>
          <tr className="border-b"><td colSpan={6} className="p-2">
            <details><summary className="cursor-pointer font-medium">{kind(row) === 'legacy' ? 'Source meaning' : 'Source details and review holds'} — row {row.row_num}</summary>
              <div className="py-3"><SourceReviewDetails row={row} /></div>
            </details>
          </td></tr>
        </Fragment>)}</tbody>
      </table>
    </div>
  </>;
}

export function UploadRowsReview({ jobId, viewerId }: { jobId: string; viewerId: string }) {
  const [offset, setOffset] = useState(0);
  const query = useQuery({
    queryKey: ['upload-staging-review', viewerId, jobId, offset],
    queryFn: ({ signal }) => readUploadReviewPage(supabase, jobId, offset, signal),
    enabled: !!viewerId && !!jobId,
    gcTime: 0,
    retry: false,
  });
  const page = query.data;
  // Hide cached rows during a failed or in-flight refresh. Never substitute an empty success.
  const ready = !!page && !query.isFetching && !query.isError;
  return <Card>
    <CardHeader><CardTitle>Upload rows</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Pages show rows visible to your signed-in account. If a job is still processing, its rows may change; refresh from the first page when processing finishes.</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" disabled={query.isFetching} onClick={() => offset === 0 ? void query.refetch() : setOffset(0)}>Refresh from first page</Button>
        <Button variant="outline" disabled={offset === 0 || query.isFetching} onClick={() => setOffset(Math.max(0, offset - UPLOAD_REVIEW_PAGE_SIZE))}>Previous</Button>
        <Button variant="outline" disabled={!ready || offset + page.rows.length >= page.total} onClick={() => setOffset(offset + UPLOAD_REVIEW_PAGE_SIZE)}>Next</Button>
      </div>
      {query.isFetching && <p role="status">Loading review rows…</p>}
      {query.isError && <div role="alert"><p>Review rows could not be loaded. No complete row count is available for this page.</p><Button variant="outline" onClick={() => void query.refetch()}>Retry page</Button></div>}
      {ready && <>
        <p role="status">{page.rows.length ? `Rows ${offset + 1}–${offset + page.rows.length} of ${page.total}` : `No rows on this page (${page.total} visible rows in this job).`}</p>
        {page.rows.length > 0 && <UploadReviewPageView page={page} />}
      </>}
    </CardContent>
  </Card>;
}
