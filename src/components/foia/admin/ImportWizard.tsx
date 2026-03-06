import { useState, useCallback } from 'react';
import { useDropzone, type FileRejection } from 'react-dropzone';
import { Upload, FileText, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db } from '@/lib/foia/db';
import { hashUrl } from '@/lib/foia/dedup';
import type { ColumnMapping, ImportResult, TargetType, FoiaRequestStatus } from '@/types/foia';
import { cn } from '@/lib/utils';

type RawRow = Record<string, string>;

const TARGET_TYPE_OPTIONS: { value: TargetType; label: string }[] = [
  { value: 'county_foia', label: 'County FOIA' },
  { value: 'city_foia', label: 'City FOIA' },
  { value: 'water_shutoff', label: 'Water Shutoff' },
  { value: 'population_list', label: 'Population List' },
];

/** Map CSV status strings to our system enum */
function mapCsvStatus(raw: string): FoiaRequestStatus {
  const s = raw.toLowerCase().trim();
  if (s === 'fulfilled' || s === 'received') return 'fulfilled';
  if (s === 'sent' || s === 'already sent' || s === 'submitted') return 'sent';
  if (s === 'fee quote' || s === 'fee' || s === 'needs review') return 'needs_review';
  if (s === 'rejected' || s === 'denied') return 'rejected';
  if (s === 'no portal') return 'no_portal';
  return 'pending';
}

/** Detect default target type from filename */
function detectTargetType(fileName: string): TargetType {
  const lower = fileName.toLowerCase();
  if (lower.includes('water') || lower.includes('shut')) return 'water_shutoff';
  return 'city_foia';
}

/** All column mapping fields with labels */
const MAPPING_FIELDS: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: 'jurisdiction_name', label: 'Jurisdiction Name *', required: true },
  { key: 'state', label: 'State (2-letter) *', required: true },
  { key: 'county', label: 'Parent County' },
  { key: 'population', label: 'Population' },
  { key: 'foia_url', label: 'FOIA URL' },
  { key: 'contact_email', label: 'Contact Email' },
  { key: 'submission_method', label: 'Submission Method' },
  { key: 'notes', label: 'Notes' },
  { key: 'request_status', label: 'Request Status' },
  { key: 'request_date', label: 'Request Date' },
  { key: 'target_type', label: 'Target Type (override)' },
];

const EMPTY_MAPPING: ColumnMapping = {
  jurisdiction_name: '',
  state: '',
  county: '',
  population: '',
  target_type: '',
  foia_url: '',
  contact_email: '',
  submission_method: '',
  notes: '',
  request_status: '',
  request_date: '',
};

interface ImportWizardProps {
  onComplete: (result: ImportResult) => void;
}

