import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Upload, TrendingUp, MapPin, List } from "lucide-react";
import { Link } from "react-router-dom";

interface Stats {
  totalProperties: number;
  hotLeads: number;
  totalLists: number;
  avgScore: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<Stats>({
    totalProperties: 0,
    hotLeads: 0,
    totalLists: 0,
    avgScore: 0,
  });
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      setLoading(true);
      
      // Fetch properties count and scores
      const { data: properties, error: propertiesError } = await supabase
        .from("properties")
        .select("snap_score");

      if (propertiesError) throw propertiesError;

      // Fetch lists count
      const { count: listsCount, error: listsError } = await supabase
        .from("lead_lists")
        .select("*", { count: "exact", head: true });

      if (listsError) throw listsError;

      const totalProperties = properties?.length || 0;
      const hotLeads = properties?.filter(p => (p.snap_score ?? 0) >= 80).length || 0;
      const avgScore = totalProperties > 0
        ? Math.round(properties.reduce((sum, p) => sum + (p.snap_score ?? 0), 0) / totalProperties)
        : 0;

      setStats({
        totalProperties,
        hotLeads,
        totalLists: listsCount || 0,
        avgScore,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      toast({
        title: "Error",
        description: "Failed to load dashboard stats",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-ink-900 font-display mb-2">Dashboard</h1>
        <p className="text-ink-400 font-ui">Welcome back! Here's your property overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <Card className="rounded-2xl shadow-card p-6 hover:shadow-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="h-12 w-12 rounded-xl bg-brand/10 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-brand" />
            </div>
            {loading && <div className="animate-spin h-4 w-4 border-2 border-brand border-t-transparent rounded-full" />}
          </div>
          <div className="text-3xl font-bold text-ink-900 font-display mb-1">
            {stats.totalProperties}
          </div>
          <div className="text-sm text-ink-400 font-ui">Total Properties</div>
        </Card>

        <Card className="rounded-2xl shadow-card p-6 hover:shadow-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center">
              <span className="text-2xl">🔥</span>
            </div>
            {loading && <div className="animate-spin h-4 w-4 border-2 border-emerald-600 border-t-transparent rounded-full" />}
          </div>
          <div className="text-3xl font-bold text-emerald-600 font-display mb-1">
            {stats.hotLeads}
          </div>
          <div className="text-sm text-ink-400 font-ui">Hot Leads (80+)</div>
        </Card>

        <Card className="rounded-2xl shadow-card p-6 hover:shadow-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center">
              <List className="h-6 w-6 text-amber-600" />
            </div>
            {loading && <div className="animate-spin h-4 w-4 border-2 border-amber-600 border-t-transparent rounded-full" />}
          </div>
          <div className="text-3xl font-bold text-amber-600 font-display mb-1">
            {stats.totalLists}
          </div>
          <div className="text-sm text-ink-400 font-ui">Active Lists</div>
        </Card>

        <Card className="rounded-2xl shadow-card p-6 hover:shadow-elevate transition-all">
          <div className="flex items-center justify-between mb-4">
            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
              <TrendingUp className="h-6 w-6 text-brand" />
            </div>
            {loading && <div className="animate-spin h-4 w-4 border-2 border-brand border-t-transparent rounded-full" />}
          </div>
          <div className="text-3xl font-bold text-brand font-display mb-1">
            {stats.avgScore}
          </div>
          <div className="text-sm text-ink-400 font-ui">Avg SnapScore</div>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="rounded-2xl shadow-card p-8">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-brand/20 to-brand/40 flex items-center justify-center flex-shrink-0">
              <Upload className="h-7 w-7 text-brand" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-ink-900 font-display mb-2">Upload Properties</h3>
              <p className="text-sm text-ink-500 font-ui mb-4">
                Import new properties from CSV files to expand your lead database.
              </p>
              <Link to="/upload">
                <Button className="rounded-xl bg-brand text-white hover:bg-brand/90">
                  Upload CSV
                </Button>
              </Link>
            </div>
          </div>
        </Card>

        <Card className="rounded-2xl shadow-card p-8">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-emerald-100 to-emerald-200 flex items-center justify-center flex-shrink-0">
              <MapPin className="h-7 w-7 text-emerald-700" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-ink-900 font-display mb-2">View Map</h3>
              <p className="text-sm text-ink-500 font-ui mb-4">
                Visualize all your properties on an interactive map with clustering.
              </p>
              <Link to="/map">
                <Button variant="outline" className="rounded-xl border">
                  Open Map
                </Button>
              </Link>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
