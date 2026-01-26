import { supabase } from "@/integrations/supabase/client";

interface ExportParams {
  city?: string;
  minScore?: number;
  maxScore?: number;
  jurisdictionId?: string;
  propertyIds?: string[];
}

export async function exportFilteredCsv(params: ExportParams) {
  // Build query string
  const qs = new URLSearchParams();
  if (params.city) qs.set("city", params.city);
  if (params.minScore != null) qs.set("minScore", String(params.minScore));
  if (params.maxScore != null) qs.set("maxScore", String(params.maxScore));
  if (params.jurisdictionId) qs.set("jurisdictionId", params.jurisdictionId);
  if (params.propertyIds?.length) qs.set("propertyIds", params.propertyIds.join(","));

  // Get user session token for authenticated request
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Please sign in to export data");
  }

  // Call edge function with query params
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-csv?${qs.toString()}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Accept': 'text/csv',
      'Authorization': `Bearer ${token}`,
    }
  });

  if (!response.ok) {
    // Check if limit exceeded
    if (response.status === 403) {
      const errorData = await response.json().catch(() => ({}));
      if (errorData.code === 'EXPORT_LIMIT_EXCEEDED') {
        throw new Error('EXPORT_LIMIT_EXCEEDED');
      }
    }
    throw new Error(`Export failed: ${response.statusText}`);
  }

  const csv = await response.text();

  // Trigger browser download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  const blobUrl = URL.createObjectURL(blob);
  link.href = blobUrl;
  link.download = `snapignite_export_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  
  // CRITICAL: Delay cleanup to allow mobile browsers time to start the download
  // Revoking the URL immediately can cancel downloads on slower devices
  setTimeout(() => {
    URL.revokeObjectURL(blobUrl);
    link.remove();
  }, 1000);
}
