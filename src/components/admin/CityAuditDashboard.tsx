import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/externalClient";
import { MapPin, Search, CheckCircle2, AlertTriangle, Loader2, Trash2, ArrowRight } from "lucide-react";

interface FlaggedCity {
  city: string;
  state: string;
  count: number;
  suggested: string | null;
  similarity: number;
}

interface AuditReport {
  total_cities: number;
  verified_count: number;
  flagged_count: number;
  flagged_properties: number;
  census_places_loaded: number;
  flagged: FlaggedCity[];
}

export function CityAuditDashboard() {
  const [populating, setPopulating] = useState(false);
  const [auditing, setAuditing] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [report, setReport] = useState<AuditReport | null>(null);
  const [populateResult, setPopulateResult] = useState<{ states_processed: number; places_upserted: number } | null>(null);

  const callAuditFn = async (action: string) => {
    const { data: { session } } = await supabase.auth.getSession();
    const url = `${import.meta.env.VITE_SUPABASE_URL || "https://ojyxblegxpdgaqiscxpz.supabase.co"}/functions/v1/audit-cities`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed: ${res.status}`);
    }
    return res.json();
  };

  const handlePopulate = async () => {
    setPopulating(true);
    try {
      const result = await callAuditFn("populate");
      setPopulateResult(result);
      toast.success(`Loaded ${result.places_upserted.toLocaleString()} Census places from ${result.states_processed} states`);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setPopulating(false);
    }
  };

  const handleAudit = async () => {
    setAuditing(true);
    try {
      const result = await callAuditFn("report");
      if (result.error) {
        toast.error(result.error);
      } else {
        setReport(result);
        toast.success(`Audit complete: ${result.flagged_count} cities flagged`);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAuditing(false);
    }
  };

  const handleFix = async (flagged: FlaggedCity) => {
    if (!flagged.suggested) return;
    setFixing(`${flagged.city}|${flagged.state}`);
    try {
      const { data, error } = await supabase.rpc("fn_fix_city_names", {
        mappings: JSON.stringify([
          { old_city: flagged.city, old_state: flagged.state, new_city: flagged.suggested },
        ]),
      });
      if (error) throw error;
      const updated = (data as any)?.updated || 0;
      toast.success(`Updated ${updated} properties: "${flagged.city}" → "${flagged.suggested}"`);
      // Remove from report
      if (report) {
        setReport({
          ...report,
          flagged: report.flagged.filter((f) => !(f.city === flagged.city && f.state === flagged.state)),
          flagged_count: report.flagged_count - 1,
          verified_count: report.verified_count + 1,
          flagged_properties: report.flagged_properties - flagged.count,
        });
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setFixing(null);
    }
  };

  const handleDismiss = (flagged: FlaggedCity) => {
    if (!report) return;
    setReport({
      ...report,
      flagged: report.flagged.filter((f) => !(f.city === flagged.city && f.state === flagged.state)),
      flagged_count: report.flagged_count - 1,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPin className="h-5 w-5" />
          City Name Audit
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Action buttons */}
        <div className="flex flex-wrap gap-3">
          <Button onClick={handlePopulate} disabled={populating} variant="outline">
            {populating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
            {populating ? "Loading Census Data..." : "1. Load Census Places"}
          </Button>
          <Button onClick={handleAudit} disabled={auditing}>
            {auditing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <AlertTriangle className="h-4 w-4 mr-2" />}
            {auditing ? "Auditing..." : "2. Run Audit"}
          </Button>
        </div>

        {populateResult && (
          <div className="text-sm text-muted-foreground">
            ✅ Census data loaded: {populateResult.places_upserted.toLocaleString()} places from {populateResult.states_processed} states
          </div>
        )}

        {/* Report summary */}
        {report && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-3 bg-muted rounded-lg">
                <p className="text-2xl font-bold">{report.total_cities.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Total Cities</p>
              </div>
              <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-2xl font-bold text-green-700 dark:text-green-400">{report.verified_count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Verified</p>
              </div>
              <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <p className="text-2xl font-bold text-red-700 dark:text-red-400">{report.flagged_count.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Flagged</p>
              </div>
              <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                <p className="text-2xl font-bold text-orange-700 dark:text-orange-400">{report.flagged_properties.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground">Affected Properties</p>
              </div>
            </div>

            <Progress
              value={(report.verified_count / report.total_cities) * 100}
              className="h-2"
            />
            <p className="text-xs text-muted-foreground">
              {Math.round((report.verified_count / report.total_cities) * 100)}% of city names verified against US Census
            </p>

            {/* Flagged cities table */}
            {report.flagged.length > 0 && (
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>City (Current)</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="text-right">Properties</TableHead>
                      <TableHead>Suggested Fix</TableHead>
                      <TableHead className="text-right">Match %</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.flagged.map((f) => (
                      <TableRow key={`${f.city}|${f.state}`}>
                        <TableCell className="font-mono text-sm max-w-[200px] truncate" title={f.city}>
                          {f.city}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{f.state}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-medium">{f.count.toLocaleString()}</TableCell>
                        <TableCell>
                          {f.suggested ? (
                            <span className="text-green-700 dark:text-green-400 font-medium">{f.suggested}</span>
                          ) : (
                            <span className="text-muted-foreground italic">No match</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={f.similarity > 0.6 ? "default" : f.similarity > 0.3 ? "secondary" : "destructive"}>
                            {Math.round(f.similarity * 100)}%
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {f.suggested && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleFix(f)}
                                disabled={fixing === `${f.city}|${f.state}`}
                                title={`Remap to "${f.suggested}"`}
                              >
                                {fixing === `${f.city}|${f.state}` ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <ArrowRight className="h-3 w-3" />
                                )}
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => handleDismiss(f)} title="Dismiss">
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {report.flagged.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <CheckCircle2 className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p className="font-medium">All city names verified!</p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
