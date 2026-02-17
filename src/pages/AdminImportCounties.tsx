import { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft, Upload, FileText, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/externalClient';
import Papa from 'papaparse';

interface CsvRow {
  county_name: string;
  state: string;
  foia_portal_url?: string;
  foia_status?: string;
  portal_type?: string;
  notes?: string;
}

interface ValidationResult {
  row: CsvRow;
  rowNumber: number;
  errors: string[];
  isValid: boolean;
}

const VALID_STATUSES = ['not_contacted', 'pending', 'fulfilled', 'declined', 'invoice_required', 'invoice_paid', 'data_received'];
const VALID_PORTAL_TYPES = ['web_form', 'email', 'mail', 'phone'];

export default function AdminImportCounties() {
  const { toast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<ValidationResult[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'overwrite' | null>(null);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);
  
  const validCount = parsedData.filter(r => r.isValid).length;
  const errorCount = parsedData.filter(r => !r.isValid).length;
  
  const validateRow = (row: CsvRow, rowNumber: number): ValidationResult => {
    const errors: string[] = [];
    
    if (!row.county_name?.trim()) errors.push('county_name is required');
    if (!row.state?.trim()) errors.push('state is required');
    else if (row.state.length !== 2) errors.push('state must be 2-letter code');
    if (!row.foia_portal_url?.trim()) errors.push('foia_portal_url is required');
    if (row.foia_status && !VALID_STATUSES.includes(row.foia_status)) {
      errors.push(`Invalid status: ${row.foia_status}`);
    }
    if (row.portal_type && !VALID_PORTAL_TYPES.includes(row.portal_type)) {
      errors.push(`Invalid portal_type: ${row.portal_type}`);
    }
    
    return {
      row,
      rowNumber,
      errors,
      isValid: errors.length === 0,
    };
  };
  
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      setParsedData([]);
    }
  };
  
  const handlePreview = () => {
    if (!file) return;
    
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const validated = results.data.map((row: unknown, index: number) => 
          validateRow(row as CsvRow, index + 2)
        );
        setParsedData(validated);
      },
      error: (error) => {
        toast({ title: 'Parse Error', description: error.message, variant: 'destructive' });
      },
    });
  };
  
  const checkDuplicates = async () => {
    const validRows = parsedData.filter(r => r.isValid);
    const countyKeys = validRows.map(r => `${r.row.county_name}|${r.row.state}`);
    
    const { data: existing } = await supabase
      .from('counties')
      .select('county_name, state');
    
    const existingKeys = new Set(
      (existing || []).map(c => `${c.county_name}|${c.state}`)
    );
    
    const found = countyKeys.filter(k => existingKeys.has(k));
    return found;
  };
  
  const handleImport = async () => {
    const dupes = await checkDuplicates();
    
    if (dupes.length > 0 && !duplicateMode) {
      setDuplicates(dupes);
      setShowDuplicateModal(true);
      return;
    }
    
    setIsImporting(true);
    setImportProgress(0);
    
    const validRows = parsedData.filter(r => r.isValid);
    let imported = 0;
    let skipped = 0;
    
    for (const { row } of validRows) {
      const countyData = {
        county_name: row.county_name.trim(),
        state: row.state.toUpperCase().trim(),
        foia_portal_url: row.foia_portal_url?.trim() || null,
        foia_status: row.foia_status?.trim() || 'not_contacted',
        portal_type: row.portal_type?.trim() || 'web_form',
        notes: row.notes?.trim() || null,
      };
      
      if (duplicateMode === 'skip') {
        // Check if exists
        const { data: existing } = await supabase
          .from('counties')
          .select('id')
          .eq('county_name', countyData.county_name)
          .eq('state', countyData.state)
          .maybeSingle();
        
        if (existing) {
          skipped++;
          continue;
        }
      }
      
      if (duplicateMode === 'overwrite') {
        // Upsert
        const { error } = await supabase
          .from('counties')
          .upsert(countyData, { onConflict: 'county_name,state' });
        
        if (error) console.error('Upsert error:', error);
      } else {
        // Insert
        const { error } = await supabase
          .from('counties')
          .insert(countyData);
        
        if (error) console.error('Insert error:', error);
      }
      
      imported++;
      setImportProgress(Math.round(((imported + skipped) / validRows.length) * 100));
    }
    
    setIsImporting(false);
    toast({ 
      title: '✅ Import Complete', 
      description: `Imported ${imported} counties, Skipped ${skipped} duplicates` 
    });
  };
  
  const proceedWithDuplicateMode = (mode: 'skip' | 'overwrite') => {
    setDuplicateMode(mode);
    setShowDuplicateModal(false);
    handleImport();
  };
  
  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
        <Button variant="ghost" asChild>
          <Link to="/admin-console">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin Console
          </Link>
        </Button>
        
        <PageHeader 
          title="Import Counties from CSV" 
          description="Upload a CSV file with columns: county_name, state, foia_portal_url, foia_status, portal_type, notes"
        />
        
        {/* Upload Form */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload CSV
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Input 
                type="file" 
                accept=".csv"
                onChange={handleFileChange}
                className="flex-1"
              />
              <Button onClick={handlePreview} disabled={!file}>
                <FileText className="h-4 w-4 mr-2" />
                Preview CSV
              </Button>
            </div>
            
            {parsedData.length > 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {validCount} valid rows, {errorCount} errors
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
        
        {/* Preview Table */}
        {parsedData.length > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Preview (First 20 Rows)</CardTitle>
              <Button 
                onClick={handleImport} 
                disabled={validCount === 0 || isImporting}
              >
                {isImporting ? 'Importing...' : `Import ${validCount} Counties`}
              </Button>
            </CardHeader>
            <CardContent>
              {isImporting && (
                <div className="mb-4">
                  <Progress value={importProgress} className="mb-2" />
                  <p className="text-sm text-muted-foreground">{importProgress}% complete</p>
                </div>
              )}
              
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>County Name</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead>Portal URL</TableHead>
                      <TableHead>Errors</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.slice(0, 20).map((result, i) => (
                      <TableRow 
                        key={i} 
                        className={result.isValid ? '' : 'bg-red-500/10'}
                      >
                        <TableCell>{result.rowNumber}</TableCell>
                        <TableCell>
                          {result.isValid ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-500" />
                          )}
                        </TableCell>
                        <TableCell>{result.row.county_name}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{result.row.state}</Badge>
                        </TableCell>
                        <TableCell className="max-w-48 truncate">
                          {result.row.foia_portal_url}
                        </TableCell>
                        <TableCell>
                          {result.errors.length > 0 && (
                            <span className="text-red-500 text-sm">
                              {result.errors.join(', ')}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
        
        {/* Duplicate Modal */}
        <Dialog open={showDuplicateModal} onOpenChange={setShowDuplicateModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Duplicate Counties Found</DialogTitle>
            </DialogHeader>
            <p className="text-muted-foreground">
              Found {duplicates.length} duplicate counties. What would you like to do?
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => proceedWithDuplicateMode('skip')}>
                Skip Duplicates
              </Button>
              <Button onClick={() => proceedWithDuplicateMode('overwrite')}>
                Overwrite Existing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
