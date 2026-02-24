import { useState } from 'react';
import { FoiaLayout } from '@/components/foia/shared/FoiaLayout';
import { ImportWizard } from '@/components/foia/admin/ImportWizard';
import type { ImportResult } from '@/types/foia';

export default function FoiaAdminImport() {
  const [lastResult, setLastResult] = useState<ImportResult | null>(null);

  return (
    <FoiaLayout>
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Import Targets</h1>
          <p className="text-slate-500 text-sm mt-1">
            Upload CSV or Excel files of FOIA targets. Duplicates are detected automatically.
          </p>
        </div>

        {lastResult && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg px-5 py-3 text-sm text-blue-800">
            Last import: <strong>{lastResult.imported.toLocaleString()}</strong> imported,{' '}
            <strong>{lastResult.skipped.toLocaleString()}</strong> duplicates skipped,{' '}
            <strong>{lastResult.errors}</strong> errors
          </div>
        )}

        <ImportWizard onComplete={setLastResult} />
      </div>
    </FoiaLayout>
  );
}
