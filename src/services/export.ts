import { callFn } from "@/integrations/http/functions";

export async function exportFilteredCsv(params: { city?: string; minScore?: number; maxScore?: number }) {
  // Call function as GET with query string to stream CSV
  const qs = new URLSearchParams();
  if (params.city) qs.set("city", params.city);
  if (params.minScore != null) qs.set("minScore", String(params.minScore));
  if (params.maxScore != null) qs.set("maxScore", String(params.maxScore));

  // Use fetch directly to get text/csv
  const csv = await callFn<string>("export-csv", undefined, { method: "GET" as any, headers: { Accept: "text/csv" } })
    .catch(async () => {
      // Fallback to direct fetch with query params (depends on your function signature)
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-csv?${qs.toString()}`;
      const res = await fetch(url, { headers: { "Accept": "text/csv" } });
      if (!res.ok) throw new Error("Export failed");
      return await res.text();
    });

  // trigger browser download
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `snapignite_export_${Date.now()}.csv`;
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(link.href);
  link.remove();
}
