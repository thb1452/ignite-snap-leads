import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";
import Papa from "papaparse";

interface PasteCsvUploadProps {
  onProcess: (csvData: string, fileName: string) => Promise<void>;
  disabled?: boolean;
}

export function PasteCsvUpload({ onProcess, disabled }: PasteCsvUploadProps) {
  const [pastedCsv, setPastedCsv] = useState("");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<Record<string, string>[]>([]);
  const [detectedDelimiter, setDetectedDelimiter] = useState<string>(",");
  const [isProcessing, setIsProcessing] = useState(false);

  const detectDelimiter = (text: string): string => {
    const firstLine = text.split('\n')[0];
    const commas = (firstLine.match(/,/g) || []).length;
    const tabs = (firstLine.match(/\t/g) || []).length;
    const pipes = (firstLine.match(/\|/g) || []).length;

    if (tabs > commas && tabs > pipes) return '\t';
    if (pipes > commas && pipes > tabs) return '|';
    return ',';
  };

  const handleCsvChange = (text: string) => {
    setPastedCsv(text);
    setValidationErrors([]);
    setPreviewData([]);

    if (!text.trim()) return;

    const errors: string[] = [];
    const lines = text.trim().split('\n');

    if (lines.length < 2) {
      errors.push('CSV must have at least 2 rows (header + data)');
      setValidationErrors(errors);
      return;
    }

    const delimiter = detectDelimiter(text);
    setDetectedDelimiter(delimiter);

    const result = Papa.parse<Record<string, string>>(text, {
      header: true,
      delimiter: delimiter,
      skipEmptyLines: true,
      transformHeader: (header) => header.trim().toLowerCase(),
    });

    if (result.errors.length > 0) {
      errors.push(`CSV parsing error: ${result.errors[0].message}`);
    }

    const headers = Object.keys(result.data[0] || {});
    if (!headers.includes('address')) {
      errors.push('Missing required column: "address"');
    }

    const quoteCount = (text.match(/"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      errors.push('Unmatched quotes detected - this may cause parsing errors');
    }

    if (result.data.length > 0 && errors.length === 0) {
      setPreviewData(result.data.slice(0, 5));
    }

    setValidationErrors(errors);
  };

  const handleProcess = async () => {
    if (validationErrors.length > 0) return;

    setIsProcessing(true);
    try {
      let processedCsv = pastedCsv;
      
      if (detectedDelimiter !== ',') {
        const result = Papa.parse<Record<string, string>>(pastedCsv, {
          header: true,
          delimiter: detectedDelimiter,
          skipEmptyLines: true,
        });
        
        const fields = result.meta.fields || [];
        processedCsv = [
          fields.join(','),
          ...result.data.map((row) => 
            fields.map(field => {
              const value = row[field] || '';
              if (value.includes(',') || value.includes('"') || value.includes('\n')) {
                return `"${value.replace(/"/g, '""')}"`;
              }
              return value;
            }).join(',')
          )
        ].join('\n');
      }

      await onProcess(processedCsv, `pasted_${Date.now()}.csv`);
      setPastedCsv('');
      setPreviewData([]);
      setValidationErrors([]);
    } catch (error) {
      console.error('Error processing pasted CSV:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const rowCount = pastedCsv.trim() ? pastedCsv.trim().split('\n').length - 1 : 0;
  const hasErrors = validationErrors.length > 0;
  const canProcess = pastedCsv.trim() && !hasErrors && !disabled;

  return (
    <div className="space-y-4">
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <p className="font-medium mb-1">Paste CSV data directly from ChatGPT/Claude:</p>
          <code className="text-xs bg-muted px-2 py-1 rounded block mt-2">
            address,city,state,zip,violation_type,status,opened_date,description,case_id
          </code>
        </AlertDescription>
      </Alert>

      <div className="space-y-2">
        <Textarea
          value={pastedCsv}
          onChange={(e) => handleCsvChange(e.target.value)}
          placeholder={`Paste CSV data here (Ctrl+V)...

Include the header row:
address,city,state,zip,violation_type,status,opened_date,description,case_id
123 Main St,Phoenix,AZ,85001,Exterior,Open,2024-01-15,Inspector notes...,CE-001`}
          className="min-h-[300px] font-mono text-sm"
          disabled={disabled}
        />

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            {rowCount > 0 && (
              <span className="text-muted-foreground">
                📊 {rowCount} data rows detected
              </span>
            )}
            {detectedDelimiter !== ',' && rowCount > 0 && (
              <span className="text-yellow-600 dark:text-yellow-400">
                ⚠️ Detected {detectedDelimiter === '\t' ? 'tab' : 'pipe'}-separated format (will convert)
              </span>
            )}
          </div>
          
          {!hasErrors && rowCount > 0 && (
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span>Valid CSV format</span>
            </div>
          )}
        </div>
      </div>

      {hasErrors && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <p className="font-medium mb-2">Validation Errors:</p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              {validationErrors.map((error, i) => (
                <li key={i}>{error}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {previewData.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Preview (first 5 rows):</h4>
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-auto max-h-[250px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Address</TableHead>
                    <TableHead className="text-xs">City</TableHead>
                    <TableHead className="text-xs">State</TableHead>
                    <TableHead className="text-xs">Violation Type</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="text-xs">{row.address || '-'}</TableCell>
                      <TableCell className="text-xs">{row.city || '-'}</TableCell>
                      <TableCell className="text-xs">{row.state || '-'}</TableCell>
                      <TableCell className="text-xs">{row.violation_type || '-'}</TableCell>
                      <TableCell className="text-xs">{row.status || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end">
        <Button 
          onClick={handleProcess}
          disabled={!canProcess || isProcessing}
          size="lg"
        >
          <Upload className="w-4 h-4 mr-2" />
          {isProcessing ? 'Processing...' : 'Process Pasted CSV'}
        </Button>
      </div>
    </div>
  );
}
