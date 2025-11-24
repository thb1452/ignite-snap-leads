import { useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload as UploadIcon, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';
import { createUploadJob } from '@/services/uploadJobs';
import { useUploadJob } from '@/hooks/useUploadJob';
import { UploadProgress } from '@/components/upload/UploadProgress';
import { useToast } from '@/hooks/use-toast';
import { AppLayout } from '@/components/layout/AppLayout';

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

    if (!city || !state) {
      toast({
        title: 'Location Required',
        description: 'Please fill in city and state before uploading',
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
      const id = await createUploadJob({ file, userId: user.id, city, county: county || null, state });
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
    disabled: uploading || !city || !state || (job?.status !== 'COMPLETE' && job?.status !== 'FAILED' && job !== null),
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
        {/* Location Information */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label className="text-base font-semibold">
                  Step 1: Enter Location Information <span className="text-destructive">*</span>
                </Label>
                <p className="text-sm text-muted-foreground mt-1">
                  Enter the city and state for this upload. County is optional and will be determined during geocoding if not provided.
                </p>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    placeholder="e.g., Sierra Vista"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    required
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
                  <Label htmlFor="state">State</Label>
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

        {/* CSV Upload */}
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2 mb-4">
              <Label className="text-base font-semibold">
                Step 2: Upload CSV File <span className="text-destructive">*</span>
              </Label>
              <p className="text-sm text-muted-foreground">
                {!city || !state
                  ? "Enter city and state first to enable file upload"
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
              <Button variant="outline" disabled={!city || !state || uploading || (job && job.status !== 'COMPLETE' && job.status !== 'FAILED')}>
                <FileSpreadsheet className="mr-2 h-4 w-4" />
                {!city || !state ? 'Enter City & State First' : 'Select CSV File'}
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
