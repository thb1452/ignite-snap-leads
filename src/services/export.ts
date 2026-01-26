import { supabase } from "@/integrations/supabase/client";

interface ExportParams {
  city?: string;
  minScore?: number;
  maxScore?: number;
  jurisdictionId?: string;
  propertyIds?: string[];
}

export async function exportFilteredCsv(params: ExportParams) {
  // Get user session token for authenticated request
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Please sign in to export data");
  }

  const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-csv`;

  // Use POST for large exports (many propertyIds), GET for small/filter-based exports
  // URL length limits (~2KB) make GET unreliable for >50 property IDs
  const usePost = params.propertyIds && params.propertyIds.length > 50;

  let response: Response;

  if (usePost) {
    // POST with JSON body for large exports
    response = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'Accept': 'text/csv',
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        city: params.city,
        minScore: params.minScore,
        maxScore: params.maxScore,
        jurisdictionId: params.jurisdictionId,
        propertyIds: params.propertyIds,
      }),
    });
  } else {
    // GET with query params for small exports
    const qs = new URLSearchParams();
    if (params.city) qs.set("city", params.city);
    if (params.minScore != null) qs.set("minScore", String(params.minScore));
    if (params.maxScore != null) qs.set("maxScore", String(params.maxScore));
    if (params.jurisdictionId) qs.set("jurisdictionId", params.jurisdictionId);
    if (params.propertyIds?.length) qs.set("propertyIds", params.propertyIds.join(","));

    response = await fetch(`${baseUrl}?${qs.toString()}`, {
      method: 'GET',
      headers: {
        'Accept': 'text/csv',
        'Authorization': `Bearer ${token}`,
      },
    });
  }

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
  link.href = URL.createObjectURL(blob);
  link.download = `snapignite_export_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}
