import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ArrowLeft, Search, Users, Shuffle, Map } from 'lucide-react';
import { useFoiaCounties, useAssignCounty, CountyWithStats } from '@/hooks/useFoiaCounties';
import { useVAList, VAUser } from '@/hooks/useVAList';
import { useToast } from '@/hooks/use-toast';

const statusColors: Record<string, string> = {
  not_contacted: 'bg-muted text-muted-foreground',
  pending: 'bg-yellow-500/20 text-yellow-400',
  fulfilled: 'bg-green-500/20 text-green-400',
  declined: 'bg-red-500/20 text-red-400',
  invoice_required: 'bg-orange-500/20 text-orange-400',
};

export default function AdminAssignCounties() {
  const { toast } = useToast();
  const { data: counties, isLoading: countiesLoading } = useFoiaCounties();
  const { data: vas, isLoading: vasLoading } = useVAList();
  const assignCounty = useAssignCounty();
  
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [vaFilter, setVaFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCounties, setSelectedCounties] = useState<Set<string>>(new Set());
  const [bulkVaId, setBulkVaId] = useState<string>('');
  const [stateAssignModal, setStateAssignModal] = useState<{ open: boolean; state: string }>({ open: false, state: '' });
  const [stateAssignVa, setStateAssignVa] = useState<string>('');
  
  // Get unique states
  const states = [...new Set(counties?.map(c => c.state) || [])].sort();
  
  // Filter counties
  const filteredCounties = counties?.filter(c => {
    if (search && !c.county_name.toLowerCase().includes(search.toLowerCase())) return false;
    if (stateFilter !== 'all' && c.state !== stateFilter) return false;
    if (statusFilter !== 'all' && c.foia_status !== statusFilter) return false;
    if (vaFilter === 'unassigned' && c.assigned_to) return false;
    if (vaFilter !== 'all' && vaFilter !== 'unassigned' && c.assigned_to !== vaFilter) return false;
    return true;
  }) || [];
  
  const handleSelectAll = () => {
    if (selectedCounties.size === filteredCounties.length) {
      setSelectedCounties(new Set());
    } else {
      setSelectedCounties(new Set(filteredCounties.map(c => c.id)));
    }
  };
  
  const handleSelectCounty = (countyId: string) => {
    const newSet = new Set(selectedCounties);
    if (newSet.has(countyId)) {
      newSet.delete(countyId);
    } else {
      newSet.add(countyId);
    }
    setSelectedCounties(newSet);
  };
  
  const handleAssignSingle = (countyId: string, vaId: string | null) => {
    assignCounty.mutate({ countyIds: [countyId], vaId });
  };
  
  const handleBulkAssign = () => {
    if (!bulkVaId || selectedCounties.size === 0) return;
    assignCounty.mutate({ 
      countyIds: Array.from(selectedCounties), 
      vaId: bulkVaId === 'unassign' ? null : bulkVaId 
    }, {
      onSuccess: () => setSelectedCounties(new Set()),
    });
  };
  
  const handleAssignByState = () => {
    if (!stateAssignVa || !stateAssignModal.state) return;
    const stateCounties = counties?.filter(c => c.state === stateAssignModal.state) || [];
    assignCounty.mutate({ 
      countyIds: stateCounties.map(c => c.id), 
      vaId: stateAssignVa 
    }, {
      onSuccess: () => {
        setStateAssignModal({ open: false, state: '' });
        setStateAssignVa('');
      },
    });
  };
  
  const handleBalanceWorkload = () => {
    if (!vas?.length || !counties?.length) return;
    
    const unassigned = counties.filter(c => !c.assigned_to);
    const perVa = Math.ceil(unassigned.length / vas.length);
    
    let index = 0;
    for (const va of vas) {
      const batch = unassigned.slice(index, index + perVa);
      if (batch.length > 0) {
        assignCounty.mutate({ countyIds: batch.map(c => c.id), vaId: va.id });
      }
      index += perVa;
    }
    
    toast({ title: 'Workload Balanced', description: `Distributed ${unassigned.length} counties across ${vas.length} VAs` });
  };
  
  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        <Button variant="ghost" asChild className="mb-4">
          <Link to="/admin-console">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Admin Console
          </Link>
        </Button>
        
        <PageHeader 
          title="Assign Counties to VAs" 
          description="Manage county assignments for your virtual assistants"
        />
        
        <div className="grid lg:grid-cols-[300px_1fr] gap-6 mt-6">
          {/* VA Sidebar */}
          <Card className="h-fit">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Virtual Assistants
              </CardTitle>
            </CardHeader>
            <CardContent>
              {vasLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : vas && vas.length > 0 ? (
                <div className="space-y-3">
                  {vas.map(va => (
                    <div key={va.id} className="p-3 bg-muted/50 rounded-lg">
                      <p className="font-medium">{va.full_name || va.email}</p>
                      <p className="text-sm text-muted-foreground">
                        {va.counties_count} counties
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No VAs found</p>
              )}
              
              <div className="mt-4 pt-4 border-t space-y-2">
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => setStateAssignModal({ open: true, state: states[0] || '' })}
                >
                  <Map className="h-4 w-4 mr-2" />
                  Assign by State
                </Button>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={handleBalanceWorkload}
                >
                  <Shuffle className="h-4 w-4 mr-2" />
                  Balance Workload
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Main Content */}
          <Card>
            <CardHeader>
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search counties..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Select value={stateFilter} onValueChange={setStateFilter}>
                    <SelectTrigger className="w-28">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {states.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={vaFilter} onValueChange={setVaFilter}>
                    <SelectTrigger className="w-36">
                      <SelectValue placeholder="Assigned VA" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {vas?.map(va => (
                        <SelectItem key={va.id} value={va.id}>
                          {va.full_name || va.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="not_contacted">Not Contacted</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="fulfilled">Fulfilled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Bulk Actions */}
              {selectedCounties.size > 0 && (
                <div className="flex flex-col gap-3 mt-4 p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-4">
                    <span className="font-medium">{selectedCounties.size} selected</span>
                    <Select value={bulkVaId} onValueChange={setBulkVaId}>
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Assign to VA" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unassign">Unassign</SelectItem>
                        {vas?.map(va => (
                          <SelectItem key={va.id} value={va.id}>
                            {va.full_name || va.email}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button 
                      onClick={handleBulkAssign} 
                      disabled={!bulkVaId}
                    >
                      Apply
                    </Button>
                  </div>
                </div>
              )}
            </CardHeader>
            <CardContent>
              {countiesLoading ? (
                <div className="space-y-2">
                  {[...Array(10)].map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : (
                <ScrollArea className="h-[600px]">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 p-2 border-b sticky top-0 bg-background">
                      <Checkbox 
                        checked={selectedCounties.size === filteredCounties.length && filteredCounties.length > 0}
                        onCheckedChange={handleSelectAll}
                      />
                      <span className="text-sm text-muted-foreground">
                        {filteredCounties.length} counties
                      </span>
                    </div>
                    
                    {filteredCounties.map(county => (
                      <CountyRow 
                        key={county.id}
                        county={county}
                        vas={vas || []}
                        isSelected={selectedCounties.has(county.id)}
                        onSelect={() => handleSelectCounty(county.id)}
                        onAssign={(vaId) => handleAssignSingle(county.id, vaId)}
                      />
                    ))}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
        
        {/* Assign by State Modal */}
        <Dialog open={stateAssignModal.open} onOpenChange={(open) => setStateAssignModal({ ...stateAssignModal, open })}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Counties by State</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div>
                <label className="text-sm font-medium">State</label>
                <Select value={stateAssignModal.state} onValueChange={(s) => setStateAssignModal({ ...stateAssignModal, state: s })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Assign to VA</label>
                <Select value={stateAssignVa} onValueChange={setStateAssignVa}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a VA" />
                  </SelectTrigger>
                  <SelectContent>
                    {vas?.map(va => (
                      <SelectItem key={va.id} value={va.id}>
                        {va.full_name || va.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <p className="text-sm text-muted-foreground">
                This will assign all {counties?.filter(c => c.state === stateAssignModal.state).length || 0} counties in {stateAssignModal.state} to the selected VA.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStateAssignModal({ open: false, state: '' })}>
                Cancel
              </Button>
              <Button onClick={handleAssignByState} disabled={!stateAssignVa}>
                Assign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}

// County Row Component
function CountyRow({ 
  county, 
  vas, 
  isSelected, 
  onSelect, 
  onAssign 
}: { 
  county: CountyWithStats; 
  vas: VAUser[]; 
  isSelected: boolean;
  onSelect: () => void;
  onAssign: (vaId: string | null) => void;
}) {
  const assignedVa = vas.find(v => v.id === county.assigned_to);
  
  return (
    <div className="flex items-center gap-3 p-3 hover:bg-muted/50 rounded-lg transition-colors">
      <Checkbox checked={isSelected} onCheckedChange={onSelect} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{county.county_name}</p>
        <p className="text-sm text-muted-foreground">{county.state}</p>
      </div>
      <Badge className={statusColors[county.foia_status || 'not_contacted']}>
        {(county.foia_status || 'not_contacted').replace('_', ' ')}
      </Badge>
      <Select 
        value={county.assigned_to || 'unassigned'} 
        onValueChange={(v) => onAssign(v === 'unassigned' ? null : v)}
      >
        <SelectTrigger className="w-40">
          <SelectValue>
            {assignedVa ? (assignedVa.full_name || assignedVa.email) : 'Unassigned'}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">Unassigned</SelectItem>
          {vas.map(va => (
            <SelectItem key={va.id} value={va.id}>
              {va.full_name || va.email}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
