import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Upload, FileText, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Badge } from '@/components/ui/badge';

export default function VADashboard() {
  const { user } = useAuth();

  const { data: assignedCounties, isLoading: countiesLoading } = useQuery({
    queryKey: ['assigned-counties', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('counties')
        .select('*')
        .eq('assigned_to', user?.id)
        .order('county_name');
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const { data: uploadHistory } = useQuery({
    queryKey: ['upload-history', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('upload_history')
        .select('*, counties(county_name, state)')
        .eq('uploaded_by', user?.id)
        .order('upload_date', { ascending: false })
        .limit(10);
      
      if (error) throw error;
      return data;
    },
    enabled: !!user,
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
      case 'Success':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />;
      case 'error':
      case 'Error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-yellow-600" />;
    }
  };

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-ink-900">VA Upload Dashboard</h1>
          <p className="text-ink-600 mt-2">Upload CSVs for your assigned counties</p>
        </div>

        {/* Instructions */}
        <Card className="border-blue-200 bg-blue-50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Upload Instructions
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-ink-700 space-y-2">
            <p>Upload one county at a time. Make sure your CSV has these columns:</p>
            <ul className="list-disc list-inside ml-4 space-y-1">
              <li><strong>address</strong> - Property street address</li>
              <li><strong>city</strong> - City name</li>
              <li><strong>state</strong> - State abbreviation</li>
              <li><strong>zip</strong> - ZIP code</li>
              <li><strong>violation_description</strong> - Description of the violation</li>
              <li><strong>date</strong> - Date of violation</li>
            </ul>
            <p className="text-red-600 font-medium mt-2">⚠️ If file format is wrong, upload will fail.</p>
          </CardContent>
        </Card>

        {/* Assigned Counties */}
        <Card>
          <CardHeader>
            <CardTitle>My Assigned Counties</CardTitle>
            <CardDescription>Counties you can upload data for</CardDescription>
          </CardHeader>
          <CardContent>
            {countiesLoading ? (
              <p className="text-ink-500">Loading counties...</p>
            ) : assignedCounties && assignedCounties.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>County</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>FOIA Status</TableHead>
                    <TableHead>Upload Status</TableHead>
                    <TableHead>Last Upload</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignedCounties.map((county) => (
                    <TableRow key={county.id}>
                      <TableCell className="font-medium">{county.county_name}</TableCell>
                      <TableCell>{county.state}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{county.foia_status || 'N/A'}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={county.upload_status === 'completed' ? 'default' : 'secondary'}>
                          {county.upload_status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {county.last_upload_date 
                          ? new Date(county.last_upload_date).toLocaleDateString()
                          : 'Never'
                        }
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" disabled>
                          <Upload className="h-4 w-4 mr-2" />
                          Upload CSV
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-ink-500 text-center py-8">No counties assigned to you yet.</p>
            )}
          </CardContent>
        </Card>

        {/* Upload History */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Uploads</CardTitle>
            <CardDescription>Your upload history</CardDescription>
          </CardHeader>
          <CardContent>
            {uploadHistory && uploadHistory.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>County</TableHead>
                    <TableHead>File Name</TableHead>
                    <TableHead>Rows</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {uploadHistory.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        {record.counties?.county_name}, {record.counties?.state}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{record.file_name}</TableCell>
                      <TableCell>{record.row_count?.toLocaleString()}</TableCell>
                      <TableCell>{new Date(record.upload_date).toLocaleString()}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(record.status)}
                          <span className="capitalize">{record.status}</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-ink-500 text-center py-8">No upload history yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
