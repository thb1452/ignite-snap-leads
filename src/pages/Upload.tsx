import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload as UploadIcon, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { createUploadJob } from '@/services/uploadJobs';
import { useUploadJob } from '@/hooks/useUploadJob';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';
import { useJurisdictions } from '@/hooks/useJurisdictions';

export default function Upload() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [jurisdictionId, setJurisdictionId] = useState<string>("");
  const { job, loading: jobLoading } = useUploadJob(jobId);
  const { data: jurisdictions, isLoading: jurisdictionsLoading } = useJurisdictions();

  const onDrop = async (acceptedFiles: File[]) => {
    if (!user) {
      toast({
        title: 'Error',
        description: 'You must be logged in to upload files',
        variant: 'destructive',
      });
      return;
    }

    if (!jurisdictionId) {
      toast({
        title: 'Jurisdiction Required',
        description: 'Please select a jurisdiction before uploading',
        variant: 'destructive',
      });
      return;
    }

    const file = acceptedFiles[0];
    if (!file) return;

    // Validate file
    if (!file.name.endsWith('.csv')) {
      toast({
        title: 'Invalid File',
        description: 'Please upload a CSV file',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: 'File Too Large',
        description: 'File must be less than 50MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);

    try {
      const id = await createUploadJob({ file, userId: user.id, jurisdictionId });
      setJobId(id);
      toast({
        title: 'Upload Started',
        description: 'Your file is being processed',
      });
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

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'text/csv': ['.csv'] },
    maxFiles: 1,
    disabled: uploading || !jurisdictionId || (job?.status !== 'COMPLETE' && job?.status !== 'FAILED' && job !== null),
  });

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Upload Properties</h1>
        <p className="text-muted-foreground">
          <strong>Internal Upload Tool</strong> — For Snap team and operators only. Upload CSV files with property violation data.
        </p>
      </div>

      <div className="space-y-6">
        {/* Jurisdiction Selection */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <Label htmlFor="jurisdiction" className="text-base font-semibold">
                Step 1: Select Jurisdiction <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground mb-4">
                Choose the city/county this CSV file belongs to. This will be used to geocode addresses that only contain street names.
              </p>
              <Select value={jurisdictionId} onValueChange={setJurisdictionId}>
                <SelectTrigger id="jurisdiction" className="w-full">
                  <SelectValue placeholder={jurisdictionsLoading ? "Loading jurisdictions..." : "Select a jurisdiction"} />
                </SelectTrigger>
                <SelectContent>
                  {jurisdictions?.map((jurisdiction) => (
                    <SelectItem key={jurisdiction.id} value={jurisdiction.id}>
                      {jurisdiction.name} ({jurisdiction.city}, {jurisdiction.state})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* CSV Upload */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2 mb-4">
              <Label className="text-base font-semibold">
                Step 2: Upload CSV File <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                {!jurisdictionId 
                  ? "Select a jurisdiction first to enable file upload"
                  : "Drag & drop your CSV file or click to browse"
                }
              </p>
            </div>
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
                transition-colors
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50'}
                ${uploading || (job && job.status !== 'COMPLETE' && job.status !== 'FAILED') ? 'opacity-50 cursor-not-allowed' : ''}
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
              <Button variant="outline" disabled={!jurisdictionId || uploading || (job && job.status !== 'COMPLETE' && job.status !== 'FAILED')}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {!jurisdictionId ? 'Select Jurisdiction First' : 'Select CSV File'}
              </Button>
            </div>
          </CardContent>
        </Card>

        {job && <UploadProgress job={job} />}

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>CSV Format:</strong> Your file should include columns for address (required). 
            Optional: city, state, zip, violation type, description, opened date, status, case/file ID.
            The system supports multiple column naming formats (e.g., "File #", "Open Date", etc.).
          </AlertDescription>
        </Alert>
      </div>
      </div>
    </AppLayout>
  );
}