export function ImportWizard({ onComplete }: ImportWizardProps) {
  const [step, setStep] = useState<'upload' | 'map' | 'importing' | 'done'>('upload');
  const [rawRows, setRawRows] = useState<RawRow[]>([]);
  const [columns, setColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');
  const [defaultType, setDefaultType] = useState<TargetType>('county_foia');
  const [mapping, setMapping] = useState<ColumnMapping>({ ...EMPTY_MAPPING });
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importError, setImportError] = useState('');

  const parseUploadedFile = useCallback(async (file: File): Promise<RawRow[]> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isLikelyCsv = ext === 'csv' || file.type === 'text/csv' || file.type === 'application/csv' || file.type === 'text/plain';
    const isLikelyExcel = ext === 'xlsx' || ext === 'xls' || file.type.includes('spreadsheetml') || file.type.includes('ms-excel');

    if (isLikelyCsv) {
      const text = await file.text();
      const parsed = Papa.parse<RawRow>(text, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => header.replace(/^\uFEFF/, '').trim(),
      });
      return parsed.data;
    }
    if (isLikelyExcel) {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = wb.SheetNames[0];
      if (!firstSheetName) return [];
      const ws = wb.Sheets[firstSheetName];
      return XLSX.utils.sheet_to_json<RawRow>(ws, { defval: '' });
    }
    throw new Error('Unsupported file type. Please upload .csv, .xlsx, or .xls');
  }, []);

  /** Auto-detect column mapping from headers */
  function autoDetectMapping(cols: string[]): ColumnMapping {
    const autoMap: ColumnMapping = { ...EMPTY_MAPPING };
    const norm = (c: string) => c.toLowerCase().replace(/[\s_-]/g, '');

    for (const col of cols) {
      const n = norm(col);

      // Jurisdiction name
      if (!autoMap.jurisdiction_name && (n.includes('jurisdiction') || n === 'name' || n === 'city' || n === 'county' || n.includes('cityname') || n.includes('countyname'))) {
        autoMap.jurisdiction_name = col;
      }
      if (!autoMap.state && n.includes('state')) autoMap.state = col;
      if (!autoMap.county && n === 'county') autoMap.county = col;
      if (!autoMap.population && n.includes('pop')) autoMap.population = col;
      if (!autoMap.target_type && (n.includes('targettype') || n === 'type')) autoMap.target_type = col;
      if (!autoMap.foia_url && (n.includes('url') || n.includes('link') || (n.includes('foia') && !n.includes('email')))) {
        autoMap.foia_url = col;
      }
      // New fields
      if (!autoMap.contact_email && (n.includes('foiaemail') || n.includes('contactvalue') || n.includes('contactemail') || n === 'email')) {
        autoMap.contact_email = col;
      }
      if (!autoMap.submission_method && (n.includes('submissionmethod') || n === 'method')) {
        autoMap.submission_method = col;
      }
      if (!autoMap.notes && n === 'notes') {
        autoMap.notes = col;
      }
      if (!autoMap.request_status && n === 'status') {
        autoMap.request_status = col;
      }
      if (!autoMap.request_date && (n.includes('daterequested') || n.includes('datesubmitted') || n === 'date')) {
        autoMap.request_date = col;
      }
    }
    return autoMap;
  }

  const onDrop = useCallback(async (acceptedFiles: File[], rejectedFiles: FileRejection[]) => {
    setImportError('');
    const file = acceptedFiles[0];
    if (!file) {
      const rejectionReason = rejectedFiles[0]?.errors?.[0]?.message;
      setImportError(rejectionReason || 'File was not accepted. Please upload .csv, .xlsx, or .xls');
      return;
    }

    setFileName(file.name);
    setDefaultType(detectTargetType(file.name));

    let rows: RawRow[] = [];
    try {
      rows = await parseUploadedFile(file);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Unable to read this file');
      return;
    }

    const cleanedRows = rows
      .map((row) =>
        Object.fromEntries(
          Object.entries(row).map(([key, value]) => [key.replace(/^\uFEFF/, '').trim(), String(value ?? '').trim()])
        ) as RawRow
      )
      .filter((row) => Object.values(row).some((value) => value !== ''));

    if (cleanedRows.length === 0) {
      setImportError('No rows were found. Make sure the first row contains column headers.');
      return;
    }

    setRawRows(cleanedRows);
    const cols = Object.keys(cleanedRows[0]);
    setColumns(cols);
    setMapping(autoDetectMapping(cols));
    setStep('map');
  }, [parseUploadedFile]);

  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop,
    useFsAccessApi: false,
    noClick: true,
    accept: {
      'text/csv': ['.csv'],
      'application/csv': ['.csv'],
      'text/plain': ['.csv'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/vnd.ms-excel': ['.xls', '.xlsx', '.csv'],
    },
    maxFiles: 1,
    multiple: false,
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

    const { data: existingHashes } = await db
      .from('targets')
      .select('url_hash')
      .not('url_hash', 'is', null);

    const dbHashes = new Set((existingHashes || []).map((r: any) => r.url_hash as string));
    const batchHashes = new Set<string>();

    const inserts: Record<string, unknown>[] = [];
    // Track rows that need foia_requests seeding (index in rawRows -> row data)
    const requestSeedRows: { rowIndex: number; status: string; date: string; insertIndex: number }[] = [];

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

      if (foiaUrl) {
        urlHash = hashUrl(foiaUrl);
        if (dbHashes.has(urlHash) || batchHashes.has(urlHash)) {
          duplicates.push(`${jurisdictionName}, ${state}`);
          skipped++;
          continue;
        }
        batchHashes.add(urlHash);
      }

      // Detect target type: use override column, or infer county from name
      let targetType: TargetType = defaultType;
      if (mapping.target_type) {
        const overrideType = String(row[mapping.target_type] || '').trim() as TargetType;
        if (overrideType) targetType = overrideType;
      }
      if (targetType === 'city_foia' && jurisdictionName.toLowerCase().includes('county')) {
        targetType = 'county_foia';
      }

      const contactEmail = mapping.contact_email ? String(row[mapping.contact_email] || '').trim() || null : null;
      const submissionMethod = mapping.submission_method ? String(row[mapping.submission_method] || '').trim() || null : null;
      const notes = mapping.notes ? String(row[mapping.notes] || '').trim() || null : null;

      const insertIdx = inserts.length;
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
        is_duplicate: false,
        contact_email: contactEmail,
        submission_method: submissionMethod,
        notes,
      });

      // Check if this row has request status/date for seeding
      const rawStatus = mapping.request_status ? String(row[mapping.request_status] || '').trim() : '';
      const rawDate = mapping.request_date ? String(row[mapping.request_date] || '').trim() : '';
      if (rawStatus) {
        requestSeedRows.push({ rowIndex: i, status: rawStatus, date: rawDate, insertIndex: insertIdx });
      }

      if (inserts.length >= BATCH_SIZE) {
        const batchToInsert = [...inserts];
        const { data: inserted, error } = await db.from('targets').insert(batchToInsert as any).select('id');
        if (error) {
          errors += batchToInsert.length;
        } else {
          imported += batchToInsert.length;
          // Seed foia_requests for this batch
          await seedRequestsForBatch(inserted || [], requestSeedRows, batchToInsert.length, inserts.length - batchToInsert.length);
        }
        inserts.length = 0;
        // Clear seed rows for flushed batch
        requestSeedRows.length = 0;
        setProgress(Math.round((i / rawRows.length) * 100));
      }
    }

    // Flush remaining
    if (inserts.length > 0) {
      const { data: inserted, error } = await db.from('targets').insert(inserts as any).select('id');
      if (error) {
        errors += inserts.length;
      } else {
        imported += inserts.length;
        await seedRequestsForBatch(inserted || [], requestSeedRows, inserts.length, 0);
      }
    }

    setProgress(100);
    const finalResult: ImportResult = { imported, skipped, errors, duplicates };
    setResult(finalResult);
    setStep('done');
    onComplete(finalResult);
  };

  /** Seed foia_requests for rows that had an existing status in the CSV */
  async function seedRequestsForBatch(
    insertedTargets: Array<{ id: string }>,
    seedRows: Array<{ rowIndex: number; status: string; date: string; insertIndex: number }>,
    batchSize: number,
    batchOffset: number
  ) {
    if (seedRows.length === 0 || insertedTargets.length === 0) return;

    // Get current user for requested_by
    const { data: { user } } = await db.auth.getUser();
    if (!user) return;

    const requestInserts: Record<string, unknown>[] = [];

    for (const seed of seedRows) {
      const targetIdx = seed.insertIndex - batchOffset;
      if (targetIdx < 0 || targetIdx >= insertedTargets.length) continue;

      const targetId = insertedTargets[targetIdx].id;
      const mappedStatus = mapCsvStatus(seed.status);

      // Parse date loosely
      let requestDate: string | null = null;
      if (seed.date) {
        const d = new Date(seed.date);
        if (!isNaN(d.getTime())) {
          requestDate = d.toISOString().split('T')[0];
        }
      }

      requestInserts.push({
        target_id: targetId,
        requested_by: user.id,
        va_id: user.id,
        status: mappedStatus,
        request_date: requestDate || new Date().toISOString().split('T')[0],
        sent_at: mappedStatus === 'sent' || mappedStatus === 'fulfilled' ? (requestDate ? new Date(requestDate).toISOString() : new Date().toISOString()) : null,
        notes: `Imported from ${fileName}`,
      });
    }

    if (requestInserts.length > 0) {
      await db.from('foia_requests').insert(requestInserts as any);
    }
  }

  return (
    <div className="space-y-6">
      {step === 'upload' && (
        <div className="space-y-3">
          <div
            {...getRootProps({ onClick: open })}
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
            <p className="text-slate-400 text-sm mt-1">or tap to choose a file</p>
            <p className="text-slate-400 text-xs mt-3">Supports .csv, .xlsx, .xls</p>
          </div>

          {importError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg px-4 py-2">
              <AlertCircle className="h-4 w-4" />
              {importError}
            </div>
          )}
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
              {MAPPING_FIELDS.map(({ key, label, required }) => (
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
              <p className="text-slate-400 text-xs mt-1">Auto-detected from filename · Used when type column is empty or not mapped</p>
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
                    {columns.slice(0, 10).map((col) => (
                      <th key={col} className="text-left px-3 py-2 text-slate-500 font-medium whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rawRows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {columns.slice(0, 10).map((col) => (
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
