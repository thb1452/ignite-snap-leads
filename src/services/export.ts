import { supabase, supabaseUrl } from "@/integrations/supabase/externalClient";
import { queryClient } from "@/lib/query";
import { logExportEvent } from "./exportLog";

interface ExportParams {
  city?: string;
  minScore?: number;
  maxScore?: number;
  jurisdictionId?: string;
  propertyIds?: string[];
  expectedPropertyCount?: number;  // For quota validation - tracks per property, not per operation
  // Optional filter context for export logging
  stateFilter?: string;
  cityFilter?: string;
  filters?: Record<string, unknown>;
}

/** Thrown message when server returns export quota / plan limit (see exportFilteredCsv). */
export const EXPORT_LIMIT_EXCEEDED = "EXPORT_LIMIT_EXCEEDED";

type ExportToastVariant = "destructive" | "default";

/** User-facing toast copy for export errors (avoids generic "Export failed" when limit is hit). */
export function getExportErrorToast(err: unknown): {
  title: string;
  description: string;
  variant: ExportToastVariant;
} {
  const message = err instanceof Error ? err.message : String(err ?? "");

  if (message === EXPORT_LIMIT_EXCEEDED) {
    return {
      title: "Export limit reached",
      description:
        "You've used all CSV exports included in your plan for this billing period. Upgrade your plan to get more, or wait until your limit resets.",
      variant: "destructive",
    };
  }
  if (message === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
    return {
      title: "Trial export limit reached",
      description: "You've used all exports included in your trial. Upgrade to continue exporting.",
      variant: "destructive",
    };
  }
  if (message === "TRIAL_EXPIRED") {
    return {
      title: "Trial ended",
      description: "Your trial has expired. Subscribe to keep exporting leads.",
      variant: "destructive",
    };
  }
  if (message === "NO_SUBSCRIPTION") {
    return {
      title: "Subscription required",
      description: "An active subscription or credits are required to export.",
      variant: "destructive",
    };
  }
  if (message.startsWith("Export timed out")) {
    return {
      title: "Export timed out",
      description: message,
      variant: "destructive",
    };
  }

  const blankReason = /^Export failed:\s*$/i.test(message);
  const description = blankReason
    ? "The export could not be completed. Try again, or export fewer properties at once."
    : message || "Something went wrong. Please try again.";

  return {
    title: "Export failed",
    description,
    variant: "destructive",
  };
}

export async function exportFilteredCsv(params: ExportParams) {
  // Get user session token for authenticated request
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;

  if (!token) {
    throw new Error("Please sign in to export data");
  }

  const baseUrl = `${supabaseUrl}/functions/v1/export-csv`;

  // Use POST for large exports (many propertyIds), GET for small/filter-based exports
  // URL length limits (~2KB) make GET unreliable for >50 property IDs
  const usePost = params.propertyIds && params.propertyIds.length > 50;

  const propertyCount = params.propertyIds?.length ?? 0;
  const timeoutMs =
    propertyCount > 4000 ? 900_000 : propertyCount > 1500 ? 600_000 : propertyCount > 200 ? 300_000 : 120_000;

  const fetchExport = (url: string, init: RequestInit) => {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    return fetch(url, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
  };

  let response: Response;

  try {
    if (usePost) {
      response = await fetchExport(baseUrl, {
        method: 'POST',
        headers: {
          Accept: 'text/csv',
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          city: params.city,
          minScore: params.minScore,
          maxScore: params.maxScore,
          jurisdictionId: params.jurisdictionId,
          propertyIds: params.propertyIds,
          expectedPropertyCount: params.expectedPropertyCount || params.propertyIds?.length,
        }),
      });
    } else {
      const qs = new URLSearchParams();
      if (params.city) qs.set("city", params.city);
      if (params.minScore != null) qs.set("minScore", String(params.minScore));
      if (params.maxScore != null) qs.set("maxScore", String(params.maxScore));
      if (params.jurisdictionId) qs.set("jurisdictionId", params.jurisdictionId);
      if (params.propertyIds?.length) qs.set("propertyIds", params.propertyIds.join(","));
      const expectedCount = params.expectedPropertyCount || params.propertyIds?.length;
      if (expectedCount) qs.set("expectedPropertyCount", String(expectedCount));

      response = await fetchExport(`${baseUrl}?${qs.toString()}`, {
        method: 'GET',
        headers: {
          Accept: 'text/csv',
          Authorization: `Bearer ${token}`,
        },
      });
    }
  } catch (e: unknown) {
    const name = e instanceof Error ? e.name : '';
    if (name === 'AbortError') {
      throw new Error('Export timed out. Try a smaller selection or retry.');
    }
    throw e;
  }

  if (!response.ok) {
    const bodyText = await response.text();
    let errorData: { code?: string; error?: string; message?: string } = {};
    if (bodyText) {
      try {
        errorData = JSON.parse(bodyText) as typeof errorData;
      } catch {
        /* non-JSON error body (e.g. gateway HTML) */
      }
    }

    const code = errorData.code;
    if (code === "EXPORT_LIMIT_EXCEEDED" || code === "CREDIT_LIMIT_EXCEEDED") {
      throw new Error(EXPORT_LIMIT_EXCEEDED);
    }
    if (code === "TRIAL_EXPORT_LIMIT_EXCEEDED") {
      throw new Error("TRIAL_EXPORT_LIMIT_EXCEEDED");
    }
    if (code === "TRIAL_EXPIRED") {
      throw new Error("TRIAL_EXPIRED");
    }
    if (code === "NO_SUBSCRIPTION") {
      throw new Error("NO_SUBSCRIPTION");
    }

    if (response.status === 403) {
      const hint = (errorData.message || errorData.error || bodyText || "").toLowerCase();
      if (hint.includes("limit") || hint.includes("quota") || hint.includes("credit")) {
        throw new Error(EXPORT_LIMIT_EXCEEDED);
      }
    }

    const detail =
      (typeof errorData.message === "string" && errorData.message.trim()) ||
      (typeof errorData.error === "string" && errorData.error.trim()) ||
      (bodyText && bodyText.length < 400 ? bodyText.trim() : "") ||
      response.statusText?.trim() ||
      "";

    throw new Error(detail ? `Export failed: ${detail}` : "Export failed");
  }

  const csv = await response.text();

  // Server updated usage; refresh cached subscription/trial/credits so Settings counters update without a full reload.
  void queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
  void queryClient.invalidateQueries({ queryKey: ["trial-status"] });
  void queryClient.invalidateQueries({ queryKey: ["credits"] });
  void queryClient.invalidateQueries({ queryKey: ["free-unlocks"] });
  void queryClient.invalidateQueries({ queryKey: ["user", "credits"] });
  // Use refetchQueries (not just invalidate) so properties visually unblur immediately after export.
  void queryClient.refetchQueries({ queryKey: ["unlocked-properties"] });

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

  // Fire-and-forget: log export event for admin dashboard
  const rowCount = params.expectedPropertyCount || params.propertyIds?.length || 0;
  logExportEvent({
    rowCount,
    stateFilter: params.stateFilter,
    cityFilter: params.cityFilter || params.city,
    filters: params.filters,
  });
}
