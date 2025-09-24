import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Calendar, Plus, MapPin, Clock, Users, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useProfile } from '@/hooks/use-profile';

interface Meeting {
  id: string;
  title: string;
  type: string;
  job_id?: number;
  client_name?: string;
  date_time: string;
  duration_minutes: number;
  location?: string;
  attendees: string[];
  google_calendar_id?: string;
  notes?: string;
  status: string;
}

const meetingTypes = [
  { value: 'site_inspection', label: 'Site Inspection' },
  { value: 'client_walkthrough', label: 'Client Walkthrough' },
  { value: 'permit_appointment', label: 'Permit Appointment' },
  { value: 'vendor_meeting', label: 'Vendor Meeting' },
  { value: 'team_planning', label: 'Team Planning' },
  { value: 'progress_review', label: 'Progress Review' },
  { value: 'general', label: 'General Meeting' },
];

export function Meetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const { toast } = useToast();
  const { profile } = useProfile();

  const [newMeeting, setNewMeeting] = useState({
    title: '',
    type: 'general',
    job_id: '',
    client_name: '',
    date_time: '',
    duration_minutes: 60,
    location: '',
    attendees: '',
    notes: ''
  });

  useEffect(() => {
    fetchMeetings();
  }, []);

  const fetchMeetings = async () => {
    try {
      const { data, error } = await supabase
        .from('meetings')
        .select('*')
        .order('date_time', { ascending: false });

      if (error) throw error;
      setMeetings(data || []);
    } catch (error: any) {
      toast({
        title: "Error loading meetings",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddMeeting = async () => {
    if (!profile?.org_id) return;

    try {
      const attendeesArray = newMeeting.attendees
        .split(',')
        .map(a => a.trim())
        .filter(a => a.length > 0);

      const { error } = await supabase
        .from('meetings')
        .insert([{
          title: newMeeting.title,
          type: newMeeting.type,
          job_id: newMeeting.job_id ? parseInt(newMeeting.job_id) : null,
          client_name: newMeeting.client_name || null,
          date_time: newMeeting.date_time,
          duration_minutes: newMeeting.duration_minutes,
          location: newMeeting.location || null,
          attendees: attendeesArray,
          notes: newMeeting.notes || null,
          org_id: profile.org_id
        }]);

      if (error) throw error;

      toast({
        title: "Meeting scheduled successfully",
        description: `${newMeeting.title} has been added to your calendar`,
      });

      setIsAddDialogOpen(false);
      setNewMeeting({
        title: '',
        type: 'general',
        job_id: '',
        client_name: '',
        date_time: '',
        duration_minutes: 60,
        location: '',
        attendees: '',
        notes: ''
      });
      fetchMeetings();
    } catch (error: any) {
      toast({
        title: "Error scheduling meeting",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getStatusBadge = (meeting: Meeting) => {
    const now = new Date();
    const meetingDate = new Date(meeting.date_time);
    
    if (meeting.status === 'cancelled') {
      return <Badge variant="destructive">Cancelled</Badge>;
    }
    if (meeting.status === 'completed') {
      return <Badge variant="default">Completed</Badge>;
    }
    if (meetingDate < now) {
      return <Badge variant="secondary">Past</Badge>;
    }
    if (meetingDate.toDateString() === now.toDateString()) {
      return <Badge variant="default">Today</Badge>;
    }
    return <Badge variant="outline">Upcoming</Badge>;
  };

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const upcomingMeetings = meetings.filter(m => {
    const meetingDate = new Date(m.date_time);
    const now = new Date();
    return meetingDate >= now && m.status === 'scheduled';
  }).slice(0, 3);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Meetings</h1>
          <p className="text-muted-foreground mt-2">Loading meetings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">Meetings</h1>
          <p className="text-muted-foreground mt-2">
            Schedule and manage client meetings, site inspections, and team meetings
          </p>
        </div>
        
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center space-x-2">
              <Plus className="h-4 w-4" />
              <span>New Meeting</span>
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Schedule New Meeting</DialogTitle>
              <DialogDescription>
                Create a new meeting and optionally sync with Google Calendar
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Meeting Title</Label>
                <Input
                  id="title"
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="e.g. Client Walkthrough"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="type">Meeting Type</Label>
                <Select value={newMeeting.type} onValueChange={(value) => setNewMeeting(prev => ({ ...prev, type: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {meetingTypes.map(type => (
                      <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="job_id">Job ID (Optional)</Label>
                  <Input
                    id="job_id"
                    value={newMeeting.job_id}
                    onChange={(e) => setNewMeeting(prev => ({ ...prev, job_id: e.target.value }))}
                    placeholder="e.g. 123"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="client_name">Client Name</Label>
                  <Input
                    id="client_name"
                    value={newMeeting.client_name}
                    onChange={(e) => setNewMeeting(prev => ({ ...prev, client_name: e.target.value }))}
                    placeholder="Client name"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="date_time">Date & Time</Label>
                  <Input
                    id="date_time"
                    type="datetime-local"
                    value={newMeeting.date_time}
                    onChange={(e) => setNewMeeting(prev => ({ ...prev, date_time: e.target.value }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration (min)</Label>
                  <Input
                    id="duration"
                    type="number"
                    value={newMeeting.duration_minutes}
                    onChange={(e) => setNewMeeting(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) || 60 }))}
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="location">Location</Label>
                <Input
                  id="location"
                  value={newMeeting.location}
                  onChange={(e) => setNewMeeting(prev => ({ ...prev, location: e.target.value }))}
                  placeholder="Meeting location"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="attendees">Attendees (comma separated)</Label>
                <Input
                  id="attendees"
                  value={newMeeting.attendees}
                  onChange={(e) => setNewMeeting(prev => ({ ...prev, attendees: e.target.value }))}
                  placeholder="john@example.com, jane@example.com"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={newMeeting.notes}
                  onChange={(e) => setNewMeeting(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="Meeting agenda or notes..."
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMeeting} disabled={!newMeeting.title || !newMeeting.date_time}>
                Schedule Meeting
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Upcoming Meetings Dashboard */}
      {upcomingMeetings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Calendar className="h-5 w-5" />
              <span>Upcoming Meetings</span>
            </CardTitle>
            <CardDescription>
              Your next {upcomingMeetings.length} meetings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingMeetings.map((meeting) => {
                const { date, time } = formatDateTime(meeting.date_time);
                const meetingType = meetingTypes.find(t => t.value === meeting.type);
                
                return (
                  <div key={meeting.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-medium">{meeting.title}</div>
                        <div className="text-sm text-muted-foreground">
                          {meetingType?.label} • {date} at {time}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      {meeting.location && (
                        <div className="flex items-center space-x-1 text-sm text-muted-foreground">
                          <MapPin className="h-3 w-3" />
                          <span>{meeting.location}</span>
                        </div>
                      )}
                      {getStatusBadge(meeting)}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* All Meetings Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Meetings</CardTitle>
          <CardDescription>
            {meetings.length} meetings total
          </CardDescription>
        </CardHeader>
        <CardContent>
          {meetings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>No meetings scheduled</p>
              <p className="text-sm">Schedule your first meeting to get started</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Meeting</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Date & Time</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {meetings.map((meeting) => {
                    const { date, time } = formatDateTime(meeting.date_time);
                    const meetingType = meetingTypes.find(t => t.value === meeting.type);
                    
                    return (
                      <TableRow key={meeting.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{meeting.title}</div>
                            {meeting.client_name && (
                              <div className="text-sm text-muted-foreground">
                                {meeting.client_name}
                                {meeting.job_id && ` • Job #${meeting.job_id}`}
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{meetingType?.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div>{date}</div>
                            <div className="text-sm text-muted-foreground">{time}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-1">
                            <Clock className="h-3 w-3" />
                            <span>{meeting.duration_minutes}m</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          {meeting.location ? (
                            <div className="flex items-center space-x-1">
                              <MapPin className="h-3 w-3" />
                              <span className="text-sm">{meeting.location}</span>
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell>{getStatusBadge(meeting)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" className="flex items-center space-x-1">
                            <ExternalLink className="h-3 w-3" />
                            <span>View</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}