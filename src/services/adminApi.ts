const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Get auth token from localStorage
const getAuthHeaders = () => {
  const token = localStorage.getItem('authToken');
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` }),
  };
};

// Generic fetch wrapper with error handling
async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`API call failed for ${endpoint}:`, error);
    throw error;
  }
}

// API Response Types
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

// API Functions
export async function fetchAdminStats(): Promise<AdminStats> {
  // Backend endpoint not implemented yet
  console.log('Fetching admin stats from:', `${API_BASE}/api/admin/stats`);
  return await apiFetch<AdminStats>('/api/admin/stats');
}

export async function fetchUploads(filters?: {
  status?: string;
  user?: string;
  page?: number;
  limit?: number;
}): Promise<{ uploads: Upload[]; total: number }> {
  // Backend endpoint not implemented yet
  const queryParams = new URLSearchParams();
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.user) queryParams.append('user', filters.user);
  if (filters?.page) queryParams.append('page', filters.page.toString());
  if (filters?.limit) queryParams.append('limit', filters.limit.toString());
  
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  console.log('Fetching uploads from:', `${API_BASE}/api/admin/uploads${query}`);
  return await apiFetch<{ uploads: Upload[]; total: number }>(`/api/admin/uploads${query}`);
}

export async function fetchUsers(): Promise<{ users: User[] }> {
  // Backend endpoint not implemented yet
  console.log('Fetching users from:', `${API_BASE}/api/admin/users`);
  return await apiFetch<{ users: User[] }>('/api/admin/users');
}

export async function fetchJurisdictions(): Promise<{ jurisdictions: Jurisdiction[] }> {
  // Backend endpoint not implemented yet
  console.log('Fetching jurisdictions from:', `${API_BASE}/api/admin/jurisdictions`);
  return await apiFetch<{ jurisdictions: Jurisdiction[] }>('/api/admin/jurisdictions');
}

export async function fetchSystemLogs(filters?: { type?: string }): Promise<{ logs: SystemLog[] }> {
  // Backend endpoint not implemented yet
  const queryParams = new URLSearchParams();
  if (filters?.type) queryParams.append('type', filters.type);
  
  const query = queryParams.toString() ? `?${queryParams.toString()}` : '';
  console.log('Fetching logs from:', `${API_BASE}/api/admin/logs${query}`);
  return await apiFetch<{ logs: SystemLog[] }>(`/api/admin/logs${query}`);
}

export async function fetchGeocodingStatus(): Promise<GeocodingStatus> {
  // Backend endpoint not implemented yet
  console.log('Fetching geocoding status from:', `${API_BASE}/api/admin/geocoding-status`);
  return await apiFetch<GeocodingStatus>('/api/admin/geocoding-status');
}

// Action Functions
export async function retryUpload(uploadId: string): Promise<void> {
  // Backend endpoint not implemented yet
  console.log('Retrying upload:', uploadId);
  return await apiFetch<void>(`/api/admin/uploads/${uploadId}/retry`, {
    method: 'POST',
  });
}

export async function disableUser(userId: string): Promise<void> {
  // Backend endpoint not implemented yet
  console.log('Disabling user:', userId);
  return await apiFetch<void>(`/api/admin/users/${userId}/disable`, {
    method: 'POST',
  });
}

export async function deactivateJurisdiction(jurisdictionId: string): Promise<void> {
  // Backend endpoint not implemented yet
  console.log('Deactivating jurisdiction:', jurisdictionId);
  return await apiFetch<void>(`/api/admin/jurisdictions/${jurisdictionId}/deactivate`, {
    method: 'POST',
  });
}

export async function retryFailedGeocodes(): Promise<void> {
  // Backend endpoint not implemented yet
  console.log('Retrying failed geocodes');
  return await apiFetch<void>('/api/admin/geocoding/retry-failed', {
    method: 'POST',
  });
}
