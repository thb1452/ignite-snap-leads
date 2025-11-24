import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  return (
    <AppLayout>
      <div className="container mx-auto py-8 px-4 max-w-7xl space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold">Admin Console</h1>
          <p className="text-muted-foreground mt-2">
            Control room for system operations and data management
          </p>
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
        {activeTab === "overview" && <SystemOverviewTab onSwitchTab={setActiveTab} />}
        {activeTab === "uploads" && <UploadJobsTab />}
        {activeTab === "users" && <UserManagementTab />}
        {activeTab === "jurisdictions" && <JurisdictionsTab />}
        {activeTab === "logs" && <SystemLogsTab />}
      </div>
    </AppLayout>
  );
}

// System Overview Tab
function SystemOverviewTab({ onSwitchTab }: { onSwitchTab: (tab: Tab) => void }) {
  return (
    <div className="space-y-6">
      {/* Top Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          icon={<Building2 className="h-5 w-5" />}
          label="Total Leads"
          value="45,892"
        />
        <StatCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="Leads Today"
          value="234"
          subtext="+12%"
          subtextColor="text-green-600"
        />
        <StatCard
          icon={<MapPin className="h-5 w-5" />}
          label="Active Jurisdictions"
          value="47"
        />
        <StatCard
          icon={<Upload className="h-5 w-5" />}
          label="Uploads (24h)"
          value="12"
          onClick={() => onSwitchTab("uploads")}
          clickable
        />
      </div>

      {/* Second Row Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Leads (7 days)"
          value="1,823"
        />
        <StatCard
          icon={<Activity className="h-5 w-5" />}
          label="Leads (30 days)"
          value="8,934"
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="Active Users"
          value="4"
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
              <p className="text-2xl font-bold">156</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Running</p>
              <p className="text-2xl font-bold">23</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">45,713</p>
            </div>
            <div className="text-center">
              <p className="text-sm text-muted-foreground">Coverage</p>
              <p className="text-2xl font-bold text-green-600">99.2%</p>
            </div>
          </div>
          <div>
            <Progress value={99.2} className="h-2" />
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
              <p className="text-3xl font-bold text-red-900 dark:text-red-100">3</p>
            </div>
            <div
              className="p-4 bg-orange-100 dark:bg-orange-900/20 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSwitchTab("logs")}
            >
              <p className="text-sm text-orange-800 dark:text-orange-200">Failed Geocodes</p>
              <p className="text-3xl font-bold text-orange-900 dark:text-orange-100">89</p>
            </div>
            <div
              className="p-4 bg-yellow-100 dark:bg-yellow-900/20 rounded-lg cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => onSwitchTab("logs")}
            >
              <p className="text-sm text-yellow-800 dark:text-yellow-200">Stuck Jobs</p>
              <p className="text-3xl font-bold text-yellow-900 dark:text-yellow-100">1</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Upload Jobs Tab
function UploadJobsTab() {
  const uploads = [
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Upload Jobs</h2>
        <div className="flex gap-2">
          <select className="px-3 py-2 border border-border rounded-md bg-background">
            <option>All Status</option>
            <option>Done</option>
            <option>Failed</option>
            <option>Processing</option>
          </select>
          <select className="px-3 py-2 border border-border rounded-md bg-background">
            <option>All Users</option>
            <option>VA_Sarah</option>
            <option>VA_Mike</option>
            <option>Admin</option>
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
              {uploads.map((upload, idx) => (
                <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="p-4 text-sm">{upload.timestamp}</td>
                  <td className="p-4">
                    <button className="text-sm text-blue-600 hover:underline">{upload.file}</button>
                  </td>
                  <td className="p-4 text-sm">{upload.user}</td>
                  <td className="p-4 text-sm">{upload.jurisdiction}</td>
                  <td className="p-4 text-sm">
                    {upload.rows.saved}/{upload.rows.total}
                    {upload.rows.errors > 0 && (
                      <span className="text-red-600"> ({upload.rows.errors} errors)</span>
                    )}
                  </td>
                  <td className="p-4">
                    <Badge
                      variant={
                        upload.status === "Done"
                          ? "default"
                          : upload.status === "Failed"
                          ? "destructive"
                          : "secondary"
                      }
                      className={
                        upload.status === "Done"
                          ? "bg-green-600"
                          : upload.status === "Processing"
                          ? "bg-blue-600"
                          : ""
                      }
                    >
                      {upload.status}
                    </Badge>
                  </td>
                  <td className="p-4 text-sm">{upload.time}</td>
                  <td className="p-4">
                    {upload.status === "Failed" && (
                      <Button size="sm" variant="outline">
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry
                      </Button>
                    )}
                    {upload.status === "Done" && (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// User Management Tab
function UserManagementTab() {
  const users = [
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
              {users.map((user, idx) => (
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
                  <td className="p-4 text-sm">{user.lastLogin}</td>
                  <td className="p-4 text-sm">{user.uploads}</td>
                  <td className="p-4 text-sm">{user.activity}</td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button className="text-sm text-blue-600 hover:underline">Edit</button>
                      <button className="text-sm text-red-600 hover:underline">Disable</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// Jurisdictions Tab
function JurisdictionsTab() {
  const jurisdictions = [
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
              {jurisdictions.map((jurisdiction, idx) => (
                <tr key={idx} className="border-b border-border hover:bg-muted/50 transition-colors">
                  <td className="p-4 font-medium">{jurisdiction.name}</td>
                  <td className="p-4 text-sm">{jurisdiction.location}</td>
                  <td className="p-4 text-sm">{jurisdiction.source}</td>
                  <td className="p-4 text-sm">{jurisdiction.lastUpload}</td>
                  <td className="p-4 text-sm">{jurisdiction.active}</td>
                  <td className="p-4 text-sm">{jurisdiction.total}</td>
                  <td className="p-4">
                    <Badge className={jurisdiction.flagColor}>{jurisdiction.flag}</Badge>
                  </td>
                  <td className="p-4">
                    <div className="flex gap-2">
                      <button className="text-sm text-blue-600 hover:underline">Edit</button>
                      <button className="text-sm text-red-600 hover:underline">Deactivate</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// System Logs Tab
function SystemLogsTab() {
  const logs = [
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">System Logs & Errors</h2>
        <div className="flex gap-2">
          <Button className="bg-blue-600 hover:bg-blue-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Failed Geocodes
          </Button>
          <select className="px-3 py-2 border border-border rounded-md bg-background">
            <option>All Types</option>
            <option>Geocoding</option>
            <option>Upload</option>
            <option>System</option>
          </select>
        </div>
      </div>

      {/* Log Entries */}
      <div className="space-y-4">
        {logs.map((log, idx) => (
          <Card key={idx}>
            <CardContent className="p-6">
              <div className="flex gap-4">
                <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <Badge variant="secondary">{log.type}</Badge>
                    <span className="text-sm text-muted-foreground">{log.time}</span>
                  </div>
                  <p className="text-sm mb-2">{log.message}</p>
                  <p className="text-xs text-muted-foreground mb-3">{log.jobId}</p>
                  <div className="flex gap-3">
                    <button className="text-sm text-blue-600 hover:underline">View Details</button>
                    <button className="text-sm text-blue-600 hover:underline flex items-center gap-1">
                      <RefreshCw className="h-3 w-3" />
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
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
