import { supabase, supabaseUrl } from "@/integrations/supabase/externalClient";

export interface EnrichmentResult {
  totalRows: number;
  matchedRows: number;
  remaining: string;
  csvBlob: Blob;
  outputFileName: string;
}

export interface EnrichmentUsage {
  used: number;
  limit: number | null;
  remaining: number | null;
  is_trial: boolean;
  unlimited?: boolean;
  no_subscription?: boolean;
}

export async function getEnrichmentUsage(userId: string): Promise<EnrichmentUsage> {
  const { data, error } = await supabase.rpc("fn_get_enrichment_usage", {
    p_user_id: userId,
  });

  if (error) {
    console.error("Error fetching enrichment usage:", error);
    return { used: 0, limit: 0, remaining: 0, is_trial: false };
  }

  return data as unknown as EnrichmentUsage;
}

export async function enrichList(
  file: File,
  addressColumnIndex: number,
  cityColumnIndex?: number,
  stateColumnIndex?: number,
  zipColumnIndex?: number,
): Promise<EnrichmentResult> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Please sign in to use list enrichment");
  }

  const formData = new FormData();
  formData.append("file", file);
  formData.append("addressColumnIndex", addressColumnIndex.toString());
  if (cityColumnIndex !== undefined && cityColumnIndex !== -1) {
    formData.append("cityColumnIndex", cityColumnIndex.toString());
  }
  if (stateColumnIndex !== undefined && stateColumnIndex !== -1) {
    formData.append("stateColumnIndex", stateColumnIndex.toString());
  }
  if (zipColumnIndex !== undefined && zipColumnIndex !== -1) {
    formData.append("zipColumnIndex", zipColumnIndex.toString());
  }

  const response = await fetch(`${supabaseUrl}/functions/v1/enrich-list`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));

    if (response.status === 403) {
      if (errorData.code === "TRIAL_ENRICHMENT_LIMIT") {
        const err = new Error(errorData.message || "Trial enrichment limit reached");
        (err as any).code = "TRIAL_ENRICHMENT_LIMIT";
        (err as any).remaining = errorData.remaining;
        (err as any).limit = errorData.limit;
        (err as any).is_trial = true;
        throw err;
      }
      if (errorData.code === "ENRICHMENT_LIMIT_EXCEEDED") {
        const err = new Error(errorData.message || "Enrichment limit exceeded");
        (err as any).code = "ENRICHMENT_LIMIT_EXCEEDED";
        (err as any).remaining = errorData.remaining;
        throw err;
      }
    }

    throw new Error(errorData.message || errorData.error || `Enrichment failed: ${response.statusText}`);
  }

  const csvText = await response.text();
  const blob = new Blob([csvText], { type: "text/csv;charset=utf-8" });

  const totalRows = parseInt(response.headers.get("X-Enrichment-Total") || "0");
  const matchedRows = parseInt(response.headers.get("X-Enrichment-Matched") || "0");
  const remaining = response.headers.get("X-Enrichment-Remaining") || "0";

  // Extract filename from Content-Disposition header
  const disposition = response.headers.get("Content-Disposition") || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const outputFileName = filenameMatch?.[1] || `enriched_${file.name}`;

  return {
    totalRows,
    matchedRows,
    remaining,
    csvBlob: blob,
    outputFileName,
  };
}

export function downloadBlob(blob: Blob, fileName: string) {
  const link = document.createElement("a");
  const blobUrl = URL.createObjectURL(blob);
  link.href = blobUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    link.remove();
  }, 1000);
}
