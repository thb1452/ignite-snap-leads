import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { exportSourceDetailCsv, getExportErrorToast } from '@/services/export';

/** Mount in the existing owner review view with a saved customer_export acceptance ID. */
export function SourceDetailExportButton({ acceptanceId }: { acceptanceId: string | null }) {
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  async function download() {
    if (!acceptanceId || busy) return;
    setBusy(true);
    try {
      const result = await exportSourceDetailCsv(acceptanceId);
      toast({ title: 'Source details downloaded',
        description: `${result.eventCount} dated source records across ${result.propertyCount} properties, with their original evidence.` });
    } catch (error) {
      toast(getExportErrorToast(error));
    } finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <Button type="button" disabled={!acceptanceId || busy} onClick={download}>
      {busy ? 'Preparing source details…' : 'Download reviewed source details'}
    </Button>
    <p className="text-sm text-muted-foreground">
      {acceptanceId
        ? 'Private dated source records. Downloading again reuses the saved receipt.'
        : 'A separate approval for this account is required before source details can be exported.'}
    </p>
  </div>;
}
