import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Clock, MapPin, FileSpreadsheet, CheckCircle2, XCircle, Loader2, Droplets, Trash2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useToast } from '@/hooks/use-toast';

interface RecentUpload {
  id: string;
  filename: string;
  city: string | null;
  state: string | null;
  status: string;
  total_rows: number | null;
  properties_created: number | null;
  properties_matched: number | null;
  violations_created: number | null;
  created_at: string;
  finished_at: string | null;
  source_type: string | null;
}

export function RecentUploads() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [uploads, setUploads] = useState<RecentUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchUploads = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('upload_jobs')
      .select('id, filename, city, state, status, total_rows, properties_created, properties_matched, violations_created, created_at, finished_at, source_type')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setUploads(data);
    }
    setLoading(false);
  };

  const handleDeleteUpload = async (upload: RecentUpload) => {
    setDeletingId(upload.id);
    
    try {
      // Delete violations for properties from this upload's city/state
      if (upload.city && upload.state) {
        const { data: properties } = await supabase
          .from('properties')
          .select('id')
          .ilike('city', upload.city.trim())
          .ilike('state', upload.state.trim());
        
        if (properties && properties.length > 0) {
          const propertyIds = properties.map(p => p.id);
          
          // Delete violations in batches
          for (let i = 0; i < propertyIds.length; i += 100) {
            const batch = propertyIds.slice(i, i + 100);
            await supabase
              .from('violations')
              .delete()
              .in('property_id', batch);
          }
          
          // Delete properties in batches
          for (let i = 0; i < propertyIds.length; i += 100) {
            const batch = propertyIds.slice(i, i + 100);
            await supabase
              .from('properties')
              .delete()
              .in('id', batch);
          }
        }
      }
      
      // Delete staging data
      await supabase
        .from('upload_staging')
        .delete()
        .eq('job_id', upload.id);
      
      // Delete the upload job record
      const { error } = await supabase
        .from('upload_jobs')
        .delete()
        .eq('id', upload.id);
      
      if (error) throw error;
      
      toast({
        title: "Upload Deleted",
        description: `Successfully deleted ${upload.city || upload.filename} and all associated data.`,
      });
      
      fetchUploads();
    } catch (error: any) {
      console.error('Error deleting upload:', error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete upload. Please try again.",
        variant: "destructive",
      });
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => {
    fetchUploads();

    // Poll every 5 seconds for fresh data
    const interval = setInterval(fetchUploads, 5000);

    // Also subscribe to realtime updates
    const channel = supabase
      .channel('recent-uploads')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'upload_jobs',
        },
        () => {
          fetchUploads();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [user]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETE':
        return <Badge variant="default" className="bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" />Complete</Badge>;
      case 'FAILED':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Failed</Badge>;
      case 'QUEUED':
        return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Queued</Badge>;
      default:
        return <Badge variant="outline" className="text-blue-600 border-blue-600"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Processing</Badge>;
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Uploads
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (uploads.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Uploads
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm text-center py-4">
            No uploads yet. Upload a CSV to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Recent Uploads
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {uploads.map((upload) => (
          <div
            key={upload.id}
            className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <FileSpreadsheet className="w-5 h-5 text-muted-foreground flex-shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {upload.city && upload.state ? (
                    <span className="font-medium flex items-center gap-1">
                      <MapPin className="w-3 h-3" />
                      {upload.city}, {upload.state}
                    </span>
                  ) : (
                    <span className="font-medium truncate">{upload.filename}</span>
                  )}
                  {upload.source_type === 'water_disconnection' && (
                    <Badge variant="outline" className="text-cyan-600 border-cyan-300 dark:border-cyan-700 bg-cyan-50 dark:bg-cyan-950/30 text-xs">
                      <Droplets className="w-3 h-3 mr-1" />
                      Water
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}</span>
                  {upload.status === 'COMPLETE' && (
                    <>
                      <span>•</span>
                      <span>{upload.properties_created ?? 0} new props</span>
                      {(upload.properties_matched ?? 0) > 0 && (
                        <>
                          <span>•</span>
                          <span>{upload.properties_matched} matched</span>
                        </>
                      )}
                      <span>•</span>
                      <span>{upload.violations_created ?? 0} violations</span>
                    </>
                  )}
                  {upload.total_rows && upload.status !== 'COMPLETE' && (
                    <>
                      <span>•</span>
                      <span>{upload.total_rows} rows</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 ml-2">
              {getStatusBadge(upload.status)}
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    disabled={deletingId === upload.id}
                  >
                    {deletingId === upload.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Upload?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete <strong>{upload.city || upload.filename}</strong> and all associated properties and violations.
                      <br /><br />
                      <span className="text-destructive font-medium">This action cannot be undone.</span>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => handleDeleteUpload(upload)}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Delete Upload
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
