import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Activity, 
  MapPin, 
  AlertTriangle, 
  CheckCircle2, 
  RefreshCw,
  Play,
  Database
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/externalClient";

interface DataHealthReport {
  total_properties: number;
  missing_zip: number;
  missing_zip_pct: number;
  missing_latlng: number;
  missing_latlng_pct: number;
  missing_snap_score: number;
  total_violations: number;
  top_missing_zip_cities: Array<{
    city: string;
    state: string;
    missing: number;
    total: number;
    pct_missing: number;
    last_update: string;
  }>;
}

export function DataHealthDashboard() {
  const [report, setReport] = useState<DataHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [backfilling, setBackfilling] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    try {
      const { data, error } = await supabase.rpc('fn_data_health_report');
      if (error) throw error;
      setReport(data as unknown as DataHealthReport);
    } catch (err) {
      console.error('[DataHealth] Failed to fetch report:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleBackfill = async (city: string, state: string) => {
    const key = `${city}-${state}`;
    setBackfilling(key);
    try {
      const { data, error } = await supabase.functions.invoke('backfill-zips', {
        body: { city, state, batchSize: 200 }
      });
      if (error) throw error;
      toast.success(`Backfill started for ${city}, ${state}: ${data.updated} updated, ${data.remaining_with_coords} remaining`);
      // Refresh after short delay
      setTimeout(fetchReport, 3000);
    } catch (err) {
      toast.error(`Backfill failed for ${city}: ${err}`);
    } finally {
      setBackfilling(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Health Monitor
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-8 bg-muted rounded" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!report) return null;

  const zipHealthPct = 100 - report.missing_zip_pct;
  const coordHealthPct = 100 - report.missing_latlng_pct;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Data Health Monitor
          </CardTitle>
          <Button variant="outline" size="sm" onClick={fetchReport}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Properties</p>
            <p className="text-2xl font-bold">{report.total_properties.toLocaleString()}</p>
          </div>
          <div className="text-center p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">Violations</p>
            <p className="text-2xl font-bold">{report.total_violations.toLocaleString()}</p>
          </div>
          <div className={`text-center p-4 rounded-lg ${report.missing_zip > 0 ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-green-100 dark:bg-green-900/20'}`}>
            <p className="text-sm text-muted-foreground">Missing ZIP</p>
            <p className="text-2xl font-bold">{report.missing_zip.toLocaleString()}</p>
            <Badge variant="secondary" className="mt-1">{report.missing_zip_pct}%</Badge>
          </div>
          <div className={`text-center p-4 rounded-lg ${report.missing_latlng > 0 ? 'bg-amber-100 dark:bg-amber-900/20' : 'bg-green-100 dark:bg-green-900/20'}`}>
            <p className="text-sm text-muted-foreground">Missing Coords</p>
            <p className="text-2xl font-bold">{report.missing_latlng.toLocaleString()}</p>
            <Badge variant="secondary" className="mt-1">{report.missing_latlng_pct}%</Badge>
          </div>
        </div>

        {/* Health Bars */}
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">ZIP Coverage</span>
              <span className="font-medium">{zipHealthPct.toFixed(1)}%</span>
            </div>
            <Progress value={zipHealthPct} className="h-2" />
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Coordinate Coverage</span>
              <span className="font-medium">{coordHealthPct.toFixed(1)}%</span>
            </div>
            <Progress value={coordHealthPct} className="h-2" />
          </div>
        </div>

        {/* Top Missing ZIP Cities */}
        {report.top_missing_zip_cities && report.top_missing_zip_cities.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
              Top Cities Missing ZIP Codes
            </h4>
            <div className="max-h-64 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 font-medium">City</th>
                    <th className="text-right py-2 font-medium">Missing</th>
                    <th className="text-right py-2 font-medium">Total</th>
                    <th className="text-right py-2 font-medium">%</th>
                    <th className="text-right py-2 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {report.top_missing_zip_cities.map((city, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/30">
                      <td className="py-2">{city.city}, {city.state}</td>
                      <td className="text-right py-2 text-amber-600 font-medium">{city.missing.toLocaleString()}</td>
                      <td className="text-right py-2 text-muted-foreground">{city.total.toLocaleString()}</td>
                      <td className="text-right py-2">
                        <Badge variant={city.pct_missing > 50 ? "destructive" : "secondary"} className="text-xs">
                          {city.pct_missing}%
                        </Badge>
                      </td>
                      <td className="text-right py-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={backfilling === `${city.city}-${city.state}`}
                          onClick={() => handleBackfill(city.city, city.state)}
                        >
                          {backfilling === `${city.city}-${city.state}` ? (
                            <RefreshCw className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
