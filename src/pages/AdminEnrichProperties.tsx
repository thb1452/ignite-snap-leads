import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Download, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/layout/AppLayout";
import { SEOHead } from "@/components/SEOHead";

interface EnrichJob {
  id: string;
  file_name: string;
  status: string;
  total_rows: number;
  processed_rows: number;
  matched_rows: number;
  updated_rows: number;
  unmatched_rows: number;
  error_message: string | null;
  unmatched_csv_url: string | null;
  created_at: string;
  completed_at: string | null;
}

const SAMPLE_CSV = `address,city,state,zip,beds,baths,sqft,year_built,lot_size_sqft
123 Main St,Detroit,MI,48201,3,2.5,1450,1925,4356
456 Oak Ave,Cleveland,OH,44102,2,1,980,1948,3200`;

export default function AdminEnrichProperties() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["enrichment-jobs"],
    queryFn: async (): Promise<EnrichJob[]> => {
      const { data, error } = await supabase
        .from("property_enrichment_jobs" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as unknown as EnrichJob[];
    },
    refetchInterval: (q) => {
      const data = q.state.data as EnrichJob[] | undefined;
      return data?.some((j) => j.status === "processing" || j.status === "pending") ? 3000 : false;
    },
  });

  async function handleUpload() {
    if (!file || !user) return;
    setUploading(true);
    try {
      const csvText = await file.text();

      const { data: jobRow, error: jobErr } = await supabase
        .from("property_enrichment_jobs" as any)
        .insert({
          user_id: user.id,
          file_name: file.name,
          status: "pending",
        })
        .select("id")
        .single();
      if (jobErr) throw jobErr;
      const jobId = (jobRow as any).id as string;

      const { error: invokeErr } = await supabase.functions.invoke("bulk-enrich-properties", {
        body: { jobId, csvText },
      });
      if (invokeErr) throw invokeErr;

      toast({
        title: "Enrichment started",
        description: `Processing ${file.name}. Watch the job list below.`,
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["enrichment-jobs"] });
    } catch (e) {
      toast({
        title: "Upload failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "property-enrichment-sample.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <SEOHead title="Property Enrichment — Admin" description="Bulk enrich properties with beds, baths, sqft, year built, and lot size." />
      <AppLayout>
        <div className="container max-w-5xl py-8 space-y-6">
          <div>
            <h1 className="text-3xl font-bold">Property Enrichment</h1>
            <p className="text-muted-foreground mt-1">
              Bulk update properties with beds, baths, sqft, year built, and lot size.
            </p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" /> Upload Enrichment CSV
              </CardTitle>
              <CardDescription>
                CSV must include columns: <code className="text-xs">address, city, state</code> (required) plus any of{" "}
                <code className="text-xs">zip, beds, baths, sqft, year_built, lot_size_sqft</code>. Blank cells are skipped; non-blank values overwrite existing data.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  disabled={uploading}
                  className="max-w-md"
                />
                <Button onClick={handleUpload} disabled={!file || uploading}>
                  {uploading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  {uploading ? "Uploading…" : "Start Enrichment"}
                </Button>
                <Button variant="outline" onClick={downloadSample}>
                  <Download className="h-4 w-4 mr-2" />
                  Sample CSV
                </Button>
              </div>
              {file && (
                <p className="text-sm text-muted-foreground">
                  Selected: <strong>{file.name}</strong> ({(file.size / 1024).toFixed(1)} KB)
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5" /> Recent Jobs
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : jobs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No enrichment jobs yet.</p>
              ) : (
                <div className="space-y-3">
                  {jobs.map((job) => (
                    <JobCard key={job.id} job={job} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    </>
  );
}

function JobCard({ job }: { job: EnrichJob }) {
  const pct = job.total_rows > 0 ? Math.round((job.processed_rows / job.total_rows) * 100) : 0;
  const statusBadge = () => {
    switch (job.status) {
      case "completed":
        return (
          <Badge variant="default" className="bg-green-600">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="h-3 w-3 mr-1" /> Failed
          </Badge>
        );
      case "processing":
        return (
          <Badge variant="secondary">
            <Loader2 className="h-3 w-3 mr-1 animate-spin" /> Processing
          </Badge>
        );
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium">{job.file_name}</div>
          <div className="text-xs text-muted-foreground">{new Date(job.created_at).toLocaleString()}</div>
        </div>
        {statusBadge()}
      </div>

      {(job.status === "processing" || job.status === "completed") && (
        <>
          <Progress value={pct} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <Stat label="Total" value={job.total_rows} />
            <Stat label="Matched" value={job.matched_rows} />
            <Stat label="Updated" value={job.updated_rows} valueClass="text-green-600" />
            <Stat label="Unmatched" value={job.unmatched_rows} valueClass={job.unmatched_rows > 0 ? "text-amber-600" : ""} />
          </div>
        </>
      )}

      {job.error_message && (
        <div className="text-sm text-destructive bg-destructive/10 rounded p-2">{job.error_message}</div>
      )}

      {job.unmatched_csv_url && (
        <Button variant="outline" size="sm" asChild>
          <a href={job.unmatched_csv_url} target="_blank" rel="noopener noreferrer">
            <Download className="h-4 w-4 mr-2" /> Download Unmatched ({job.unmatched_rows})
          </a>
        </Button>
      )}
    </div>
  );
}

function Stat({ label, value, valueClass = "" }: { label: string; value: number; valueClass?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-lg font-semibold ${valueClass}`}>{value.toLocaleString()}</div>
    </div>
  );
}
