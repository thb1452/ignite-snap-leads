import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Mail, ListChecks, Zap, TrendingUp, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { IntelligenceDashboard } from "@/components/intelligence/IntelligenceDashboard";
import { BatchRescoreButton } from "@/components/intelligence/BatchRescoreButton";
import { useDashboardStats } from "@/hooks/useIntelligenceDashboard";

export default function Index() {
  const navigate = useNavigate();
  const { data: dashboardStats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  
  const [extraStats, setExtraStats] = useState({
    tracedLeads: 0,
    activeLists: 0,
    outreachToday: 0,
  });
  const [extraLoading, setExtraLoading] = useState(true);

  useEffect(() => {
    fetchExtraStats();
    // Safety timeout - if loading takes more than 10s, stop loading
    const timeout = setTimeout(() => {
      setExtraLoading(false);
    }, 10000);
    return () => clearTimeout(timeout);
  }, []);

  const fetchExtraStats = async () => {
    try {
      setExtraLoading(true);

      // Traced leads (count distinct properties with contacts) - use count
      const { count: tracedLeads, error: tracedError } = await supabase
        .from("property_contacts")
        .select("property_id", { count: "exact", head: true });

      if (tracedError) console.error("Error fetching traced leads:", tracedError);

      // Active lists
      const { count: activeLists, error: listsError } = await supabase
        .from("lead_lists")
        .select("*", { count: "exact", head: true });

      if (listsError) console.error("Error fetching active lists:", listsError);

      // Outreach today
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: outreachToday, error: outreachError } = await supabase
        .from("lead_activity")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today.toISOString());

      if (outreachError) console.error("Error fetching outreach:", outreachError);

      setExtraStats({
        tracedLeads: tracedLeads ?? 0,
        activeLists: activeLists ?? 0,
        outreachToday: outreachToday ?? 0,
      });
    } catch (error) {
      console.error("Error fetching extra stats:", error);
    } finally {
      setExtraLoading(false);
    }
  };

  // Don't block on errors - show the page with available data
  const loading = (statsLoading && !statsError) || extraLoading;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand" />
      </div>
    );
  }

  const stats = {
    totalLeads: dashboardStats?.total_leads ?? 0,
    hotLeads: dashboardStats?.hot_leads ?? 0,
    tracedLeads: extraStats.tracedLeads,
    activeLists: extraStats.activeLists,
    outreachToday: extraStats.outreachToday,
    avgDaysOpen: 0, // This would need a separate efficient query if needed
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 mb-2">Dashboard</h1>
        <p className="text-ink-400">Your lead generation command center</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-emerald-700">Hot Leads</CardTitle>
              <Zap className="h-4 w-4 text-emerald-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-700">{stats.hotLeads.toLocaleString()}</div>
            <p className="text-xs text-emerald-600 mt-1">SnapScore ≥80</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-ink-700">Total Leads</CardTitle>
              <Users className="h-4 w-4 text-ink-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink-900">{stats.totalLeads.toLocaleString()}</div>
            <Button
              variant="link"
              className="text-xs text-brand p-0 h-auto mt-1"
              onClick={() => navigate("/leads")}
            >
              View all →
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-ink-700">Traced Contacts</CardTitle>
              <Phone className="h-4 w-4 text-ink-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink-900">{stats.tracedLeads.toLocaleString()}</div>
            <p className="text-xs text-ink-400 mt-1">Ready to contact</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-ink-700">Active Lists</CardTitle>
              <ListChecks className="h-4 w-4 text-ink-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-ink-900">{stats.activeLists}</div>
            <Button
              variant="link"
              className="text-xs text-brand p-0 h-auto mt-1"
              onClick={() => navigate("/lists")}
            >
              Manage →
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-ink-700">Outreach Today</CardTitle>
              <Mail className="h-4 w-4 text-ink-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-brand">{stats.outreachToday}</div>
            <p className="text-xs text-ink-400 mt-1">Activities logged</p>
          </CardContent>
        </Card>

        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-white">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-amber-700">Avg SnapScore</CardTitle>
              <TrendingUp className="h-4 w-4 text-amber-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-700">{dashboardStats?.avg_snap_score ?? 0}</div>
            <p className="text-xs text-amber-600 mt-1">Opportunity indicator</p>
          </CardContent>
        </Card>
      </div>

      {/* Intelligence Dashboard */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Property Intelligence</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
          <div className="lg:col-span-3">
            <IntelligenceDashboard onPropertyClick={(id) => navigate(`/leads?property=${id}`)} />
          </div>
          <div className="lg:col-span-1">
            <BatchRescoreButton />
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Jump to key workflows</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button onClick={() => navigate("/leads")} className="h-auto py-4 flex-col gap-2">
            <Users className="h-5 w-5" />
            <span className="text-sm">Browse Leads</span>
          </Button>
          <Button onClick={() => navigate("/lists")} variant="outline" className="h-auto py-4 flex-col gap-2">
            <ListChecks className="h-5 w-5" />
            <span className="text-sm">Manage Lists</span>
          </Button>
          <Button onClick={() => navigate("/upload")} variant="outline" className="h-auto py-4 flex-col gap-2">
            <Zap className="h-5 w-5" />
            <span className="text-sm">Upload Data</span>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
