import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload as UploadIcon, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';
import { createUploadJob } from '@/services/uploadJobs';
import { useUploadJob } from '@/hooks/useUploadJob';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';

export default function Upload() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [jobId, setJobId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const { job, loading: jobLoading } = useUploadJob(jobId);

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
      const id = await createUploadJob({ file, userId: user.id });
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
    disabled: uploading || (job?.status !== 'COMPLETE' && job?.status !== 'FAILED' && job !== null),
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
        <Card>
          <CardContent className="pt-6">
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
                or click to browse
              </p>
              <Button variant="outline" disabled={uploading || (job && job.status !== 'COMPLETE' && job.status !== 'FAILED')}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                Select CSV File
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
