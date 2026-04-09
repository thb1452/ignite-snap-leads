import { useState, useCallback, useEffect, useMemo } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import {
  Upload,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  X,
  Sparkles,
} from "lucide-react";
import {
  enrichList,
  downloadBlob,
  getEnrichmentUsage,
  type EnrichmentResult,
  type EnrichmentUsage,
} from "@/services/enrichment";
import {
  countAdditionalHighSnapInZips,
  normalizeAddressForMatch,
  normalizeZip,
  parseFullCsvRows,
} from "@/services/listEnrichmentAdditionalLeads";
import { useSubscription } from "@/hooks/useSubscription";
import { shouldLogListEnrichmentY } from "@/utils/listEnrichmentDebug";
import { Link } from "react-router-dom";

// Simple CSV parser for preview (handles quoted fields)
function parseCSVPreview(text: string, maxRows = 5): { headers: string[]; rows: string[][] } {
  const lines: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (current.trim() || lines.length > 0) lines.push(current);
      current = "";
      if (lines.length > maxRows + 1) break;
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);

  if (lines.length === 0) return { headers: [], rows: [] };

  const parseLine = (line: string): string[] => {
    const fields: string[] = [];
    let field = "";
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (ch === "," && !inQ) {
        fields.push(field.trim());
        field = "";
      } else {
        field += ch;
      }
    }
    fields.push(field.trim());
    return fields;
  };

  const headers = parseLine(lines[0]);
  const rows = lines.slice(1, maxRows + 1).map(parseLine);
  return { headers, rows };
}

// Auto-detect address column
function detectAddressColumn(headers: string[]): number {
  const keywords = [
    "address", "street", "property_address", "property address",
    "street_address", "street address", "addr", "site_address", "site address",
  ];
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === kw);
    if (idx !== -1) return idx;
  }
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim().includes(kw));
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectCityColumn(headers: string[]): number {
  const keywords = ["city", "town", "municipality"];
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === kw);
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectStateColumn(headers: string[]): number {
  const keywords = ["state", "province"];
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === kw);
    if (idx !== -1) return idx;
  }
  return -1;
}

function detectZipColumn(headers: string[]): number {
  const keywords = ["zip", "zipcode", "zip_code", "zip code", "postal", "postal_code"];
  for (const kw of keywords) {
    const idx = headers.findIndex((h) => h.toLowerCase().trim() === kw);
    if (idx !== -1) return idx;
  }
  return -1;
}

type Stage = "upload" | "mapping" | "processing" | "complete" | "error";

