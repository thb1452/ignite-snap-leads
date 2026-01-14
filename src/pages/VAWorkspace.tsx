import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Search, 
  FileText, 
  HelpCircle, 
  ChevronRight, 
  Flame, 
  AlertTriangle, 
  BarChart3,
  ExternalLink,
  ChevronDown,
  Send,
  Calendar,
  ClipboardList,
  MessageSquare,
  CheckCircle,
  Clock,
  BookOpen
} from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useFoiaCounties, useVAStats, CountyWithStats } from '@/hooks/useFoiaCounties';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  not_contacted: 'bg-muted text-muted-foreground',
  pending: 'bg-yellow-500/20 text-yellow-400',
  fulfilled: 'bg-green-500/20 text-green-400',
  declined: 'bg-red-500/20 text-red-400',
  invoice_required: 'bg-orange-500/20 text-orange-400',
  invoice_paid: 'bg-blue-500/20 text-blue-400',
  data_received: 'bg-emerald-500/20 text-emerald-400',
};

function StatusBadge({ status }: { status: string | null }) {
  const displayStatus = status || 'not_contacted';
  return (
    <Badge className={statusColors[displayStatus] || statusColors.not_contacted}>
      {displayStatus.replace(/_/g, ' ')}
    </Badge>
  );
}

