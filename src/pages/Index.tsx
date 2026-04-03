import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/externalClient";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, ListChecks, Zap, TrendingUp, Users, Lock, Heart, CreditCard, Sparkles, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { IntelligenceDashboard } from "@/components/intelligence/IntelligenceDashboard";
import { BatchRescoreButton } from "@/components/intelligence/BatchRescoreButton";
import { useDashboardStats } from "@/hooks/useIntelligenceDashboard";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";
import { useSavedProperties } from "@/hooks/useSavedProperties";
import { useSubscription } from "@/hooks/useSubscription";
import { useFreeUnlocks } from "@/hooks/useFreeUnlocks";
import { useCreditBalance } from "@/hooks/useCredits";

export default function Index() {
  const navigate = useNavigate();
  const { data: dashboardStats, isLoading: statsLoading, error: statsError } = useDashboardStats();
  const { hasFeature } = useFeatureAccess();
  const hasRollingIntelligence = hasFeature('rolling_intelligence');
  const { savedCount, isLoading: savedLoading } = useSavedProperties();
  const { subscription, hasActiveSubscription, plan, usage, loading: subLoading } = useSubscription();
  const { freeUnlocksRemaining } = useFreeUnlocks();
  const { data: creditBalance = 0 } = useCreditBalance();
  
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

  // Only block if BOTH are still loading - show page as soon as one finishes
  const loading = statsLoading && extraLoading;

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
              onClick={() => navigate("/properties")}
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

        <Card className="border-red-200 bg-gradient-to-br from-red-50 to-white cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate("/saved")}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-red-700">Saved Properties</CardTitle>
              <Heart className="h-4 w-4 text-red-500 fill-current" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-700">{savedLoading ? "..." : savedCount.toLocaleString()}</div>
            <Button
              variant="link"
              className="text-xs text-red-600 p-0 h-auto mt-1"
              onClick={(e) => { e.stopPropagation(); navigate("/saved"); }}
            >
              View saved →
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Intelligence Dashboard */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Property Intelligence</h2>
        </div>
        {hasRollingIntelligence ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4 mb-4">
            <div className="lg:col-span-3">
              <IntelligenceDashboard onPropertyClick={(id) => navigate(`/properties?property=${id}`)} />
            </div>
            <div className="lg:col-span-1">
              <BatchRescoreButton />
            </div>
          </div>
        ) : (
          <Card className="border-dashed border-amber-300">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                <Lock className="h-6 w-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Rolling 30-Day Intelligence</h3>
              <p className="text-sm text-muted-foreground mb-4 max-w-md">
                Unlock property intelligence including opportunity funnels, hot property alerts, and jurisdiction enforcement profiles.
              </p>
              <Button
                className="gap-2 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700"
                onClick={() => navigate('/pricing')}
              >
                <Lock className="h-4 w-4" />
                Upgrade to Professional
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Jump to key workflows</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button onClick={() => navigate("/properties")} className="h-auto py-4 flex-col gap-2">
            <Users className="h-5 w-5" />
            <span className="text-sm">Browse Properties</span>
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
