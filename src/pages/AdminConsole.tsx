import { useState, useEffect, useCallback } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { StatsCardSkeleton, TableRowSkeleton, CardSkeleton } from "@/components/ui/loading-skeleton";
import { toast } from "sonner";
import { formatRelativeTime, formatTimestamp } from "@/utils/dateHelpers";
import * as AdminAPI from "@/services/adminApi";
import { 
  Users, 
  Upload, 
  MapPin, 
  TrendingUp, 
  AlertCircle, 
  Clock, 
  CheckCircle2,
  RefreshCw,
  FileText,
  Building2,
  Activity,
  UserPlus,
  Plus
} from "lucide-react";

type Tab = "overview" | "uploads" | "users" | "jurisdictions" | "logs";

const REFRESH_INTERVAL = 30000; // 30 seconds
const USE_MOCK_DATA = true; // Toggle this to switch between mock and real API

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    setLastUpdated(new Date());
    // Trigger refresh in child components via state update
    setTimeout(() => setIsRefreshing(false), 1000);
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, []);

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-7xl space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">Admin Console</h1>
            <p className="text-muted-foreground mt-2">
              Control room for system operations and data management
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">
              Last updated: {formatRelativeTime(lastUpdated.toISOString())}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b border-border pb-2">
          <Button
            variant={activeTab === "overview" ? "default" : "ghost"}
            onClick={() => setActiveTab("overview")}
          >
            System Overview
          </Button>
          <Button
            variant={activeTab === "uploads" ? "default" : "ghost"}
            onClick={() => setActiveTab("uploads")}
          >
            Upload Jobs
          </Button>
          <Button
            variant={activeTab === "users" ? "default" : "ghost"}
            onClick={() => setActiveTab("users")}
          >
            User Management
          </Button>
          <Button
            variant={activeTab === "jurisdictions" ? "default" : "ghost"}
            onClick={() => setActiveTab("jurisdictions")}
          >
            Jurisdictions
          </Button>
          <Button
            variant={activeTab === "logs" ? "default" : "ghost"}
            onClick={() => setActiveTab("logs")}
          >
            System Logs
          </Button>
        </div>

        {/* Tab Content */}
        {activeTab === "overview" && <SystemOverviewTab onSwitchTab={setActiveTab} refreshTrigger={lastUpdated} />}
        {activeTab === "uploads" && <UploadJobsTab refreshTrigger={lastUpdated} />}
        {activeTab === "users" && <UserManagementTab refreshTrigger={lastUpdated} />}
        {activeTab === "jurisdictions" && <JurisdictionsTab refreshTrigger={lastUpdated} />}
        {activeTab === "logs" && <SystemLogsTab refreshTrigger={lastUpdated} />}
      </div>
    </AppLayout>
  );
}

