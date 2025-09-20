import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Search, Download, Phone, MapPin, Calendar, FileText } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Violation {
  id: number;
  case_id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  violation: string;
  status: string;
  opened_date: string;
  last_updated: string;
  snap_score: number;
  insight: string;
}

// Sample data for demo
const sampleViolations: Violation[] = [
  {
    id: 1,
    case_id: "VIO-2024-001",
    address: "123 Main St",
    city: "Springfield",
    state: "IL",
    zip: "62701",
    violation: "Unsafe roof condition requiring immediate repair",
    status: "Open",
    opened_date: "2024-01-15",
    last_updated: "2024-01-15",
    snap_score: 85,
    insight: "Recently opened safety-related issue—likely deferred maintenance. Owner responsiveness may be low."
  },
  {
    id: 2,
    case_id: "VIO-2024-002",
    address: "456 Oak Ave",
    city: "Springfield",
    state: "IL",
    zip: "62702",
    violation: "Property maintenance violations",
    status: "Pending",
    opened_date: "2023-06-10",
    last_updated: "2024-01-10",
    snap_score: 42,
    insight: "Long-standing unresolved violation; potential distress and negotiation leverage."
  },
  {
    id: 3,
    case_id: "VIO-2024-003",
    address: "789 Pine St",
    city: "Springfield",
    state: "IL",
    zip: "62703",
    violation: "Fire safety code violations",
    status: "Open",
    opened_date: "2024-02-01",
    last_updated: "2024-02-01",
    snap_score: 78,
    insight: "Recently opened safety-related issue—likely deferred maintenance. Owner responsiveness may be low."
  }
];

export function Leads() {
  const [violations] = useState<Violation[]>(sampleViolations);
  const [filteredViolations, setFilteredViolations] = useState<Violation[]>(sampleViolations);
  const [selectedViolation, setSelectedViolation] = useState<Violation | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    city: '',
    status: '',
    scoreRange: [0, 100],
  });
  const { toast } = useToast();

  const getScoreVariant = (score: number) => {
    if (score >= 70) return 'score-high';
    if (score >= 40) return 'score-medium';
    return 'score-low';
  };

  const handleRowClick = (violation: Violation) => {
    setSelectedViolation(violation);
    setSheetOpen(true);
  };

  const handleSkipTrace = async (violation: Violation) => {
    toast({
      title: "Skip trace initiated",
      description: `Searching for contact information for ${violation.address}`,
    });
    
    // Simulate API call
    setTimeout(() => {
      toast({
        title: "Skip trace completed",
        description: "Found 3 phone numbers and 2 email addresses",
      });
    }, 2000);
  };

  const handleExportCSV = () => {
    toast({
      title: "Export started",
      description: "Your filtered results are being prepared for download",
    });
  };

  const cities = [...new Set(violations.map(v => v.city))];
  const statuses = [...new Set(violations.map(v => v.status))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Violation Leads</h1>
          <p className="text-muted-foreground mt-2">
            Manage and analyze your violation data with SnapScore insights
          </p>
        </div>
        <Button onClick={handleExportCSV} variant="outline" className="flex items-center space-x-2">
          <Download className="h-4 w-4" />
          <span>Export CSV</span>
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Refine your violation leads</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Address, violation..."
                  className="pl-10"
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>City</Label>
              <Select value={filters.city} onValueChange={(value) => setFilters(prev => ({ ...prev, city: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All cities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All cities</SelectItem>
                  {cities.map(city => (
                    <SelectItem key={city} value={city}>{city}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All statuses</SelectItem>
                  {statuses.map(status => (
                    <SelectItem key={status} value={status}>{status}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label>SnapScore Range: {filters.scoreRange[0]} - {filters.scoreRange[1]}</Label>
              <Slider
                value={filters.scoreRange}
                onValueChange={(value) => setFilters(prev => ({ ...prev, scoreRange: value }))}
                max={100}
                min={0}
                step={1}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <Card>
        <CardHeader>
          <CardTitle>Results ({filteredViolations.length})</CardTitle>
          <CardDescription>Click on a row to view details and skip trace options</CardDescription>
        </CardHeader>
        <CardContent>
          {filteredViolations.length === 0 ? (
            <div className="text-center py-8">
              <FileText className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">No violations found</h3>
              <p className="text-muted-foreground">Upload a CSV to get your first insights.</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SnapScore</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Violation</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Opened Date</TableHead>
                    <TableHead>Insight</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredViolations.map((violation) => (
                    <TableRow 
                      key={violation.id} 
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => handleRowClick(violation)}
                    >
                      <TableCell>
                        <Badge variant={getScoreVariant(violation.snap_score)}>
                          {violation.snap_score}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>
                          <div>{violation.address}</div>
                          <div className="text-sm text-muted-foreground">
                            {violation.city}, {violation.state} {violation.zip}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate" title={violation.violation}>
                          {violation.violation}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={violation.status === 'Open' ? 'destructive' : 'secondary'}>
                          {violation.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(violation.opened_date).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="max-w-xs">
                        <div className="truncate text-sm" title={violation.insight}>
                          {violation.insight}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSkipTrace(violation);
                          }}
                          className="flex items-center space-x-1"
                        >
                          <Phone className="h-3 w-3" />
                          <span>Skip Trace</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-lg">
          {selectedViolation && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center space-x-2">
                  <Badge variant={getScoreVariant(selectedViolation.snap_score)}>
                    {selectedViolation.snap_score}
                  </Badge>
                  <span>Case {selectedViolation.case_id}</span>
                </SheetTitle>
                <SheetDescription>
                  Violation details and skip trace options
                </SheetDescription>
              </SheetHeader>
              
              <div className="mt-6 space-y-6">
                <div>
                  <h3 className="font-medium mb-3 flex items-center space-x-2">
                    <MapPin className="h-4 w-4" />
                    <span>Property Information</span>
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Address:</strong> {selectedViolation.address}</div>
                    <div><strong>City:</strong> {selectedViolation.city}</div>
                    <div><strong>State:</strong> {selectedViolation.state}</div>
                    <div><strong>ZIP:</strong> {selectedViolation.zip}</div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-3 flex items-center space-x-2">
                    <FileText className="h-4 w-4" />
                    <span>Violation Details</span>
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Violation:</strong> {selectedViolation.violation}</div>
                    <div>
                      <strong>Status:</strong> 
                      <Badge variant={selectedViolation.status === 'Open' ? 'destructive' : 'secondary'} className="ml-2">
                        {selectedViolation.status}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-3 flex items-center space-x-2">
                    <Calendar className="h-4 w-4" />
                    <span>Timeline</span>
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div><strong>Opened:</strong> {new Date(selectedViolation.opened_date).toLocaleDateString()}</div>
                    <div><strong>Last Updated:</strong> {new Date(selectedViolation.last_updated).toLocaleDateString()}</div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-3">SnapScore Insight</h3>
                  <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
                    {selectedViolation.insight}
                  </p>
                </div>
                
                <div className="space-y-3">
                  <Button 
                    className="w-full" 
                    onClick={() => handleSkipTrace(selectedViolation)}
                  >
                    <Phone className="mr-2 h-4 w-4" />
                    Run Skip Trace
                  </Button>
                  <Button variant="outline" className="w-full">
                    <Download className="mr-2 h-4 w-4" />
                    Export This Lead
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}