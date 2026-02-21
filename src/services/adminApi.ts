/**
 * Admin API types and stub actions.
 *
 * Data-fetching for the admin console is handled by dedicated hooks
 * (useAdminStats, useAdminUploads, useAdminUsers, useAdminJurisdictions)
 * that query the database directly via the authenticated Supabase client.
 *
 * The action functions below are placeholders for features that require
 * dedicated backend functions. They throw immediately so callers surface
 * a clear error instead of silently failing.
 */

// ---- Types (still used by AdminConsole.tsx) ----

export interface AdminStats {
  totalLeads: number;
  leadsToday: number;
  todayTrend?: string;
  leads7Days: number;
  leads30Days: number;
  activeJurisdictions: number;
  uploads24h: number;
  activeUsers: number;
  geocodingQueued: number;
  geocodingRunning: number;
  geocodingCompleted: number;
  geocodingPercent: number;
  failedUploads: number;
  failedGeocodes: number;
  stuckJobs: number;
}

export interface Upload {
  id: string;
  timestamp: string;
  fileName: string;
  uploadedBy: string;
  jurisdiction: string;
  totalRows: number;
  savedRows: number;
  status: 'done' | 'failed' | 'processing';
  processingTime: string;
  errorCount: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'Admin' | 'VA' | 'Operator';
  status: 'Active' | 'Invited';
  lastLogin: string;
  totalUploads: number;
  uploads7Days: number;
}

export interface Jurisdiction {
  id: string;
  name: string;
  location: string;
  source: string;
  lastUpload: string;
  activeCount: number;
  totalCount: number;
  flag: string;
  flagColor: string;
}

export interface SystemLog {
  id: string;
  time: string;
  type: 'Geocoding' | 'Upload' | 'System';
  message: string;
  jobId: string;
}

export interface GeocodingStatus {
  queued: number;
  running: number;
  completed: number;
  coverage: number;
}

// ---- Stub action functions ----
// These throw explicitly so the UI can catch and display a toast.

export async function retryUpload(_uploadId: string): Promise<void> {
  throw new Error('Retry upload is not yet available. Use the reprocess button on the job detail page.');
}

export async function disableUser(_userId: string): Promise<void> {
  throw new Error('User management is not yet available from the admin console.');
}

export async function deactivateJurisdiction(_jurisdictionId: string): Promise<void> {
  throw new Error('Jurisdiction deactivation is not yet available.');
}

export async function retryFailedGeocodes(): Promise<void> {
  throw new Error('Bulk geocode retry is not yet available.');
}
