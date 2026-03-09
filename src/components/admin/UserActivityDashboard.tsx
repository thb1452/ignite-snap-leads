import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { formatDistanceToNow, parseISO } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye, LogIn, Heart, List, Download, Filter, Upload, Search, UserPlus, Activity,
} from "lucide-react";

const ACTION_CONFIG: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  page_view:        { label: "Page View",       icon: Eye,      color: "bg-muted text-muted-foreground" },
  login:            { label: "Login",            icon: LogIn,    color: "bg-green-500/10 text-green-600" },
  signup:           { label: "Signup",           icon: UserPlus, color: "bg-primary/10 text-primary" },
  property_viewed:  { label: "Property Viewed",  icon: Eye,      color: "bg-blue-500/10 text-blue-600" },
  property_saved:   { label: "Property Saved",   icon: Heart,    color: "bg-red-500/10 text-red-600" },
  property_unsaved: { label: "Property Unsaved", icon: Heart,    color: "bg-muted text-muted-foreground" },
  list_created:     { label: "List Created",     icon: List,     color: "bg-purple-500/10 text-purple-600" },
  list_deleted:     { label: "List Deleted",     icon: List,     color: "bg-muted text-muted-foreground" },
  export_csv:       { label: "CSV Export",       icon: Download, color: "bg-amber-500/10 text-amber-600" },
  filter_used:      { label: "Filter Used",      icon: Filter,   color: "bg-muted text-muted-foreground" },
  upload_started:   { label: "Upload Started",   icon: Upload,   color: "bg-blue-500/10 text-blue-600" },
  upload_completed: { label: "Upload Complete",  icon: Upload,   color: "bg-green-500/10 text-green-600" },
  search:           { label: "Search",           icon: Search,   color: "bg-muted text-muted-foreground" },
};

interface ActivityRow {
  id: string;
  user_id: string;
  action: string;
  metadata: Record<string, unknown> | null;
  page_path: string | null;
  created_at: string;
  user_email?: string;
}

export function UserActivityDashboard() {
  const { data: activities = [], isLoading } = useQuery<ActivityRow[]>({
    queryKey: ["admin-user-activity"],
    queryFn: async () => {
      // Read from user_activity_log — admin-only via RLS
      const { data, error } = await (supabase as any)
        .from("user_activity_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);

      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 15_000, // refresh every 15s
  });

  // Get unique user IDs for email lookup
  const userIds = [...new Set(activities.map((a: ActivityRow) => a.user_id))];

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-activity-profiles", userIds],
    queryFn: async () => {
      if (userIds.length === 0) return [];
      const { data } = await supabase
        .from("profiles")
        .select("user_id, email, full_name")
        .in("user_id", userIds);
      return data ?? [];
    },
    enabled: userIds.length > 0,
  });

  const profileMap = new Map(
    profiles.map((p: any) => [p.user_id, { email: p.email, name: p.full_name }])
  );

  // Stats
  const uniqueUsers = new Set(activities.map((a: ActivityRow) => a.user_id)).size;
  const last24h = activities.filter(
    (a: ActivityRow) => new Date(a.created_at) > new Date(Date.now() - 86400000)
  ).length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Events</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{activities.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Last 24h</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{last24h}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Unique Users</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{uniqueUsers}</p>
          </CardContent>
        </Card>
      </div>

      {/* Activity feed */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Live User Activity
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px]">
            <div className="divide-y divide-border">
              {activities.length === 0 && (
                <p className="p-6 text-sm text-muted-foreground text-center">
                  No activity recorded yet. Events will appear as users interact with the app.
                </p>
              )}
              {activities.map((activity: ActivityRow) => {
                const config = ACTION_CONFIG[activity.action] ?? {
                  label: activity.action,
                  icon: Eye,
                  color: "bg-muted text-muted-foreground",
                };
                const Icon = config.icon;
                const profile = profileMap.get(activity.user_id);
                let timeAgo = "";
                try {
                  timeAgo = formatDistanceToNow(parseISO(activity.created_at), { addSuffix: true });
                } catch {}

                return (
                  <div
                    key={activity.id}
                    className="px-6 py-3 flex items-center gap-3 hover:bg-muted/30 transition-colors"
                  >
                    <div className={`p-2 rounded-lg ${config.color}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {profile?.name || profile?.email || activity.user_id.slice(0, 8)}
                        <span className="text-muted-foreground font-normal ml-2">
                          {config.label}
                        </span>
                      </p>
                      {activity.page_path && (
                        <p className="text-xs text-muted-foreground truncate">
                          {activity.page_path}
                        </p>
                      )}
                      {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                        <p className="text-xs text-muted-foreground truncate">
                          {JSON.stringify(activity.metadata)}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                      {timeAgo}
                    </span>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
