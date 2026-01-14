import { useState, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  ArrowLeft, 
  ExternalLink, 
  Plus, 
  Calendar, 
  Send, 
  CheckCircle, 
  XCircle,
  Clock,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';
import { useCounty, useUpdateCounty } from '@/hooks/useFoiaCounties';
import { useFoiaRequests, useCreateFoiaRequest } from '@/hooks/useFoiaRequests';
import { debounce } from '@/lib/utils';

const statusOptions = [
  { value: 'not_contacted', label: 'Not Contacted' },
  { value: 'pending', label: 'Pending' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'declined', label: 'Declined' },
  { value: 'invoice_required', label: 'Invoice Required' },
  { value: 'invoice_paid', label: 'Invoice Paid' },
  { value: 'data_received', label: 'Data Received' },
];

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  fulfilled: 'bg-green-500/20 text-green-400 border-green-500/30',
  declined: 'bg-red-500/20 text-red-400 border-red-500/30',
  invoice_required: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

export default function VACountyDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: county, isLoading: countyLoading } = useCounty(id || '');
  const { data: requests, isLoading: requestsLoading } = useFoiaRequests(id);
  const updateCounty = useUpdateCounty();
  const createRequest = useCreateFoiaRequest();
  
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [notesSaved, setNotesSaved] = useState(false);
  const [requestForm, setRequestForm] = useState({
    request_date: format(new Date(), 'yyyy-MM-dd'),
    request_method: 'email',
    data_years_requested: '2020-2024',
    notes: '',
  });
  
  // Debounced notes save
  const saveNotes = useCallback(
    debounce((notes: string) => {
      if (id) {
        updateCounty.mutate({ id, updates: { notes } }, {
          onSuccess: () => {
            setNotesSaved(true);
            setTimeout(() => setNotesSaved(false), 2000);
          },
        });
      }
    }, 1000),
    [id]
  );
  
  const handleStatusChange = (status: string) => {
    if (id) {
      updateCounty.mutate({ id, updates: { foia_status: status } });
    }
  };
  
  const handleLogRequest = () => {
    if (!id) return;
    createRequest.mutate({
      county_id: id,
      ...requestForm,
    }, {
      onSuccess: () => {
        setIsRequestModalOpen(false);
        setRequestForm({
          request_date: format(new Date(), 'yyyy-MM-dd'),
          request_method: 'email',
          data_years_requested: '2020-2024',
          notes: '',
        });
      },
    });
  };
  
  if (countyLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </AppLayout>
    );
  }
  
  if (!county) {
    return (
      <AppLayout>
        <div className="container mx-auto py-8 px-4 max-w-4xl">
          <p>County not found.</p>
          <Button asChild className="mt-4">
            <Link to="/va-workspace">← Back to My Counties</Link>
          </Button>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-4xl space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <Button variant="ghost" asChild className="mb-2">
              <Link to="/va-workspace">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to My Counties
              </Link>
            </Button>
            <h1 className="text-2xl font-bold">{county.county_name}, {county.state}</h1>
          </div>
          
          <div className="flex items-center gap-2">
            <Label>Status:</Label>
            <Select value={county.foia_status || 'not_contacted'} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {statusOptions.map(opt => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        
        {/* FOIA Portal Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              FOIA Portal
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {county.foia_portal_url ? (
              <>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Portal URL</p>
                  <a 
                    href={county.foia_portal_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-primary hover:underline break-all"
                  >
                    {county.foia_portal_url}
                  </a>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Portal Type</p>
                  <Badge variant="outline">{county.portal_type || 'Unknown'}</Badge>
                </div>
                <Button asChild size="lg" className="w-full md:w-auto">
                  <a href={county.foia_portal_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Portal
                  </a>
                </Button>
              </>
            ) : (
              <p className="text-muted-foreground">No portal URL configured for this county.</p>
            )}
          </CardContent>
        </Card>
        
        {/* Request History */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Request History
            </CardTitle>
            <Dialog open={isRequestModalOpen} onOpenChange={setIsRequestModalOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Log New Request
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Log FOIA Request</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div>
                    <Label>Request Date</Label>
                    <Input 
                      type="date" 
                      value={requestForm.request_date}
                      onChange={(e) => setRequestForm(f => ({ ...f, request_date: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Request Method</Label>
                    <Select 
                      value={requestForm.request_method}
                      onValueChange={(v) => setRequestForm(f => ({ ...f, request_method: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="web_form">Web Form</SelectItem>
                        <SelectItem value="mail">Mail</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Data Years Requested</Label>
                    <Input 
                      placeholder="e.g., 2020-2024"
                      value={requestForm.data_years_requested}
                      onChange={(e) => setRequestForm(f => ({ ...f, data_years_requested: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Notes (optional)</Label>
                    <Textarea 
                      placeholder="Any additional notes..."
                      value={requestForm.notes}
                      onChange={(e) => setRequestForm(f => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                  <Button 
                    onClick={handleLogRequest} 
                    disabled={createRequest.isPending}
                    className="w-full"
                  >
                    {createRequest.isPending ? 'Logging...' : 'Log Request'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {requestsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : requests && requests.length > 0 ? (
              <div className="space-y-4">
                {requests.map((req, i) => (
                  <div key={req.id} className="relative pl-6 pb-4 border-l-2 border-muted last:pb-0">
                    <div className="absolute -left-2 top-0">
                      {req.status === 'fulfilled' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : req.status === 'declined' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Clock className="h-4 w-4 text-yellow-500" />
                      )}
                    </div>
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">
                          {format(new Date(req.request_date), 'MMM d, yyyy')}
                          <span className="text-muted-foreground font-normal ml-2">
                            via {req.request_method}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Years requested: {req.data_years_requested || 'N/A'}
                        </p>
                        {req.notes && (
                          <p className="text-sm mt-1">{req.notes}</p>
                        )}
                      </div>
                      <Badge className={statusColors[req.status || ''] || 'bg-muted'}>
                        {req.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-muted-foreground text-center py-8">
                No requests sent yet.
              </p>
            )}
          </CardContent>
        </Card>
        
        {/* County Notes */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              County Notes
              {notesSaved && <span className="text-sm font-normal text-green-500">Saved</span>}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea 
              placeholder="Add notes about this portal (response time, contact preferences, etc.)"
              className="min-h-32"
              defaultValue={county.notes || ''}
              onChange={(e) => saveNotes(e.target.value)}
            />
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
