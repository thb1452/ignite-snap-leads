import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Slider } from '@/components/ui/slider';
import { 
  Upload, 
  MapPin, 
  Sparkles, 
  Activity, 
  Users, 
  FileText,
  Settings,
  Database
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';

export default function AdminConsole() {
  const [geocodeAddress, setGeocodeAddress] = useState('');
  const [geocodeResult, setGeocodeResult] = useState<any>(null);
  const [insightInput, setInsightInput] = useState('');
  const [insightOutput, setInsightOutput] = useState('');
  const [snapScoreFactors, setSnapScoreFactors] = useState({
    violationAge: 50,
    severity: 50,
    ownerPresence: 50,
    pastViolations: 50,
  });
  const [calculatedScore, setCalculatedScore] = useState(0);

  const { data: counties } = useQuery({
    queryKey: ['all-counties'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counties')
        .select('*, user_roles!counties_assigned_to_fkey(user_id)')
        .order('county_name');
      
      if (error) throw error;
      return data;
    },
  });

  const { data: uploadLogs } = useQuery({
    queryKey: ['upload-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upload_history')
        .select('*, counties(county_name, state)')
        .order('upload_date', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      return data;
    },
  });

  const calculateSnapScore = () => {
    const { violationAge, severity, ownerPresence, pastViolations } = snapScoreFactors;
    const score = Math.round(
      (violationAge * 0.25) +
      (severity * 0.35) +
      (ownerPresence * 0.2) +
      (pastViolations * 0.2)
    );
    setCalculatedScore(Math.min(100, Math.max(0, score)));
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-ink-900">Founder Console</h1>
            <p className="text-ink-600 mt-2">Admin tools and testing panel</p>
          </div>
          <Badge variant="destructive" className="text-lg px-4 py-2">
            <Settings className="h-4 w-4 mr-2" />
            Admin Only
          </Badge>
        </div>

        <Tabs defaultValue="bulk-upload" className="w-full">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="bulk-upload">
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload
            </TabsTrigger>
            <TabsTrigger value="geocoding">
              <MapPin className="h-4 w-4 mr-2" />
              Geocoding
            </TabsTrigger>
            <TabsTrigger value="insights">
              <Sparkles className="h-4 w-4 mr-2" />
              Insights
            </TabsTrigger>
            <TabsTrigger value="snapscore">
              <Activity className="h-4 w-4 mr-2" />
              SnapScore
            </TabsTrigger>
            <TabsTrigger value="counties">
              <Database className="h-4 w-4 mr-2" />
              Counties
            </TabsTrigger>
            <TabsTrigger value="logs">
              <FileText className="h-4 w-4 mr-2" />
              Logs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bulk-upload" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Bulk CSV Upload Tool</CardTitle>
                <CardDescription>Upload multiple CSVs with auto-mapping</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-ink-200 rounded-lg p-12 text-center">
                  <Upload className="h-12 w-12 mx-auto text-ink-400 mb-4" />
                  <p className="text-ink-600 mb-2">Drag and drop CSVs here or click to browse</p>
                  <Button variant="outline" disabled>
                    Select Files
                  </Button>
                </div>
                <p className="text-sm text-ink-500">Feature coming soon - will include column mapping, cleanup functions, and preview before submit.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="geocoding" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Geocoding Engine Test</CardTitle>
                <CardDescription>Test address geocoding functionality</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input
                    placeholder="123 Main St, City, State ZIP"
                    value={geocodeAddress}
                    onChange={(e) => setGeocodeAddress(e.target.value)}
                  />
                </div>
                <Button onClick={() => setGeocodeResult({ lat: 0, lng: 0, success: false })} disabled>
                  <MapPin className="h-4 w-4 mr-2" />
                  Test Geocode
                </Button>
                {geocodeResult && (
                  <div className="p-4 bg-ink-50 rounded-lg">
                    <p className="font-mono text-sm">
                      {geocodeResult.success ? (
                        <>Lat: {geocodeResult.lat}, Lng: {geocodeResult.lng}</>
                      ) : (
                        'Error: Could not geocode address'
                      )}
                    </p>
                  </div>
                )}
                <p className="text-sm text-ink-500">Edge function integration coming soon.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="insights" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Insight Generator Preview</CardTitle>
                <CardDescription>AI-powered violation insights</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Violation Description</Label>
                  <Textarea
                    placeholder="Enter violation description..."
                    value={insightInput}
                    onChange={(e) => setInsightInput(e.target.value)}
                    rows={4}
                  />
                </div>
                <Button onClick={() => setInsightOutput('Insight generation coming soon...')} disabled>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Insight
                </Button>
                {insightOutput && (
                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm">{insightOutput}</p>
                  </div>
                )}
                <p className="text-sm text-ink-500">Lovable AI integration coming soon.</p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="snapscore" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>SnapScore Testing Panel</CardTitle>
                <CardDescription>Test scoring algorithm with different factors</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Violation Age (0-100): {snapScoreFactors.violationAge}</Label>
                    <Slider
                      value={[snapScoreFactors.violationAge]}
                      onValueChange={([value]) => setSnapScoreFactors(prev => ({ ...prev, violationAge: value }))}
                      max={100}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Severity (0-100): {snapScoreFactors.severity}</Label>
                    <Slider
                      value={[snapScoreFactors.severity]}
                      onValueChange={([value]) => setSnapScoreFactors(prev => ({ ...prev, severity: value }))}
                      max={100}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Owner Presence (0-100): {snapScoreFactors.ownerPresence}</Label>
                    <Slider
                      value={[snapScoreFactors.ownerPresence]}
                      onValueChange={([value]) => setSnapScoreFactors(prev => ({ ...prev, ownerPresence: value }))}
                      max={100}
                      step={1}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Past Violations (0-100): {snapScoreFactors.pastViolations}</Label>
                    <Slider
                      value={[snapScoreFactors.pastViolations]}
                      onValueChange={([value]) => setSnapScoreFactors(prev => ({ ...prev, pastViolations: value }))}
                      max={100}
                      step={1}
                    />
                  </div>
                </div>
                <Button onClick={calculateSnapScore} className="w-full">
                  <Activity className="h-4 w-4 mr-2" />
                  Calculate SnapScore
                </Button>
                {calculatedScore > 0 && (
                  <div className="text-center p-6 bg-gradient-to-br from-brand to-brand-light rounded-lg">
                    <p className="text-white text-sm mb-2">Calculated SnapScore</p>
                    <p className="text-6xl font-bold text-white">{calculatedScore}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="counties" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>County Manager</CardTitle>
                <CardDescription>Manage counties and VA assignments</CardDescription>
              </CardHeader>
              <CardContent>
                {counties && counties.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>County</TableHead>
                        <TableHead>State</TableHead>
                        <TableHead>FOIA Status</TableHead>
                        <TableHead>Lists</TableHead>
                        <TableHead>Assigned VA</TableHead>
                        <TableHead>Last Updated</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {counties.map((county) => (
                        <TableRow key={county.id}>
                          <TableCell className="font-medium">{county.county_name}</TableCell>
                          <TableCell>{county.state}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{county.foia_status || 'N/A'}</Badge>
                          </TableCell>
                          <TableCell>{county.list_count}</TableCell>
                          <TableCell>
                            {county.assigned_to ? (
                              <Badge>Assigned</Badge>
                            ) : (
                              <Badge variant="secondary">Unassigned</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            {new Date(county.updated_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" disabled>
                              Assign VA
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-ink-500 text-center py-8">No counties created yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Upload Logs</CardTitle>
                <CardDescription>System-wide upload activity</CardDescription>
              </CardHeader>
              <CardContent>
                {uploadLogs && uploadLogs.length > 0 ? (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>File Name</TableHead>
                        <TableHead>County</TableHead>
                        <TableHead>Rows</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Timestamp</TableHead>
                        <TableHead>Error</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uploadLogs.map((log) => (
                        <TableRow key={log.id}>
                          <TableCell className="font-mono text-sm">{log.file_name}</TableCell>
                          <TableCell>
                            {log.counties?.county_name}, {log.counties?.state}
                          </TableCell>
                          <TableCell>{log.row_count?.toLocaleString()}</TableCell>
                          <TableCell>
                            <Badge variant={log.status === 'success' || log.status === 'Success' ? 'default' : 'destructive'}>
                              {log.status}
                            </Badge>
                          </TableCell>
                          <TableCell>{new Date(log.upload_date).toLocaleString()}</TableCell>
                          <TableCell className="text-sm text-red-600">
                            {log.error_message || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                ) : (
                  <p className="text-ink-500 text-center py-8">No upload logs yet.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