function PrioritySection({ 
  title, 
  icon: Icon, 
  iconColor,
  counties, 
  defaultOpen = true 
}: { 
  title: string; 
  icon: React.ComponentType<{ className?: string }>; 
  iconColor: string;
  counties: CountyWithStats[];
  defaultOpen?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  
  if (counties.length === 0) return null;
  
  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-between p-4 h-auto">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${iconColor}`} />
            <span className="font-semibold">{title}</span>
            <Badge variant="outline">{counties.length}</Badge>
          </div>
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 px-4 pb-4">
        {counties.map(county => (
          <div 
            key={county.id}
            className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
          >
            <div>
              <p className="font-medium">{county.county_name}, {county.state}</p>
              <p className="text-sm text-muted-foreground">
                Data {county.days_since_update === 999 ? 'never updated' : `${county.days_since_update} days old`}
              </p>
            </div>
            <div className="flex gap-2">
              {county.foia_status === 'pending' && county.foia_portal_url ? (
                <Button size="sm" variant="outline" asChild>
                  <a href={county.foia_portal_url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-1" />
                    Check Portal
                  </a>
                </Button>
              ) : (
                <Button size="sm" asChild>
                  <Link to={`/va-workspace/county/${county.id}`}>
                    <Send className="h-4 w-4 mr-1" />
                    {county.foia_status === 'data_received' ? 'Upload Data' : 'Send Request'}
                  </Link>
                </Button>
              )}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

export default function VAWorkspace() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showHelpModal, setShowHelpModal] = useState(false);
  
  const { data: stats, isLoading: statsLoading } = useVAStats();
  const { data: counties, isLoading: countiesLoading } = useFoiaCounties({
    assignedOnly: true,
    status: statusFilter,
    search,
  });
  
  // Priority grouping
  const urgentCounties = counties?.filter(c => c.priority_score && c.priority_score > 900).slice(0, 5) || [];
  const importantCounties = counties?.filter(c => c.priority_score && c.priority_score >= 300 && c.priority_score <= 900).slice(0, 10) || [];
  const routineCount = counties?.filter(c => c.priority_score && c.priority_score < 300).length || 0;
  
  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'VA';
  const today = format(new Date(), 'EEEE, MMMM d, yyyy');
  
  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Welcome back, {firstName}</h1>
            <p className="text-muted-foreground">{today}</p>
          </div>
          
          {/* Stats cards */}
          <div className="grid grid-cols-3 gap-4">
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Requests This Week</p>
              {statsLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{stats?.requestsThisWeek || 0}</p>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Response Rate</p>
              {statsLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{stats?.responseRate || 0}%</p>
              )}
            </Card>
            <Card className="p-4">
              <p className="text-sm text-muted-foreground">Counties Assigned</p>
              {statsLoading ? (
                <Skeleton className="h-8 w-16 mt-1" />
              ) : (
                <p className="text-2xl font-bold">{stats?.countiesAssigned || 0}</p>
              )}
            </Card>
          </div>
        </div>
        
        {/* Priority Tasks */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Priority Tasks
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 p-0">
            {countiesLoading ? (
              <div className="p-4 space-y-2">
                <Skeleton className="h-12 w-full" />
                <Skeleton className="h-12 w-full" />
              </div>
            ) : (
              <>
                <PrioritySection 
                  title="🔥 Urgent (Do Today)" 
                  icon={Flame} 
                  iconColor="text-red-500"
                  counties={urgentCounties} 
                />
                <PrioritySection 
                  title="⚠️ Important (This Week)" 
                  icon={AlertTriangle} 
                  iconColor="text-yellow-500"
                  counties={importantCounties}
                  defaultOpen={false}
                />
                {routineCount > 0 && (
                  <div className="px-4 pb-4">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <BarChart3 className="h-4 w-4" />
                      <span>{routineCount} routine tasks</span>
                    </div>
                  </div>
                )}
              </>
            )}
            <p className="text-xs text-muted-foreground px-4 pb-4">
              Tasks ranked by data staleness. Counties with older data show up first.
            </p>
          </CardContent>
        </Card>
        
        {/* My Counties */}
        <Card>
          <CardHeader>
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <CardTitle>My Counties</CardTitle>
              <div className="flex gap-2">
                <div className="relative flex-1 md:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search counties..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40">
                    <SelectValue placeholder="Filter status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="not_contacted">Not Contacted</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    <SelectItem value="declined">Declined</SelectItem>
                    <SelectItem value="invoice_required">Invoice Required</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {countiesLoading ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-32" />
                ))}
              </div>
            ) : counties && counties.length > 0 ? (
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {counties.map(county => (
                  <Card key={county.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start mb-2">
                        <h3 className="font-semibold">{county.county_name}, {county.state}</h3>
                        <StatusBadge status={county.foia_status} />
                      </div>
                      <p className="text-sm text-muted-foreground mb-3">
                        Last request: {county.last_request_date 
                          ? format(new Date(county.last_request_date), 'MMM d, yyyy')
                          : 'Never'}
                      </p>
                      <Button variant="outline" size="sm" className="w-full" asChild>
                        <Link to={`/va-workspace/county/${county.id}`}>
                          View Details
                          <ChevronRight className="h-4 w-4 ml-1" />
                        </Link>
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                <p>No counties assigned yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <Button variant="outline" asChild>
              <Link to="/va-workspace/templates">
                <FileText className="h-4 w-4 mr-2" />
                View Templates
              </Link>
            </Button>
            <Button variant="ghost" onClick={() => setShowHelpModal(true)}>
              <HelpCircle className="h-4 w-4 mr-2" />
              Help & Guidelines
            </Button>
          </CardContent>
        </Card>
      </div>
      
      {/* Help Modal */}
      <Dialog open={showHelpModal} onOpenChange={setShowHelpModal}>
        <DialogContent className="max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-xl">
              <BookOpen className="h-5 w-5" />
              VA Workspace Guide
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-4">
            <div className="space-y-6 py-4">
              {/* Section 1 */}
              <section>
                <h3 className="flex items-center gap-2 font-semibold text-lg mb-3">
                  <ClipboardList className="h-5 w-5 text-primary" />
                  Daily Workflow
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Start your day by checking "Priority Tasks" - focus on 🔥 Urgent items first
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Work through counties in order: Urgent → Important → Routine
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Log every FOIA request immediately after sending it
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Add notes to counties about portal quirks or response patterns
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Update county status as soon as you receive responses
                  </li>
                </ul>
              </section>
              
              {/* Section 2 */}
              <section>
                <h3 className="flex items-center gap-2 font-semibold text-lg mb-3">
                  <FileText className="h-5 w-5 text-primary" />
                  Using Templates
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Click "View Templates" to access pre-written FOIA requests
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Choose the template that matches your county's state
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Click "View & Copy" to copy template to clipboard
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Replace [COUNTY NAME] and [STATE] with actual county/state name
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Paste into the FOIA portal and submit
                  </li>
                </ul>
              </section>
              
              {/* Section 3 */}
              <section>
                <h3 className="flex items-center gap-2 font-semibold text-lg mb-3">
                  <Send className="h-5 w-5 text-primary" />
                  Logging Requests
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Go to county detail page
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Click "Log New Request"
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Enter: request date, method (email/web form/mail), years requested
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Add any notes about the request
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Click "Log Request" - this updates the county status to "Pending"
                  </li>
                </ul>
              </section>
              
              {/* Section 4 */}
              <section>
                <h3 className="flex items-center gap-2 font-semibold text-lg mb-3">
                  <Clock className="h-5 w-5 text-primary" />
                  Following Up
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    If no response after 30 days, check the portal again
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Update county status based on response:
                  </li>
                  <li className="ml-6 space-y-1">
                    <p><CheckCircle className="inline h-4 w-4 text-green-500 mr-1" /> <strong>Fulfilled</strong> - data received and ready to clean</p>
                    <p><span className="text-red-500 mr-1">✕</span> <strong>Declined</strong> - county refused to provide data</p>
                    <p><span className="text-orange-500 mr-1">$</span> <strong>Invoice Required</strong> - they want payment first</p>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Add notes about what happened
                  </li>
                </ul>
              </section>
              
              {/* Section 5 */}
              <section>
                <h3 className="flex items-center gap-2 font-semibold text-lg mb-3">
                  <MessageSquare className="h-5 w-5 text-primary" />
                  County Notes Best Practices
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Document portal preferences (email vs web form)
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Note typical response times
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Record any special requirements (date formats, etc.)
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    Flag difficult portals or helpful contacts
                  </li>
                </ul>
              </section>
              
              {/* Section 6 */}
              <section>
                <h3 className="flex items-center gap-2 font-semibold text-lg mb-3">
                  <HelpCircle className="h-5 w-5 text-primary" />
                  Getting Help
                </h3>
                <ul className="space-y-2 text-muted-foreground">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    If a portal is confusing, add detailed notes and ask admin for help
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    If invoice is required, update status and notify admin
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    If county declines, document reason in notes
                  </li>
                </ul>
              </section>
            </div>
          </ScrollArea>
          <div className="pt-4 border-t">
            <Button onClick={() => setShowHelpModal(false)} className="w-full">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
