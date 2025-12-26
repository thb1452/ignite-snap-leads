import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Clock, MapPin, FileSpreadsheet, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface RecentUpload {
  id: string;
  filename: string;
  city: string | null;
  state: string | null;
  status: string;
  total_rows: number | null;
  properties_created: number | null;
  violations_created: number | null;
  created_at: string;
  finished_at: string | null;
}

export function RecentUploads() {
  const { user } = useAuth();
  const [uploads, setUploads] = useState<RecentUpload[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchUploads = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('upload_jobs')
      .select('id, filename, city, state, status, total_rows, properties_created, violations_created, created_at, finished_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (!error && data) {
      setUploads(data);
    }
    setLoading(false);
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
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                  <span>{formatDistanceToNow(new Date(upload.created_at), { addSuffix: true })}</span>
                  {upload.status === 'COMPLETE' && (
                    <>
                      <span>•</span>
                      <span>{upload.properties_created ?? 0} props</span>
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
            <div className="flex-shrink-0 ml-2">
              {getStatusBadge(upload.status)}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
