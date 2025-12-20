import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload as UploadIcon, FileSpreadsheet, AlertCircle, ClipboardPaste } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { createUploadJob } from '@/services/uploadJobs';
import { useUploadJob } from '@/hooks/useUploadJob';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { PasteCsvUpload } from '@/components/upload/PasteCsvUpload';
import { GeocodingProgress } from '@/components/geocoding/GeocodingProgress';
import { CsvLocationDetector, type CsvDetectionResult } from '@/components/upload/CsvLocationDetector';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { startGeocodingJob } from '@/services/geocoding';
import { supabase } from '@/integrations/supabase/client';
import { detectCsvLocations, splitCsvByCity } from '@/utils/csvLocationDetector';

const UPLOAD_LIMITS = {
  MAX_FILE_SIZE_MB: 50,
  MAX_ROWS: 50000,
};

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

export default function Upload() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [city, setCity] = useState<string>("");
  const [county, setCounty] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [uploadMethod, setUploadMethod] = useState<"file" | "paste">("file");
  const { job, loading: jobLoading } = useUploadJob(jobId);
  
  // CSV detection state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingCsvData, setPendingCsvData] = useState<string | null>(null);
  const [detection, setDetection] = useState<CsvDetectionResult | null>(null);

  const resetDetection = () => {
    setPendingFile(null);
    setPendingCsvData(null);
    setDetection(null);
  };

  const processFileForDetection = useCallback(async (file: File) => {
    const text = await file.text();
    const detected = detectCsvLocations(text);
    setDetection(detected);
    setPendingFile(file);
    setPendingCsvData(text);
  }, []);

  const onDrop = async (acceptedFiles: File[]) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to upload files',
        variant: 'destructive',
      });
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > UPLOAD_LIMITS.MAX_FILE_SIZE_MB * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: `File must be less than ${UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB`,
        variant: 'destructive',
      });
      return;
    }

    // Detect locations first
    await processFileForDetection(file);
  };

  const handleConfirmUpload = async () => {
    if (!user || !pendingCsvData) return;

    setUploading(true);

    try {
      // Check if we should split by city
      const shouldSplit = detection && detection.locations.length > 1;
      
      if (shouldSplit) {
        // Multi-city upload - split and create multiple jobs
        const cityGroups = splitCsvByCity(pendingCsvData, city || undefined, state || undefined);
        let jobsCreated = 0;
        let lastJobId: string | null = null;

        for (const [key, csvContent] of cityGroups) {
          const [groupCity, groupState] = key.split('|');
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const fileName = `${groupCity.replace(/\s+/g, '_')}_${groupState}_${Date.now()}.csv`;
          const file = new File([blob], fileName, { type: 'text/csv' });

          const id = await createUploadJob({ 
            file, 
            userId: user.id, 
            city: groupCity, 
            county: county || null, 
            state: groupState 
          });
          lastJobId = id;
          jobsCreated++;
        }

        if (lastJobId) setJobId(lastJobId);
        toast({
          title: 'Upload Started',
          description: `Created ${jobsCreated} ingest jobs for ${cityGroups.size} locations`,
        });
      } else {
        // Single location upload
        const file = pendingFile!;
        const jobCity = detection?.locations[0]?.city || city || "";
        const jobState = detection?.locations[0]?.state || state || "";

        if (!jobCity || !jobState) {
          toast({
            title: 'Location Required',
            description: 'No location detected in CSV. Please provide fallback city and state.',
            variant: 'destructive',
          });
          setUploading(false);
          return;
        }

        const id = await createUploadJob({ 
          file, 
          userId: user.id, 
          city: jobCity, 
          county: county || null, 
          state: jobState 
        });
        setJobId(id);
        toast({
          title: 'Upload Started',
          description: 'Your file is being processed',
        });
      }

      resetDetection();
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: 'Upload Failed',
        description: error instanceof Error ? error.message : 'Failed to upload file',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handlePastedCsvProcess = async (csvData: string, fileName: string) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to upload',
        variant: 'destructive',
      });
      return;
    }

    // Detect locations and show preview
    const detected = detectCsvLocations(csvData);
    setDetection(detected);
    setPendingCsvData(csvData);
    setPendingFile(null);
  };

  const handleConfirmPasteUpload = async () => {
    if (!user || !pendingCsvData) return;

    setUploading(true);

    try {
      const shouldSplit = detection && detection.locations.length > 1;

      if (shouldSplit) {
        const cityGroups = splitCsvByCity(pendingCsvData, city || undefined, state || undefined);
        let jobsCreated = 0;
        let lastJobId: string | null = null;

        for (const [key, csvContent] of cityGroups) {
          const [groupCity, groupState] = key.split('|');
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const fileName = `pasted_${groupCity.replace(/\s+/g, '_')}_${groupState}_${Date.now()}.csv`;
          const file = new File([blob], fileName, { type: 'text/csv' });

          const filePath = `${user.id}/${Date.now()}_${fileName}`;
          const { error: uploadError } = await supabase.storage
            .from('csv-uploads')
            .upload(filePath, file);

          if (uploadError) throw uploadError;

          const { data: jobData, error: jobError } = await supabase
            .from('upload_jobs')
            .insert({
              user_id: user.id,
              filename: fileName,
              storage_path: filePath,
              file_size: file.size,
              city: groupCity.trim(),
              state: groupState,
              county: county?.trim() || null,
              status: 'QUEUED',
            })
            .select()
            .single();

          if (jobError) throw jobError;

          await supabase.functions.invoke('process-upload', {
            body: { jobId: jobData.id }
          });

          lastJobId = jobData.id;
          jobsCreated++;
        }

        if (lastJobId) setJobId(lastJobId);
        toast({
          title: 'CSV Processed',
          description: `Created ${jobsCreated} ingest jobs`,
        });
      } else {
        // Single location
        const jobCity = detection?.locations[0]?.city || city || "";
        const jobState = detection?.locations[0]?.state || state || "";

        if (!jobCity || !jobState) {
          toast({
            title: 'Location Required',
            description: 'No location detected. Please provide fallback city and state.',
            variant: 'destructive',
          });
          setUploading(false);
          return;
        }

        const fileName = `pasted_${Date.now()}.csv`;
        const blob = new Blob([pendingCsvData], { type: 'text/csv' });
        const file = new File([blob], fileName, { type: 'text/csv' });

        const filePath = `${user.id}/${Date.now()}_${fileName}`;
        const { error: uploadError } = await supabase.storage
          .from('csv-uploads')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: jobData, error: jobError } = await supabase
          .from('upload_jobs')
          .insert({
            user_id: user.id,
            filename: fileName,
            storage_path: filePath,
            file_size: file.size,
            city: jobCity.trim(),
            state: jobState,
            county: county?.trim() || null,
            status: 'QUEUED',
          })
          .select()
          .single();

        if (jobError) throw jobError;

        await supabase.functions.invoke('process-upload', {
          body: { jobId: jobData.id }
        });

        setJobId(jobData.id);
        toast({
          title: 'CSV Processed',
          description: 'Your pasted data is being processed',
        });
      }

      resetDetection();
    } catch (error) {
      console.error('Error processing pasted CSV:', error);
      toast({
        title: 'Processing Failed',
        description: error instanceof Error ? error.message : 'Failed to process CSV',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleStartGeocoding = async () => {
    try {
      await startGeocodingJob();
      toast({
        title: 'Geocoding Started',
        description: 'Processing properties in background',
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to start geocoding',
        variant: 'destructive',
      });
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    disabled: uploading || (job?.status !== 'COMPLETE' && job?.status !== 'FAILED' && job !== null),
  });

  const isJobActive = job && job.status !== 'COMPLETE' && job.status !== 'FAILED';
  const hasDetection = detection !== null;

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Upload Properties</h1>
          <p className="text-muted-foreground">
            Upload CSV files or paste data directly from ChatGPT/Claude
          </p>
        </div>

        <div className="space-y-6">
          {/* Location Context - Now Optional */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">
                    Location Context (Optional)
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Snap automatically detects location from your data. Use these fields only if your file is missing location info.
                  </p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="city">City <span className="text-xs text-muted-foreground">(Fallback)</span></Label>
                    <Input
                      id="city"
                      placeholder="e.g., Sierra Vista"
                      value={city}
                      onChange={(e) => setCity(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="county">County <span className="text-xs text-muted-foreground">(Optional)</span></Label>
                    <Input
                      id="county"
                      placeholder="e.g., Cochise"
                      value={county}
                      onChange={(e) => setCounty(e.target.value)}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="state">State <span className="text-xs text-muted-foreground">(Fallback)</span></Label>
                    <Select value={state} onValueChange={setState}>
                      <SelectTrigger id="state">
                        <SelectValue placeholder="Select state" />
                      </SelectTrigger>
                      <SelectContent>
                        {US_STATES.map((st) => (
                          <SelectItem key={st} value={st}>
                            {st}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detection Results */}
          {hasDetection && (
            <CsvLocationDetector 
              detection={detection} 
              fallbackCity={city}
              fallbackState={state}
            />
          )}

          {/* Confirm Upload Button */}
          {hasDetection && (
            <div className="flex gap-3">
              <Button 
                onClick={pendingFile ? handleConfirmUpload : handleConfirmPasteUpload}
                disabled={uploading}
                className="flex-1"
                size="lg"
              >
                {uploading ? 'Processing...' : `Start Ingest${detection.locations.length > 1 ? ` (${detection.locations.length} Jobs)` : ''}`}
              </Button>
              <Button 
                onClick={resetDetection}
                variant="outline"
                disabled={uploading}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* CSV Upload - Now with Tabs */}
          {!hasDetection && (
            <Card>
              <CardContent className="pt-6">
                <div className="space-y-2 mb-4">
                  <Label className="text-base font-semibold">
                    Upload CSV Data
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Upload a file or paste CSV data directly. Location will be auto-detected.
                  </p>
                </div>

                <Tabs value={uploadMethod} onValueChange={(v) => setUploadMethod(v as "file" | "paste")}>
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="file" className="flex items-center gap-2">
                      <UploadIcon className="w-4 h-4" />
                      File Upload
                    </TabsTrigger>
                    <TabsTrigger value="paste" className="flex items-center gap-2">
                      <ClipboardPaste className="w-4 h-4" />
                      Paste CSV
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="file">
                    <div
                      {...getRootProps()}
                      className={`
                        border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                        transition-colors
                        ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                        ${uploading || isJobActive ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <input {...getInputProps()} />
                      <UploadIcon className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium mb-2">
                        {isDragActive ? 'Drop the file here' : 'Drag & drop a CSV file'}
                      </p>
                      <p className="text-sm text-muted-foreground mb-4">
                        {isDragActive ? '' : 'or click to browse'}
                      </p>
                      <Button variant="outline" disabled={uploading || isJobActive}>
                        <FileSpreadsheet className="mr-2 h-4 w-4" />
                        Select CSV File
                      </Button>
                    </div>
                  </TabsContent>

                  <TabsContent value="paste">
                    <PasteCsvUpload
                      onProcess={handlePastedCsvProcess}
                      disabled={uploading || !!isJobActive}
                    />
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          )}

          {job && <UploadProgress job={job} />}
          <GeocodingProgress />

          {/* Geocoding Control */}
          <Card>
            <CardContent className="pt-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-semibold">Geocoding</Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    Add coordinates to properties that don't have them yet.
                  </p>
                </div>
                <Button onClick={handleStartGeocoding} variant="secondary" className="w-full">
                  Start Geocoding Job
                </Button>
              </div>
            </CardContent>
          </Card>

          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              <div className="space-y-2">
                <p>
                  <strong>CSV Format:</strong> Your file should include columns for address (required). 
                  Location columns (city, state) enable auto-detection. Other optional: zip, violation type, description, opened date, status, case/file ID.
                </p>
                <p className="text-xs text-muted-foreground">
                  <strong>Limits:</strong> Max {UPLOAD_LIMITS.MAX_FILE_SIZE_MB}MB file size, {UPLOAD_LIMITS.MAX_ROWS.toLocaleString()} rows per file.
                </p>
              </div>
            </AlertDescription>
          </Alert>
        </div>
      </div>
    </AppLayout>
  );
}
