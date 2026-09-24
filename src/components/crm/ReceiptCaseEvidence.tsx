import type { ReceiptCaseDetail } from '@/services/receiptCaseContract';

export function ReceiptCaseEvidence({detail}: {detail: ReceiptCaseDetail}) {
  return <div className="space-y-3">
    <p className="font-medium">{detail.property.address}, {detail.property.city}, {detail.property.state}</p>
    <p className="text-sm font-medium">{detail.snapshot.evidence_kind === 'synthetic' ? 'Synthetic test records — not real property evidence' : 'Original-backed case snapshot'}</p>
    <p className="text-sm">Report date: {detail.snapshot.report_date} · Received: {new Date(detail.snapshot.received_at).toLocaleString()}</p>
    <p className="text-sm">Reviewed subset: {detail.snapshot.reviewed_count} of {detail.snapshot.original_count} cases · {detail.snapshot.held_count} held outside this subset.</p>
    <ul className="list-disc pl-5 text-sm text-muted-foreground">{detail.limitations.map(item => <li key={item}>{item}</li>)}</ul>
    <p className="text-xs text-muted-foreground">Access ends {new Date(detail.snapshot.valid_until).toLocaleString()}. Permission is checked again on revisit, focus and while this view is open.</p>
    {detail.cases.map(row => <details key={row.version_id} className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Case {row.case_id} · {row.status || 'Status not supplied'}</summary>
      <div className="mt-3 space-y-2"><p>Category: {row.category}</p><p>Filed: {row.filed_date} · Closed: {row.closed_date || 'Not supplied'}</p>
        <p className="whitespace-pre-wrap">{row.cleaned_description}</p>
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Source citation</summary>
          <dl className="mt-2 space-y-1 break-all">{Object.entries(row.citation).map(([key, value]) => <div key={key}><dt className="inline font-medium">{key.replace(/_/g, ' ')}: </dt><dd className="inline">{Array.isArray(value) ? value.join(', ') : value}</dd></div>)}
            <div><dt className="inline font-medium">Cleaning rule: </dt><dd className="inline">{row.cleaning_rule_version}</dd></div>
            <div><dt className="inline font-medium">Version: </dt><dd className="inline">{row.version_id}</dd></div></dl>
        </details>
      </div>
    </details>)}
  </div>;
}
