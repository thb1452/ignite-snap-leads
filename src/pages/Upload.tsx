import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload as UploadIcon, FileSpreadsheet, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Papa from 'papaparse';
import { uploadViolationCSV } from '@/services/upload';
import { AppLayout } from '@/components/layout/AppLayout';

interface CSVRow {
  case_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  violation?: string;
  status?: string;
  opened_date?: string;
  last_updated?: string;
}

interface ValidationResult {
  isValid: boolean;
  warnings: string[];
  data: CSVRow[];
}

export function Upload() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [allData, setAllData] = useState<CSVRow[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFile = acceptedFiles[0];
    if (csvFile && csvFile.type === 'text/csv') {
      if (csvFile.size > 5 * 1024 * 1024) { // 5MB limit
        toast({
          title: "File too large",
          description: "Please upload a CSV file smaller than 5MB",
          variant: "destructive",
        });
        return;
      }
      
      setFile(csvFile);
      parseCSV(csvFile);
    } else {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV file",
        variant: "destructive",
      });
    }
  }, [toast]);

  const parseCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as CSVRow[];
        const preview = data.slice(0, 20);
        
        // Store all data for upload
        setAllData(data);
        
        // Validate required columns
        const warnings: string[] = [];
        const requiredFields = ['case_id', 'address', 'violation'];
        const optionalFields = ['city', 'state', 'zip', 'status', 'opened_date', 'last_updated'];
        
        if (data.length === 0) {
          warnings.push('No data found in CSV file');
        }
        
        // Check for missing required fields
        requiredFields.forEach(field => {
          if (!preview.some(row => row[field as keyof CSVRow])) {
            warnings.push(`Missing required field: ${field}`);
          }
        });
        
        // Check for missing optional but important fields
        optionalFields.forEach(field => {
          if (!preview.some(row => row[field as keyof CSVRow])) {
            warnings.push(`Missing optional field: ${field} (may affect SnapScore calculation)`);
          }
        });

        // Check for duplicate case IDs
        const caseIds = data.filter(row => row.case_id).map(row => row.case_id!);
        const duplicates = caseIds.filter((id, index) => caseIds.indexOf(id) !== index);
        if (duplicates.length > 0) {
          warnings.push(`Found ${new Set(duplicates).size} duplicate case IDs in the CSV`);
        }
        
        setValidation({
          isValid: warnings.filter(w => w.includes('required')).length === 0,
          warnings,
          data: preview,
        });
      },
      error: (error) => {
        toast({
          title: "CSV parsing error",
          description: error.message,
          variant: "destructive",
        });
      }
    });
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
    },
    maxFiles: 1,
  });

  const handleConfirmUpload = async () => {
    if (!file || !validation?.isValid || allData.length === 0) return;
    
    setUploading(true);
    setProgress(0);
    setProgressMessage('Starting upload...');
    
    try {
      const result = await uploadViolationCSV(allData, (progressUpdate) => {
        const { stage, current, total, message } = progressUpdate;
        
        // Calculate progress percentage based on stage
        let stageProgress = 0;
        if (stage === 'validating') stageProgress = 10;
        else if (stage === 'checking') stageProgress = 20;
        else if (stage === 'creating-properties') stageProgress = 40;
        else if (stage === 'creating-violations') {
          const violationProgress = (current / total) * 50;
          stageProgress = 40 + violationProgress;
        } else if (stage === 'complete') stageProgress = 100;
        
        setProgress(stageProgress);
        setProgressMessage(message);
      });
      
      if (result.errors.length > 0) {
        toast({
          title: "Upload completed with warnings",
          description: `Created ${result.violationsCreated} violations and ${result.propertiesCreated} properties. ${result.errors.length} errors occurred.${result.duplicates.length > 0 ? ` Found ${result.duplicates.length} duplicate case IDs.` : ''}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Upload successful!",
          description: `Successfully uploaded ${result.violationsCreated} violations across ${result.propertiesCreated} properties`,
        });
      }
      
      setProgress(100);
      setProgressMessage('Complete!');
      
      // Reset form and redirect to Leads page
      setTimeout(() => {
        setFile(null);
        setValidation(null);
        setAllData([]);
        setUploading(false);
        setProgress(0);
        setProgressMessage('');
        navigate('/leads');
      }, 1500);
      
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload failed",
        description: error.message || "Failed to upload violations",
        variant: "destructive",
      });
      setUploading(false);
      setProgress(0);
      setProgressMessage('');
    }
  };

  const generateSampleData = () => {
    // Remove this button - users should upload real data
    toast({
      title: "Please upload a CSV file",
      description: "Use the upload area above to import your violation data",
    });
  };

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Upload Violations Data</h1>
          <p className="text-muted-foreground mt-2">
            Upload a CSV file with violation data to start generating leads
          </p>
        </div>

      {!file && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <UploadIcon className="h-5 w-5" />
              <span>CSV Upload</span>
            </CardTitle>
            <CardDescription>
              Upload a CSV file containing violation data (max 5MB)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <FileSpreadsheet className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              {isDragActive ? (
                <p className="text-lg">Drop the CSV file here...</p>
              ) : (
                <div>
                  <p className="text-lg mb-2">Drag & drop a CSV file here, or click to select</p>
                  <p className="text-sm text-muted-foreground">
                    Expected columns: case_id, address, city, state, zip, violation, status, opened_date, last_updated
                  </p>
                </div>
              )}
            </div>
            
            <div className="mt-6 pt-6 border-t">
              <Button onClick={generateSampleData} variant="outline" className="w-full">
                Try Sample Data (50 demo records)
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {file && validation && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <FileSpreadsheet className="h-5 w-5" />
              <span>File Preview: {file.name}</span>
            </CardTitle>
            <CardDescription>
              Showing first 20 rows • Total: {allData.length} rows • {file.size} bytes
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validation.warnings.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    {validation.warnings.map((warning, index) => (
                      <div key={index} className="text-sm">• {warning}</div>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}
            
            {validation.isValid && (
              <Alert className="border-green-200 bg-green-50">
                <CheckCircle2 className="h-4 w-4 text-green-600" />
                <AlertDescription className="text-green-800">
                  File validation passed. Ready for upload.
                </AlertDescription>
              </Alert>
            )}

            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Case ID</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>City</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Violation</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {validation.data.map((row, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-sm">{row.case_id || '—'}</TableCell>
                      <TableCell>{row.address || '—'}</TableCell>
                      <TableCell>{row.city || '—'}</TableCell>
                      <TableCell>{row.state || '—'}</TableCell>
                      <TableCell className="max-w-xs truncate">{row.violation || '—'}</TableCell>
                      <TableCell>{row.status || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {uploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{progressMessage}</span>
                  <span className="font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            )}

            <div className="flex space-x-3">
              <Button 
                onClick={handleConfirmUpload} 
                disabled={!validation.isValid || uploading}
                className="flex-1"
              >
                {uploading ? 'Processing...' : 'Confirm Upload'}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => {
                  setFile(null);
                  setValidation(null);
                }}
                disabled={uploading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
    </AppLayout>
  );
}