export function ListEnrichment() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const {
    subscription,
    loading: subscriptionOrUsageLoading,
    subscriptionLoading,
  } = useSubscription();

  // Stage management
  const [stage, setStage] = useState<Stage>("upload");

  // File state
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ headers: string[]; rows: string[][] } | null>(null);
  const [totalRows, setTotalRows] = useState(0);

  // Column mapping
  const [addressCol, setAddressCol] = useState<number>(-1);
  const [cityCol, setCityCol] = useState<number>(-1);
  const [stateCol, setStateCol] = useState<number>(-1);
  const [zipCol, setZipCol] = useState<number>(-1);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [progressPercent, setProgressPercent] = useState(0);

  // Results
  const [result, setResult] = useState<EnrichmentResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isTrialLimitError, setIsTrialLimitError] = useState(false);

  /** Additional high–SnapScore leads in same zips as upload (not on CSV); null = not computed */
  const [additionalLeadsY, setAdditionalLeadsY] = useState<number | null>(null);
  const [additionalLeadsLoading, setAdditionalLeadsLoading] = useState(false);

  const isElitePlan =
    subscription?.plan_name === "enterprise" || subscription?.plan_name === "enterprise_admin";

  // Usage
  const [usage, setUsage] = useState<EnrichmentUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  // Fetch enrichment usage on mount
  useEffect(() => {
    if (!user?.id) return;
    setUsageLoading(true);
    getEnrichmentUsage(user.id)
      .then(setUsage)
      .finally(() => setUsageLoading(false));
  }, [user?.id]);

  // After scan completes: count extra high-SnapScore properties in CSV zips (non-Elite only)
  useEffect(() => {
    const logY = shouldLogListEnrichmentY();

    if (stage !== "complete") {
      setAdditionalLeadsY(null);
      setAdditionalLeadsLoading(false);
      return;
    }
    if (!result || !file || addressCol < 0) {
      if (logY) {
        console.log("[ListEnrichment][Y] Skipped: missing result, file, or address column mapping", {
          hasResult: !!result,
          hasFile: !!file,
          addressCol,
        });
      }
      return;
    }
    if (zipCol < 0) {
      setAdditionalLeadsY(null);
      setAdditionalLeadsLoading(false);
      if (logY) {
        console.log(
          "[ListEnrichment][Y] Skipped: no Zip column mapped. Map Zip in Column Mapping to compute Y and show upsell.",
        );
      }
      return;
    }
    // Wait only for subscription (plan tier), not usage — usage can hang and would block Y forever.
    if (subscriptionLoading || !user?.id) {
      if (logY) {
        console.log("[ListEnrichment][Y] Skipped: waiting for subscription (or no user)", {
          subscriptionLoading,
          userId: user?.id,
        });
      }
      setAdditionalLeadsY(null);
      return;
    }
    if (isElitePlan) {
      // Elite never sees the upsell in the UI; skip the expensive count unless debugging.
      if (!logY) {
        setAdditionalLeadsY(null);
        return;
      }
      console.log(
        "[ListEnrichment][Y] Elite plan — upsell is hidden for this tier; computing Y anyway (debug only)",
      );
    }

    let cancelled = false;
    setAdditionalLeadsLoading(true);
    setAdditionalLeadsY(null);

    (async () => {
      try {
        const text = await file.text();
        const rows = parseFullCsvRows(text);
        if (rows.length < 2) {
          if (!cancelled) setAdditionalLeadsY(0);
          return;
        }

        const dataRows = rows.slice(1);
        const zips: string[] = [];
        const uploadedAddresses = new Set<string>();

        for (const row of dataRows) {
          if (row.length === 0) continue;
          const zipRaw = row[zipCol];
          if (zipRaw !== undefined && zipRaw !== null && String(zipRaw).trim() !== "") {
            zips.push(typeof zipRaw === "number" ? zipRaw : String(zipRaw).trim());
          }
          const addrRaw = row[addressCol];
          if (addrRaw) uploadedAddresses.add(normalizeAddressForMatch(String(addrRaw)));
        }

        if (shouldLogListEnrichmentY()) {
          const normalizedSample = [...new Set(zips.map((z) => normalizeZip(z)).filter(Boolean))].slice(0, 40);
          console.log("[ListEnrichment][Y] Extracted from CSV", {
            zipColumnIndex: zipCol,
            addressColumnIndex: addressCol,
            rawZipValuesSample: zips.slice(0, 20),
            rawZipRowCount: zips.length,
            normalizedUniqueZipSample: normalizedSample,
            normalizedUniqueZipCount: new Set(zips.map((z) => normalizeZip(z)).filter(Boolean)).size,
            uploadedAddressCount: uploadedAddresses.size,
          });
        }

        const y = await countAdditionalHighSnapInZips(zips, uploadedAddresses);
        if (!cancelled) {
          setAdditionalLeadsY(y);
          if (shouldLogListEnrichmentY()) {
            console.log(
              "[ListEnrichment][Y] State updated: additionalLeadsY =",
              y,
              "(upsell shows when Y > 0 and not Elite)",
            );
          }
        }
      } catch (e) {
        console.error("[ListEnrichment] additional leads count:", e);
        if (!cancelled) setAdditionalLeadsY(0);
      } finally {
        if (!cancelled) setAdditionalLeadsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [stage, result, file, zipCol, addressCol, subscriptionLoading, isElitePlan, user?.id]);

  // Count total rows when file is loaded
  const countRows = useCallback(async (f: File) => {
    const text = await f.text();
    const lineCount = text.split("\n").filter((l) => l.trim()).length;
    // Subtract 1 for header
    return Math.max(0, lineCount - 1);
  }, []);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const f = acceptedFiles[0];
      if (!f) return;

      if (!f.name.toLowerCase().endsWith(".csv")) {
        toast({
          title: "Invalid file type",
          description: "Please upload a .csv file.",
          variant: "destructive",
        });
        return;
      }

      if (f.size > 50 * 1024 * 1024) {
        toast({
          title: "File too large",
          description: "Maximum file size is 50MB.",
          variant: "destructive",
        });
        return;
      }

      setFile(f);
      setResult(null);
      setErrorMessage(null);
      setIsTrialLimitError(false);

      // Parse preview
      const text = await f.text();
      const parsed = parseCSVPreview(text, 5);
      setPreview(parsed);

      // Count rows
      const rows = await countRows(f);
      setTotalRows(rows);

      // Auto-detect columns
      const detectedAddr = detectAddressColumn(parsed.headers);
      const detectedCity = detectCityColumn(parsed.headers);
      const detectedState = detectStateColumn(parsed.headers);
      const detectedZip = detectZipColumn(parsed.headers);

      setAddressCol(detectedAddr);
      setCityCol(detectedCity);
      setStateCol(detectedState);
      setZipCol(detectedZip);

      setStage("mapping");
    },
    [toast, countRows]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "text/csv": [".csv"] },
    maxFiles: 1,
    disabled: processing,
  });

  const handleEnrich = async () => {
    if (!file || addressCol === -1) return;

    setStage("processing");
    setProcessing(true);
    setProgressPercent(10);
    setErrorMessage(null);
    setIsTrialLimitError(false);

    // Simulate progress (since the edge function processes synchronously)
    const progressInterval = setInterval(() => {
      setProgressPercent((prev) => {
        if (prev >= 90) return prev;
        return prev + Math.random() * 8;
      });
    }, 800);

    try {
      const enrichResult = await enrichList(
        file,
        addressCol,
        cityCol !== -1 ? cityCol : undefined,
        stateCol !== -1 ? stateCol : undefined,
        zipCol !== -1 ? zipCol : undefined,
      );

      clearInterval(progressInterval);
      setProgressPercent(100);
      setResult(enrichResult);
      setStage("complete");

      // Refresh usage after successful enrichment
      if (user?.id) {
        getEnrichmentUsage(user.id).then(setUsage);
      }
    } catch (err: any) {
      clearInterval(progressInterval);
      setProgressPercent(0);

      if (err.code === "TRIAL_ENRICHMENT_LIMIT") {
        setIsTrialLimitError(true);
        setErrorMessage(err.message);
      } else {
        setErrorMessage(err.message || "An error occurred during enrichment.");
      }
      setStage("error");
    } finally {
      setProcessing(false);
    }
  };

  const handleDownload = () => {
    if (!result) return;
    downloadBlob(result.csvBlob, result.outputFileName);
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setTotalRows(0);
    setAddressCol(-1);
    setCityCol(-1);
    setStateCol(-1);
    setZipCol(-1);
    setResult(null);
    setErrorMessage(null);
    setIsTrialLimitError(false);
    setAdditionalLeadsY(null);
    setAdditionalLeadsLoading(false);
    setProgressPercent(0);
    setStage("upload");
  };

  // Credits display
  const creditsDisplay = useMemo(() => {
    if (usageLoading || !usage) return null;
    if (usage.no_subscription) return null;
    // If limit is null, usage fetch failed or data is unavailable — don't show stale zeros
    if (usage.limit === null && usage.remaining === null && !usage.unlimited) return null;
    if (usage.unlimited) return "Unlimited credits";
    if (usage.is_trial) {
      return `${(usage.remaining ?? 0).toLocaleString()} of ${(usage.limit ?? 0).toLocaleString()} lifetime credits remaining`;
    }
    return `${(usage.remaining ?? 0).toLocaleString()} of ${(usage.limit ?? 0).toLocaleString()} credits remaining this month`;
  }, [usage, usageLoading]);

  return (
    <AppLayout>
      <div className="mx-auto max-w-[1000px] px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Sparkles className="h-6 w-6 text-brand" />
            <h1 className="text-2xl font-semibold text-ink-900">Scan</h1>
          </div>
          <p className="text-sm text-ink-500 mb-2">
            Upload a property list (CSV) and we'll cross-reference every address against our municipal enforcement database.
          </p>
          <p className="text-xs text-ink-400 leading-relaxed max-w-2xl">
            Each matched property gets a <strong className="text-ink-600">SnapScore</strong> (0–100 distress ranking), 
            an <strong className="text-ink-600">AI investor brief</strong> with an action label (CALL NOW / WORTH A CALL / OPPORTUNITY / PASS), 
            and full violation history — so you can instantly prioritize which leads to pursue first.
          </p>

          {/* Credits badge */}
          {creditsDisplay && (
            <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-slate-100 px-4 py-1.5 text-sm text-ink-600">
              <span className="h-2 w-2 rounded-full bg-brand" />
              {creditsDisplay}
            </div>
          )}
        </div>

        {/* Upload Stage */}
        {stage === "upload" && (
          <Card>
            <CardContent className="p-8">
              <div
                {...getRootProps()}
                className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors cursor-pointer ${
                  isDragActive
                    ? "border-brand bg-brand/5"
                    : "border-slate-200 hover:border-brand/50 hover:bg-slate-50"
                }`}
              >
                <input {...getInputProps()} />
                <Upload className="h-10 w-10 text-ink-400 mb-4" />
                <p className="text-base font-medium text-ink-700 mb-1">
                  {isDragActive ? "Drop your CSV here" : "Drag & drop your CSV file here"}
                </p>
                <p className="text-sm text-ink-400 mb-4">or click to select a file</p>
                <Button variant="outline" size="sm" type="button">
                  Select File
                </Button>
                <p className="text-xs text-ink-400 mt-3">.csv files only, max 50MB / 50,000 rows</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Mapping Stage */}
        {stage === "mapping" && preview && (
          <div className="space-y-6">
            {/* File info */}
            <Card>
              <CardContent className="py-4 px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-ink-400" />
                    <div>
                      <p className="text-sm font-medium text-ink-700">{file?.name}</p>
                      <p className="text-xs text-ink-400">
                        {totalRows.toLocaleString()} rows &middot; {preview.headers.length} columns
                      </p>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={handleReset}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Column Mapping */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Column Mapping</CardTitle>
                <p className="text-sm text-ink-500">
                  {addressCol !== -1
                    ? "We detected your columns automatically. Adjust if needed."
                    : "Select which column contains the property address."}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-ink-700 mb-1.5 block">
                      Address Column <span className="text-red-500">*</span>
                    </label>
                    <Select
                      value={addressCol >= 0 ? addressCol.toString() : ""}
                      onValueChange={(v) => setAddressCol(parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select address column" />
                      </SelectTrigger>
                      <SelectContent>
                        {preview.headers.map((h, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 mb-1.5 block">
                      City Column
                    </label>
                    <Select
                      value={cityCol >= 0 ? cityCol.toString() : "none"}
                      onValueChange={(v) => setCityCol(v === "none" ? -1 : parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not mapped</SelectItem>
                        {preview.headers.map((h, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 mb-1.5 block">
                      State Column
                    </label>
                    <Select
                      value={stateCol >= 0 ? stateCol.toString() : "none"}
                      onValueChange={(v) => setStateCol(v === "none" ? -1 : parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not mapped</SelectItem>
                        {preview.headers.map((h, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-ink-700 mb-1.5 block">
                      Zip Column
                    </label>
                    <Select
                      value={zipCol >= 0 ? zipCol.toString() : "none"}
                      onValueChange={(v) => setZipCol(v === "none" ? -1 : parseInt(v))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Not mapped" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Not mapped</SelectItem>
                        {preview.headers.map((h, i) => (
                          <SelectItem key={i} value={i.toString()}>
                            {h || `Column ${i + 1}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preview Table */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Preview</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr>
                        {preview.headers.map((h, i) => (
                          <th
                            key={i}
                            className={`px-3 py-2 text-left text-xs font-medium uppercase tracking-wider whitespace-nowrap ${
                              i === addressCol
                                ? "bg-brand/10 text-brand"
                                : "text-ink-500 bg-slate-50"
                            }`}
                          >
                            {h || `Col ${i + 1}`}
                            {i === addressCol && (
                              <span className="ml-1 text-[10px] font-normal normal-case">(address)</span>
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.rows.map((row, ri) => (
                        <tr key={ri} className="border-t border-slate-100">
                          {row.map((cell, ci) => (
                            <td
                              key={ci}
                              className={`px-3 py-2 whitespace-nowrap text-ink-700 max-w-[200px] truncate ${
                                ci === addressCol ? "bg-brand/5 font-medium" : ""
                              }`}
                            >
                              {cell}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* Enrich button */}
            <div className="flex items-center justify-between">
              <p className="text-sm text-ink-500">
                {totalRows.toLocaleString()} addresses will be enriched
              </p>
              <Button
                onClick={handleEnrich}
                disabled={addressCol === -1 || processing}
                className="gap-2"
              >
                <Sparkles className="h-4 w-4" />
                Enrich {totalRows.toLocaleString()} Addresses
              </Button>
            </div>
          </div>
        )}

        {/* Processing Stage */}
        {stage === "processing" && (
          <Card>
            <CardContent className="py-12 px-8">
              <div className="flex flex-col items-center text-center">
                <Loader2 className="h-10 w-10 text-brand animate-spin mb-4" />
                <h2 className="text-lg font-medium text-ink-800 mb-2">
                  Enriching your list...
                </h2>
                <p className="text-sm text-ink-500 mb-6">
                  Processing {totalRows.toLocaleString()} addresses. This may take a moment.
                </p>
                <div className="w-full max-w-md">
                  <Progress value={progressPercent} className="h-2" />
                  <p className="text-xs text-ink-400 mt-2">
                    {Math.round(progressPercent)}% complete
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Complete Stage */}
        {stage === "complete" && result && (
          <div className="space-y-6">
            <Card>
              <CardContent className="py-8 px-8">
                <div className="flex flex-col items-center text-center">
                  <CheckCircle2 className="h-10 w-10 text-green-500 mb-4" />
                  <h2 className="text-lg font-medium text-ink-800 mb-2">
                    Enrichment Complete
                  </h2>
                  <p className="text-sm text-ink-500 mb-6">
                    <span className="font-semibold text-ink-700">
                      {result.matchedRows.toLocaleString()}
                    </span>{" "}
                    of{" "}
                    <span className="font-semibold text-ink-700">
                      {result.totalRows.toLocaleString()}
                    </span>{" "}
                    addresses matched active enforcement data.
                  </p>

                  <div className="flex gap-3">
                    <Button onClick={handleDownload} className="gap-2">
                      <Download className="h-4 w-4" />
                      Download Enriched CSV
                    </Button>
                    <Button variant="outline" onClick={handleReset}>
                      Enrich Another List
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Match summary */}
            <div className="grid grid-cols-3 gap-4">
              <Card>
                <CardContent className="py-4 px-5 text-center">
                  <p className="text-2xl font-semibold text-ink-800">
                    {result.totalRows.toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">Total Addresses</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 px-5 text-center">
                  <p className="text-2xl font-semibold text-green-600">
                    {result.matchedRows.toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">Matched</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="py-4 px-5 text-center">
                  <p className="text-2xl font-semibold text-ink-400">
                    {(result.totalRows - result.matchedRows).toLocaleString()}
                  </p>
                  <p className="text-xs text-ink-500 mt-1">No Match</p>
                </CardContent>
              </Card>
            </div>

            {!subscriptionOrUsageLoading &&
              !isElitePlan &&
              !additionalLeadsLoading &&
              additionalLeadsY !== null &&
              additionalLeadsY > 0 && (
                <Card className="border-brand/25 bg-gradient-to-br from-brand/5 to-transparent">
                  <CardContent className="py-6 px-6 sm:px-8">
                    <p className="text-sm sm:text-base text-ink-800 leading-relaxed max-w-2xl">
                      We found{" "}
                      <span className="font-semibold text-ink-900">
                        {result.matchedRows.toLocaleString()}
                      </span>{" "}
                      properties on your list with active violations. We also found{" "}
                      <span className="font-semibold text-brand">{additionalLeadsY.toLocaleString()}</span>{" "}
                      additional properties in the same zip codes with high SnapScores not on your list — want to see
                      them?
                    </p>
                    <Button className="mt-5 gap-2" onClick={() => navigate("/pricing")}>
                      <Sparkles className="h-4 w-4" />
                      Unlock Additional Leads
                    </Button>
                  </CardContent>
                </Card>
              )}
          </div>
        )}

        {/* Error Stage */}
        {stage === "error" && (
          <Card>
            <CardContent className="py-8 px-8">
              <div className="flex flex-col items-center text-center">
                <AlertTriangle className="h-10 w-10 text-amber-500 mb-4" />
                <h2 className="text-lg font-medium text-ink-800 mb-2">
                  {isTrialLimitError ? "Enrichment Limit Reached" : "Enrichment Failed"}
                </h2>
                <p className="text-sm text-ink-500 mb-6 max-w-md">
                  {errorMessage}
                </p>

                <div className="flex gap-3">
                  {isTrialLimitError ? (
                    <Button asChild>
                      <Link to="/pricing">Upgrade Now</Link>
                    </Button>
                  ) : (
                    <Button onClick={handleReset}>Try Again</Button>
                  )}
                  <Button variant="outline" onClick={handleReset}>
                    Upload Different File
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
