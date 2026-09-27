import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/hooks/use-auth';
import { loadCleanSyracuseCatalog } from '@/services/loadCleanSyracuseCatalog';
import { exportSourceDetailCsv } from '@/services/export';
import { SYRACUSE_DATASET_PUBLICATION_DATE } from '../../supabase/functions/_shared/cleanInvestorEvidence';

export default function AcceptedSyracuseProperties() {
  const { user } = useAuth();
  const { propertyId } = useParams<{ propertyId?: string }>();
  const [search, setSearch] = useState('');
  const [exporting, setExporting] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const actor = user?.id ?? null;
  const queryText = propertyId ? '' : search.trim();
  const query = useQuery({
    queryKey: ['accepted-syracuse', actor, queryText],
    queryFn: () => loadCleanSyracuseCatalog(actor!, queryText),
    enabled: !!actor && search.length <= 80,
    staleTime: 0,
  });
  const properties = actor && query.data ? query.data : [];
  const visible = propertyId ? properties.filter(property => property.id === propertyId) : properties;

  async function download(acceptanceId: string) {
    setExportError(null); setExporting(acceptanceId);
    try { await exportSourceDetailCsv(acceptanceId); }
    catch (error) { setExportError(error instanceof Error ? error.message : 'The cleaned export is unavailable.'); }
    finally { setExporting(null); }
  }

  return <AppLayout><main className="mx-auto max-w-5xl p-4 md:p-8 space-y-6">
    <header className="space-y-2">
      <Link to={propertyId ? '/properties/syracuse' : '/properties'} className="text-sm underline">
        {propertyId ? 'Syracuse search' : 'All properties'}
      </Link>
      <h1 className="text-3xl font-semibold">{propertyId && visible[0] ? visible[0].address : 'Syracuse enforcement history'}</h1>
      <p className="text-muted-foreground">City records accepted for your account. Each violation remains a separate dated record.</p>
    </header>
    {!propertyId && <label className="block max-w-xl text-sm">Search address, city or ZIP
      <input className="mt-2 w-full rounded-md border bg-background p-3" value={search}
        onChange={e => setSearch(e.target.value)} maxLength={80} placeholder="Address or ZIP" />
    </label>}
    {!actor && <p role="status">Sign in to see properties accepted for your account.</p>}
    {actor && query.isLoading && <p role="status">Checking accepted records…</p>}
    {actor && query.error && <p role="alert">Accepted records could not be verified. Try again.</p>}
    {actor && !query.isLoading && !query.error && !visible.length &&
      <p role="status">{propertyId ? 'This property is unavailable for your account.' : 'No accepted Syracuse properties match this search.'}</p>}
    {exportError && <p role="alert" className="rounded-md border p-3">{exportError}</p>}
    <div className="space-y-5">{visible.map(property => <article key={property.id} className="rounded-xl border p-5 space-y-4">
      <div>
        <h2 className="text-xl font-semibold">{property.address}</h2>
        <p>{property.city}, {property.state} {property.zip}</p>
        <p className="mt-2 text-sm">{property.events.length} documented violations · {property.openCount} open at collection</p>
        <p className="text-sm text-muted-foreground">Latest collection {new Date(property.newestCollection).toLocaleString()}
          {property.stale ? ' · Collection older than the 48-hour target' : ' · Collection within the 48-hour target'}</p>
        {!propertyId && <Link className="mt-2 inline-block text-sm font-medium underline" to={`/properties/syracuse/${property.id}`}>Open property history</Link>}
      </div>
      {propertyId && <>
      <div className="rounded-md bg-muted/50 p-4 text-sm space-y-2">
        <p><strong>Evidence indicator:</strong> {property.openCount} documented open violation{property.openCount===1?'':'s'} in this selection.</p>
        <p>{property.insight?.documented_open_count_basis}</p>
        <p><strong>Investment score:</strong> unavailable. {property.insight?.score.reason}</p>
        <p>Market value, repair costs and owner intent are unavailable.</p>
        <p>The citation window is incomplete history. A missing later record does not prove a closure, and agency status does not prove current physical condition.</p>
        <p>The City dataset update time was not bound to these records. Collection age alone does not establish when the City last updated them.</p>
      </div>
      <details className="rounded-md border p-4" open>
        <summary className="cursor-pointer font-medium">View {property.events.length} dated violations and citations</summary>
        <div className="mt-4 space-y-4">{property.events.map(({event}) => <section key={event.record_key} className="border-t pt-4 text-sm space-y-1">
          <h3 className="font-medium">{event.cleaned_description}</h3>
          <p>Parcel {event.parcel_id} · Case {event.case_id} · Violation {event.published_violation_number}</p>
          <p>Agency status: {event.source_status} when collected {new Date(event.citation.collected_at).toLocaleString()}</p>
          <p>Violation cited {new Date(event.citation_at).toLocaleDateString()}
            {event.status_changed_at && ` · recorded status changed ${new Date(event.status_changed_at).toLocaleDateString()}`}</p>
          <p>Parent case opened {event.case_opened_at ? new Date(event.case_opened_at).toLocaleDateString() : 'date unavailable'}
            {event.compliance_due_at && ` · compliance due ${new Date(event.compliance_due_at).toLocaleDateString()}`}</p>
          <p className="text-muted-foreground">The case opening is not a separately verified violation-opening date. Status transitions before the observations below are unavailable.</p>
          <details className="py-2">
            <summary className="cursor-pointer">Recorded status observations</summary>
            <ul className="mt-2 space-y-1">{property.observations.filter(item => item.event.record_key === event.record_key)
              .sort((a,b) => a.event.citation.collected_at.localeCompare(b.event.citation.collected_at))
              .map(({event: observed}) => <li key={observed.citation.delivery_id}>
                {new Date(observed.citation.collected_at).toLocaleString()}: {observed.source_status}
                {' · '}<a className="underline" href={observed.citation.source_url} target="_blank" rel="noopener noreferrer">Source</a>
                {' · '}row {observed.citation.source_row}
              </li>)}</ul>
            <p className="text-muted-foreground">Repeated observations of the same violation are not additional violations.</p>
          </details>
          <p className="text-muted-foreground"><strong>What this means:</strong> {property.insight?.implications.find(item=>item.record_key===event.record_key)?.text}</p>
          <p>Source: <a className="underline" href={event.citation.source_url} target="_blank" rel="noopener noreferrer">
            City of Syracuse Code Violations V2</a> · row {event.citation.source_row} · parcel evidence retrieved {new Date(event.citation.parcel_retrieved_at).toLocaleString()}</p>
          {!event.citation.publication_date && <p className="text-muted-foreground">The portal did not supply an individual publication date for this violation.</p>}
          <p className="text-xs text-muted-foreground">Evidence SHA-256: {event.citation.original_sha256}</p>
        </section>)}</div>
      </details>
      </>}
      <div className="flex flex-wrap gap-2">
        {property.acceptanceIds.map(id => <button key={id} type="button" className="rounded-md border px-4 py-2 text-sm"
          disabled={!!exporting} onClick={() => void download(id)}>
          {exporting===id ? 'Preparing cleaned export…' : 'Export accepted batch'}
        </button>)}
      </div>
      <p className="text-xs text-muted-foreground">City of Syracuse Open Data, Code Violations V2.
        <a className="ml-1 underline" href="https://data.syr.gov/datasets/107745f070b049feb38273a7ab200487_0/about" target="_blank" rel="noopener noreferrer">Dataset</a>
        {' '}published {SYRACUSE_DATASET_PUBLICATION_DATE}. The City of Syracuse makes no representation, warranty or guarantee relating to the data or analyses derived from these data.
        {' '}<a className="underline" href="https://data.syr.gov/pages/termsofuse" target="_blank" rel="noopener noreferrer">Source terms</a>.</p>
    </article>)}</div>
  </main></AppLayout>;
}