// System Overview Tab
function SystemOverviewTab({ 
  onSwitchTab, 
  refreshTrigger 
}: { 
  onSwitchTab: (tab: Tab) => void;
  refreshTrigger: Date;
}) {
  const [stats, setStats] = useState<AdminAPI.AdminStats | null>(null);
  const [geocoding, setGeocoding] = useState<AdminAPI.GeocodingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (USE_MOCK_DATA) {
      // Use mock data
      setStats({
        totalLeads: 45892,
        leadsToday: 234,
        todayTrend: "+12%",
        leads7Days: 1823,
        leads30Days: 8934,
        activeJurisdictions: 47,
        uploads24h: 12,
        activeUsers: 4,
        geocodingQueued: 156,
        geocodingRunning: 23,
        geocodingCompleted: 45713,
        geocodingPercent: 99.2,
        failedUploads: 3,
        failedGeocodes: 89,
        stuckJobs: 1,
      });
      setGeocoding({
        queued: 156,
        running: 23,
        completed: 45713,
        coverage: 99.2,
      });
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [statsData, geocodingData] = await Promise.all([
        AdminAPI.fetchAdminStats(),
        AdminAPI.fetchGeocodingStatus(),
      ]);
      setStats(statsData);
      setGeocoding(geocodingData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      toast.error('Failed to load system overview');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <p className="font-semibold">Failed to load data</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || !stats || !geocoding) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <StatsCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Building2 className="h-5 w-5" />}
          label="Total Leads"
          value={stats.totalLeads.toLocaleString()}
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Leads Today"
          value={stats.leadsToday.toLocaleString()}
          subtext={stats.todayTrend}
          subtextColor="text-green-600"
        />
        <StatCard
          icon={<MapPin className="h-5 w-5" />}
          label="Active Jurisdictions"
          value={stats.activeJurisdictions.toString()}
        />
        <StatCard
          icon={<Upload className="h-5 w-5" />}
          label="Uploads (24h)"
          value={stats.uploads24h.toString()}
          onClick={() => onSwitchTab("uploads")}
          clickable
        />
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Leads (7 days)"
          value={stats.leads7Days.toLocaleString()}
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Leads (30 days)"
          value={stats.leads30Days.toLocaleString()}
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Active Users"
          value={stats.activeUsers.toString()}
          onClick={() => onSwitchTab("users")}
          clickable
        />
      </div>

      {/* Geocoding Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Geocoding Status
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Queued</p>
              <p className="text-2xl font-bold">{geocoding.queued}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Running</p>
              <p className="text-2xl font-bold">{geocoding.running}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{geocoding.completed.toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Coverage</p>
              <p className="text-2xl font-bold text-green-600">{geocoding.coverage}%</p>
            </div>
          </div>
          <div>
            <Progress value={geocoding.coverage} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* Error Summary Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Error Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div
              className="p-4 bg-red-100 dark:bg-red-900/20 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSwitchTab("logs")}
            >
              <p className="text-sm text-red-800 dark:text-red-200">Failed Uploads</p>
              <p className="text-3xl font-bold text-red-900 dark:text-red-100">{stats.failedUploads}</p>
            </div>
            <div
              className="p-4 bg-orange-100 dark:bg-orange-900/20 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSwitchTab("logs")}
            >
              <p className="text-sm text-orange-800 dark:text-orange-200">Failed Geocodes</p>
              <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">{stats.failedGeocodes}</p>
            </div>
            <div
              className="p-4 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSwitchTab("logs")}
            >
              <p className="text-sm text-yellow-800 dark:text-yellow-200">Stuck Jobs</p>
              <p className="text-3xl font-bold text-yellow-900 dark:text-yellow-100">{stats.stuckJobs}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Upload Jobs Tab
function UploadJobsTab({ refreshTrigger }: { refreshTrigger: Date }) {
  const [uploads, setUploads] = useState<AdminAPI.Upload[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [retrying, setRetrying] = useState<string | null>(null);

  const mockUploads = [
    {
      timestamp: "2025-11-23 14:32",
      file: "baldwin_code_violations.csv",
      user: "VA_Sarah",
      jurisdiction: "Baldwin County AL",
      rows: { saved: 390, total: 390, errors: 0 },
      status: "Done",
      time: "2.3s",
    },
    {
      timestamp: "2025-11-23 13:18",
      file: "mobile_permits.csv",
      user: "VA_Mike",
      jurisdiction: "Mobile County AL",
      rows: { saved: 542, total: 567, errors: 25 },
      status: "Done",
      time: "4.1s",
    },
    {
      timestamp: "2025-11-23 11:05",
      file: "jefferson_data.csv",
      user: "VA_Sarah",
      jurisdiction: "Jefferson County AL",
      rows: { saved: 0, total: 1203, errors: 1203 },
      status: "Failed",
      time: "0.8s",
    },
    {
      timestamp: "2025-11-23 09:42",
      file: "shelby_violations.csv",
      user: "Admin",
      jurisdiction: "Shelby County AL",
      rows: { saved: 789, total: 789, errors: 0 },
      status: "Done",
      time: "3.2s",
    },
    {
      timestamp: "2025-11-23 08:15",
      file: "tuscaloosa_code.csv",
      user: "VA_Mike",
      jurisdiction: "Tuscaloosa County AL",
      rows: { saved: 445, total: 445, errors: 0 },
      status: "Processing",
      time: "-",
    },
  ];

  const fetchData = useCallback(async () => {
    if (USE_MOCK_DATA) {
      setUploads(mockUploads.map(u => ({
        id: u.file,
        timestamp: u.timestamp,
        fileName: u.file,
        uploadedBy: u.user,
        jurisdiction: u.jurisdiction,
        totalRows: u.rows.total,
        savedRows: u.rows.saved,
        status: u.status.toLowerCase() as 'done' | 'failed' | 'processing',
        processingTime: u.time,
        errorCount: u.rows.errors,
      })));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const filters: any = {};
      if (statusFilter !== 'all') filters.status = statusFilter;
      if (userFilter !== 'all') filters.user = userFilter;
      
      const data = await AdminAPI.fetchUploads(filters);
      setUploads(data.uploads);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch uploads');
      toast.error('Failed to load uploads');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, userFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleRetry = async (uploadId: string) => {
    try {
      setRetrying(uploadId);
      await AdminAPI.retryUpload(uploadId);
      toast.success('Upload retry initiated');
      fetchData();
    } catch (err) {
      toast.error('Failed to retry upload');
    } finally {
      setRetrying(null);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <p className="font-semibold">Failed to load uploads</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Upload Jobs</h2>
        <div className="flex gap-2">
          <select 
            className="px-3 py-2 border border-border rounded-md bg-background"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
            <option value="processing">Processing</option>
          </select>
          <select 
            className="px-3 py-2 border border-border rounded-md bg-background"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          >
            <option value="all">All Users</option>
            <option value="VA_Sarah">VA_Sarah</option>
            <option value="VA_Mike">VA_Mike</option>
            <option value="Admin">Admin</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 font-medium">Timestamp</th>
                <th className="text-left p-4 font-medium">File</th>
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Jurisdiction</th>
                <th className="text-left p-4 font-medium">Rows</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Time</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRowSkeleton key={i} />
                  ))}
                </>
              ) : uploads.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No uploads found
                  </td>
                </tr>
              ) : (
                uploads.map((upload, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="p-4 text-sm">{formatTimestamp(upload.timestamp)}</td>
                    <td className="p-4">
                      <button className="text-sm text-blue-600 hover:underline">{upload.fileName}</button>
                    </td>
                    <td className="p-4 text-sm">{upload.uploadedBy}</td>
                    <td className="p-4 text-sm">{upload.jurisdiction}</td>
                    <td className="p-4 text-sm">
                      {upload.savedRows}/{upload.totalRows}
                      {upload.errorCount > 0 && (
                        <span className="text-red-600"> ({upload.errorCount} errors)</span>
                      )}
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={
                          upload.status === "done"
                            ? "default"
                            : upload.status === "failed"
                            ? "destructive"
                            : "secondary"
                        }
                        className={
                          upload.status === "done"
                            ? "bg-green-600"
                            : upload.status === "processing"
                            ? "bg-blue-600"
                            : ""
                        }
                      >
                        {upload.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm">{upload.processingTime}</td>
                    <td className="p-4">
                      {upload.status === "failed" && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleRetry(upload.id)}
                          disabled={retrying === upload.id}
                        >
                          <RefreshCw className={`h-3 w-3 mr-1 ${retrying === upload.id ? 'animate-spin' : ''}`} />
                          Retry
                        </Button>
                      )}
                      {upload.status === "done" && (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// User Management Tab
function UserManagementTab({ refreshTrigger }: { refreshTrigger: Date }) {
  const [users, setUsers] = useState<AdminAPI.User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState<string | null>(null);

  const mockUsers = [
    {
      name: "Sarah Johnson",
      email: "sarah@snap.com",
      role: "VA",
      status: "Active",
      lastLogin: "2 hours ago",
      uploads: 847,
      activity: 23,
    },
    {
      name: "Mike Chen",
      email: "mike@snap.com",
      role: "VA",
      status: "Active",
      lastLogin: "4 hours ago",
      uploads: 623,
      activity: 18,
    },
    {
      name: "Admin User",
      email: "admin@snap.com",
      role: "Admin",
      status: "Active",
      lastLogin: "1 hour ago",
      uploads: 234,
      activity: 5,
    },
    {
      name: "Jane Operator",
      email: "jane@snap.com",
      role: "Operator",
      status: "Active",
      lastLogin: "1 day ago",
      uploads: 156,
      activity: 12,
    },
    {
      name: "Test VA",
      email: "test@snap.com",
      role: "VA",
      status: "Invited",
      lastLogin: "Never",
      uploads: 0,
      activity: 0,
    },
  ];

  const fetchData = useCallback(async () => {
    if (USE_MOCK_DATA) {
      setUsers(mockUsers.map(u => ({
        id: u.email,
        name: u.name,
        email: u.email,
        role: u.role as 'Admin' | 'VA' | 'Operator',
        status: u.status as 'Active' | 'Invited',
        lastLogin: u.lastLogin === 'Never' ? new Date(0).toISOString() : new Date().toISOString(),
        totalUploads: u.uploads,
        uploads7Days: u.activity,
      })));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await AdminAPI.fetchUsers();
      setUsers(data.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleDisable = async (userId: string) => {
    try {
      setDisabling(userId);
      await AdminAPI.disableUser(userId);
      toast.success('User disabled successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to disable user');
    } finally {
      setDisabling(null);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <p className="font-semibold">Failed to load users</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">User Management</h2>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <UserPlus className="h-4 w-4 mr-2" />
          Invite User
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Role</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Last Login</th>
                <th className="text-left p-4 font-medium">Uploads</th>
                <th className="text-left p-4 font-medium">7d Activity</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  {[1, 2, 3, 4, 5].map((i) => (
                    <TableRowSkeleton key={i} />
                  ))}
                </>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                users.map((user, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="p-4">
                      <div>
                        <p className="font-medium">{user.name}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge
                        className={
                          user.role === "Admin"
                            ? "bg-purple-600"
                            : user.role === "VA"
                            ? "bg-blue-600"
                            : "bg-green-600"
                        }
                      >
                        {user.role}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <Badge
                        variant={user.status === "Active" ? "default" : "secondary"}
                        className={user.status === "Active" ? "bg-green-600" : "bg-gray-500"}
                      >
                        {user.status}
                      </Badge>
                    </td>
                    <td className="p-4 text-sm">{formatRelativeTime(user.lastLogin)}</td>
                    <td className="p-4 text-sm">{user.totalUploads}</td>
                    <td className="p-4 text-sm">{user.uploads7Days}</td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button 
                          className="text-sm text-blue-600 hover:underline"
                          onClick={() => toast.info('Edit functionality coming soon')}
                        >
                          Edit
                        </button>
                        <button 
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => handleDisable(user.id)}
                          disabled={disabling === user.id}
                        >
                          {disabling === user.id ? 'Disabling...' : 'Disable'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Jurisdictions Tab
function JurisdictionsTab({ refreshTrigger }: { refreshTrigger: Date }) {
  const [jurisdictions, setJurisdictions] = useState<AdminAPI.Jurisdiction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deactivating, setDeactivating] = useState<string | null>(null);

  const mockJurisdictions = [
    {
      name: "Baldwin County Code Violations",
      location: "Baldwin AL",
      source: "FOIA CSV",
      lastUpload: "2 hours ago",
      active: 390,
      total: 1247,
      flag: "High-value",
      flagColor: "bg-purple-600",
    },
    {
      name: "Mobile County Permits",
      location: "Mobile AL",
      source: "Portal Scrape",
      lastUpload: "3 hours ago",
      active: 542,
      total: 2891,
      flag: "Investor-facing",
      flagColor: "bg-green-600",
    },
    {
      name: "Jefferson County Violations",
      location: "Birmingham AL",
      source: "FOIA CSV",
      lastUpload: "5 hours ago",
      active: 0,
      total: 3456,
      flag: "Needs data",
      flagColor: "bg-yellow-600",
    },
    {
      name: "Shelby County Code Enforcement",
      location: "Shelby AL",
      source: "Manual",
      lastUpload: "6 hours ago",
      active: 789,
      total: 1834,
      flag: "Internal-only",
      flagColor: "bg-blue-600",
    },
  ];

  const fetchData = useCallback(async () => {
    if (USE_MOCK_DATA) {
      setJurisdictions(mockJurisdictions.map(j => ({
        id: j.name,
        name: j.name,
        location: j.location,
        source: j.source,
        lastUpload: new Date().toISOString(),
        activeCount: j.active,
        totalCount: j.total,
        flag: j.flag,
        flagColor: j.flagColor,
      })));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const data = await AdminAPI.fetchJurisdictions();
      setJurisdictions(data.jurisdictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch jurisdictions');
      toast.error('Failed to load jurisdictions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleDeactivate = async (jurisdictionId: string) => {
    try {
      setDeactivating(jurisdictionId);
      await AdminAPI.deactivateJurisdiction(jurisdictionId);
      toast.success('Jurisdiction deactivated successfully');
      fetchData();
    } catch (err) {
      toast.error('Failed to deactivate jurisdiction');
    } finally {
      setDeactivating(null);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <p className="font-semibold">Failed to load jurisdictions</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Jurisdiction Management</h2>
        <Button className="bg-blue-600 hover:bg-blue-700">
          <Plus className="h-4 w-4 mr-2" />
          Add Jurisdiction
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 font-medium">Name</th>
                <th className="text-left p-4 font-medium">Location</th>
                <th className="text-left p-4 font-medium">Source</th>
                <th className="text-left p-4 font-medium">Last Upload</th>
                <th className="text-left p-4 font-medium">Active</th>
                <th className="text-left p-4 font-medium">Total</th>
                <th className="text-left p-4 font-medium">Flag</th>
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <>
                  {[1, 2, 3, 4].map((i) => (
                    <TableRowSkeleton key={i} />
                  ))}
                </>
              ) : jurisdictions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-muted-foreground">
                    No jurisdictions found
                  </td>
                </tr>
              ) : (
                jurisdictions.map((jurisdiction, idx) => (
                  <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
                    <td className="p-4 font-medium">{jurisdiction.name}</td>
                    <td className="p-4 text-sm">{jurisdiction.location}</td>
                    <td className="p-4 text-sm">{jurisdiction.source}</td>
                    <td className="p-4 text-sm">{formatRelativeTime(jurisdiction.lastUpload)}</td>
                    <td className="p-4 text-sm">{jurisdiction.activeCount}</td>
                    <td className="p-4 text-sm">{jurisdiction.totalCount}</td>
                    <td className="p-4">
                      <Badge className={jurisdiction.flagColor}>{jurisdiction.flag}</Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2">
                        <button 
                          className="text-sm text-blue-600 hover:underline"
                          onClick={() => toast.info('Edit functionality coming soon')}
                        >
                          Edit
                        </button>
                        <button 
                          className="text-sm text-red-600 hover:underline"
                          onClick={() => handleDeactivate(jurisdiction.id)}
                          disabled={deactivating === jurisdiction.id}
                        >
                          {deactivating === jurisdiction.id ? 'Deactivating...' : 'Deactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// System Logs Tab
function SystemLogsTab({ refreshTrigger }: { refreshTrigger: Date }) {
  const [logs, setLogs] = useState<AdminAPI.SystemLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [retryingGeocodes, setRetryingGeocodes] = useState(false);

  const mockLogs = [
    {
      time: "2 min ago",
      type: "Geocoding",
      message: "Failed to geocode address: '0 JACKSON LN'",
      jobId: "JOB-2891",
    },
    {
      time: "15 min ago",
      type: "Upload",
      message: "CSV parsing error: Invalid column format",
      jobId: "JOB-2890",
    },
    {
      time: "1 hour ago",
      type: "System",
      message: "Database connection timeout",
      jobId: "SYSTEM",
    },
    {
      time: "2 hours ago",
      type: "Geocoding",
      message: "Rate limit exceeded for geocoding API",
      jobId: "JOB-2889",
    },
  ];

  const fetchData = useCallback(async () => {
    if (USE_MOCK_DATA) {
      setLogs(mockLogs.map(l => ({
        id: l.jobId,
        time: new Date().toISOString(),
        type: l.type as 'Geocoding' | 'Upload' | 'System',
        message: l.message,
        jobId: l.jobId,
      })));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const filters: any = {};
      if (typeFilter !== 'all') filters.type = typeFilter;
      
      const data = await AdminAPI.fetchSystemLogs(filters);
      setLogs(data.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch logs');
      toast.error('Failed to load system logs');
    } finally {
      setLoading(false);
    }
  }, [typeFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshTrigger]);

  const handleRetryFailedGeocodes = async () => {
    try {
      setRetryingGeocodes(true);
      await AdminAPI.retryFailedGeocodes();
      toast.success('Failed geocodes retry initiated');
      fetchData();
    } catch (err) {
      toast.error('Failed to retry geocodes');
    } finally {
      setRetryingGeocodes(false);
    }
  };

  if (error) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <AlertCircle className="h-12 w-12 text-destructive mx-auto" />
            <div>
              <p className="font-semibold">Failed to load logs</p>
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
            <Button onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">System Logs & Errors</h2>
        <div className="flex gap-2">
          <Button 
            className="bg-blue-600 hover:bg-blue-700"
            onClick={handleRetryFailedGeocodes}
            disabled={retryingGeocodes}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${retryingGeocodes ? 'animate-spin' : ''}`} />
            Retry Failed Geocodes
          </Button>
          <select 
            className="px-3 py-2 border border-border rounded-md bg-background"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
          >
            <option value="all">All Types</option>
            <option value="Geocoding">Geocoding</option>
            <option value="Upload">Upload</option>
            <option value="System">System</option>
          </select>
        </div>
      </div>

      {/* Log Entries */}
      <div className="space-y-4">
        {loading ? (
          <>
            {[1, 2, 3, 4].map((i) => (
              <CardSkeleton key={i} />
            ))}
          </>
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              No logs found
            </CardContent>
          </Card>
        ) : (
          logs.map((log, idx) => (
            <Card key={idx}>
              <CardContent className="p-6">
                <div className="flex gap-4">
                  <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-1" />
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-2">
                      <Badge variant="secondary">{log.type}</Badge>
                      <span className="text-sm text-muted-foreground">{formatRelativeTime(log.time)}</span>
                    </div>
                    <p className="text-sm mb-2">{log.message}</p>
                    <p className="text-xs text-muted-foreground mb-3">{log.jobId}</p>
                    <div className="flex gap-3">
                      <button 
                        className="text-sm text-blue-600 hover:underline"
                        onClick={() => toast.info('View details functionality coming soon')}
                      >
                        View Details
                      </button>
                      <button 
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                        onClick={() => toast.info('Individual retry functionality coming soon')}
                      >
                        <RefreshCw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// StatCard Component
function StatCard({
  icon,
  label,
  value,
  subtext,
  subtextColor,
  onClick,
  clickable,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  subtext?: string;
  subtextColor?: string;
  onClick?: () => void;
  clickable?: boolean;
}) {
  return (
    <Card
      className={clickable ? "cursor-pointer hover:shadow-lg transition-shadow" : ""}
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="p-2 rounded-lg bg-primary/10 text-primary">{icon}</div>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
        <div className="flex items-end justify-between">
          <p className="text-3xl font-bold">{value}</p>
          {subtext && <p className={`text-sm font-medium ${subtextColor}`}>{subtext}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
