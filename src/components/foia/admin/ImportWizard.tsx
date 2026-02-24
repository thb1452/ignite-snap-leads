import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2, X } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '@/integrations/supabase/client';
import { hashUrl } from '@/lib/foia/dedup';
import type { ColumnMapping, ImportResult, TargetType } from '@/types/foia';
import { cn } from '@/lib/utils';

type RawRow = Record<string, string>;

const TARGET_TYPE_OPTIONS: { value: TargetType; label: string }[] = [
  { value: 'county_foia', label: 'County FOIA' },
  { value: 'city_foia', label: 'City FOIA' },
  { value: 'water_shutoff', label: 'Water Shutoff' },
  { value: 'population_list', label: 'Population List' },
];

interface ImportWizardProps {
  onComplete: (result: ImportResult) => void;
}

export function ImportWizard({ onComplete }: ImportWizardProps) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing' | 'done'>('upload');
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [defaultType, setDefaultType] = useState<TargetType>('county_foia');
  const [mapping, setMapping] = useState<ColumnMapping>({
    jurisdiction_name: '',
    state: '',
    county: '',
    population: '',
    target_type: '',
    foia_url: '',
  });
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;
    setFileName(file.name);

    const ext = file.name.split('.').pop()?.toLowerCase();
    let rows: RawRow[] = [];

    if (ext === 'csv') {
      const text = await file.text();
      const result = Papa.parse<RawRow>(text, { header: true, skipEmptyLines: true });
      rows = result.data;
    } else if (ext === 'xlsx' || ext === 'xls') {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      rows = XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' });
    } else {
      return;
    }

    if (rows.length === 0) return;

    setRawRows(rows);
    const cols = Object.keys(rows[0]);
    setColumns(cols);

    // Auto-detect column mapping
    const autoMap: ColumnMapping = {
      jurisdiction_name: '',
      state: '',
      county: '',
      population: '',
      target_type: '',
      foia_url: '',
    };
    const normalizeCol = (c: string) => c.toLowerCase().replace(/[\s_-]/g, '');
    for (const col of cols) {
      const n = normalizeCol(col);
      if (!autoMap.jurisdiction_name && (n.includes('jurisdiction') || n.includes('name') || n.includes('county') || n.includes('city'))) {
        autoMap.jurisdiction_name = col;
      }
      if (!autoMap.state && n === 'state') autoMap.state = col;
      if (!autoMap.population && n.includes('pop')) autoMap.population = col;
      if (!autoMap.foia_url && (n.includes('url') || n.includes('link') || n.includes('foia'))) {
        autoMap.foia_url = col;
      }
    }
    setMapping(autoMap);
    setStep('map');
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls'],
    },
    maxFiles: 1,
  });

  const handleImport = async () => {
    if (!mapping.jurisdiction_name || !mapping.state) {
      setImportError('Jurisdiction name and state columns are required');
      return;
    }

    setStep('importing');
    setImportError('');

    let imported = 0;
    let skipped = 0;
    let errors = 0;
    const duplicates: string[] = [];

    const BATCH_SIZE = 100;

    // Fetch existing url_hashes from DB to check against
    const { data: existingHashes } = await supabase
      .from('targets')
      .select('url_hash')
      .not('url_hash', 'is', null);

    const dbHashes = new Set((existingHashes || []).map((r: { url_hash: string }) => r.url_hash));
    const batchHashes = new Set<string>();

    const inserts: Record<string, unknown>[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];

      const jurisdictionName = String(row[mapping.jurisdiction_name] || '').trim();
      const state = String(row[mapping.state] || '').trim().toUpperCase().substring(0, 2);

      if (!jurisdictionName || !state) {
        errors++;
        continue;
      }

      const foiaUrl = mapping.foia_url ? String(row[mapping.foia_url] || '').trim() : '';
      let urlHash: string | null = null;
      let isDuplicate = false;

      if (foiaUrl) {
        urlHash = hashUrl(foiaUrl);
        if (dbHashes.has(urlHash) || batchHashes.has(urlHash)) {
          isDuplicate = true;
          duplicates.push(`${jurisdictionName}, ${state}`);
          skipped++;
          continue;
        }
        batchHashes.add(urlHash);
      }

      const targetType: TargetType = mapping.target_type
        ? (String(row[mapping.target_type] || '').trim() as TargetType) || defaultType
        : defaultType;

      inserts.push({
        jurisdiction_name: jurisdictionName,
        state,
        county: mapping.county ? String(row[mapping.county] || '').trim() || null : null,
        population: mapping.population
          ? parseInt(String(row[mapping.population] || '0').replace(/,/g, ''), 10) || null
          : null,
        target_type: targetType,
        foia_url: foiaUrl || null,
        url_hash: urlHash,
        source_file: fileName,
        is_duplicate: isDuplicate,
      });

      if (inserts.length >= BATCH_SIZE) {
        const { error } = await supabase.from('targets').insert(inserts);
        if (error) {
          errors += inserts.length;
        } else {
          imported += inserts.length;
        }
        inserts.length = 0;
        setProgress(Math.round((i / rawRows.length) * 100));
      }
    }

    // Flush remaining
    if (inserts.length > 0) {
      const { error } = await supabase.from('targets').insert(inserts);
      if (error) {
        errors += inserts.length;
      } else {
        imported += inserts.length;
      }
    }

    setProgress(100);
    const finalResult: ImportResult = { imported, skipped, errors, duplicates };
    setResult(finalResult);
    setStep('done');
    onComplete(finalResult);
  };

  return (
    <div className="space-y-6">
      {step === 'upload' && (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors',
            isDragActive
              ? 'border-blue-500 bg-blue-50'
              : 'border-slate-300 hover:border-blue-400 hover:bg-slate-50'
          )}
        >
          <input {...getInputProps()} />
          <Upload className="h-12 w-12 text-slate-400 mx-auto mb-4" />
          <p className="text-slate-700 font-medium">
            {isDragActive ? 'Drop your file here' : 'Drop a CSV or Excel file here'}
          </p>
          <p className="text-slate-400 text-sm mt-1">or click to browse</p>
          <p className="text-slate-400 text-xs mt-3">Supports .csv, .xlsx, .xls</p>
        </div>
      )}

      {step === 'map' && (
        <div className="space-y-6">
          <div className="flex items-center gap-3 text-sm text-slate-600 bg-slate-100 rounded-lg px-4 py-2">
            <FileText className="h-4 w-4" />
            <span><strong>{fileName}</strong> — {rawRows.length.toLocaleString()} rows loaded</span>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-900 mb-4">Map Columns</h3>
            <div className="grid grid-cols-2 gap-4">
              {(
                [
                  { key: 'jurisdiction_name', label: 'Jurisdiction Name *', required: true },
                  { key: 'state', label: 'State (2-letter) *', required: true },
                  { key: 'county', label: 'Parent County' },
                  { key: 'population', label: 'Population' },
                  { key: 'foia_url', label: 'FOIA URL' },
                  { key: 'target_type', label: 'Target Type (override)' },
                ] as Array<{ key: keyof ColumnMapping; label: string; required?: boolean }>
              ).map(({ key, label, required }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
                  <select
                    value={mapping[key] || ''}
                    onChange={(e) => setMapping((m) => ({ ...m, [key]: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
                  >
                    <option value="">{required ? 'Select column...' : '— not mapped —'}</option>
                    {columns.map((col) => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            <div className="mt-4 pt-4 border-t border-slate-100">
              <label className="block text-sm font-medium text-slate-700 mb-1">Default Target Type</label>
              <select
                value={defaultType}
                onChange={(e) => setDefaultType(e.target.value as TargetType)}
                className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-blue-500"
              >
                {TARGET_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <p className="text-slate-400 text-xs mt-1">Used when the type column is empty or not mapped</p>
            </div>
          </div>

          {/* Preview first 5 rows */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-sm font-medium text-slate-700">Preview (first 5 rows)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="text-xs w-full">
                <thead>
                  <tr className="bg-slate-50">
                    {columns.slice(0, 8).map((col) => (
                      <th key={col} className="text-left px-3 py-2 text-slate-500 font-medium whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rawRows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {columns.slice(0, 8).map((col) => (
                        <td key={col} className="px-3 py-2 text-slate-700 max-w-[150px] truncate">
                          {String(row[col] || '')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {importError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-4 py-2">
              <AlertCircle className="h-4 w-4" />
              {importError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => { setStep('upload'); setRawRows([]); setColumns([]); }}
              className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
            >
              Back
            </button>
            <button
              onClick={handleImport}
              disabled={!mapping.jurisdiction_name || !mapping.state}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg text-sm font-medium disabled:opacity-60 transition-colors"
            >
              Import {rawRows.length.toLocaleString()} Rows
            </button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="text-center py-12">
          <Loader2 className="h-10 w-10 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-slate-700 font-medium">Importing targets...</p>
          <div className="w-64 bg-slate-200 rounded-full h-2 mx-auto mt-4">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-slate-400 text-sm mt-2">{progress}%</p>
        </div>
      )}

      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-green-700 bg-green-50 border border-green-200 rounded-xl px-5 py-4">
            <CheckCircle className="h-6 w-6 text-green-600" />
            <div>
              <p className="font-semibold">Import complete</p>
              <p className="text-sm text-green-600">
                {result.imported.toLocaleString()} imported · {result.skipped.toLocaleString()} duplicates skipped · {result.errors} errors
              </p>
            </div>
          </div>
          <button
            onClick={() => { setStep('upload'); setRawRows([]); setColumns([]); setResult(null); }}
            className="px-4 py-2 border border-slate-300 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
          >
            Import Another File
          </button>
        </div>
      )}
    </div>
  );
}
