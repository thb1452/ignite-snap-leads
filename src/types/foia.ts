// FOIA VA Platform TypeScript Types

export type FoiaRole = 'admin' | 'va';

export type FoiaRequestStatus =
  | 'pending'
  | 'sent'
  | 'rejected'
  | 'fulfilled'
  | 'no_portal'
  | 'needs_review';

export type TargetType = 'county_foia' | 'city_foia' | 'water_shutoff' | 'population_list';

export interface FoiaProfile {
  id: string;
  full_name: string;
  email: string;
  role: FoiaRole;
  is_active: boolean;
  created_at: string;
}

export interface PressAccount {
  id: string;
  name: string;
  domain: string;
  email: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface Target {
  id: string;
  jurisdiction_name: string;
  state: string;
  county: string | null;
  population: number | null;
  target_type: TargetType;
  foia_url: string | null;
  url_hash: string | null;
  source_file: string | null;
  is_duplicate: boolean;
  created_at: string;
}

export interface FoiaAssignment {
  id: string;
  target_id: string;
  va_id: string;
  assigned_at: string;
  assigned_by: string | null;
  // Joined fields
  target?: Target;
  va?: FoiaProfile;
}

export interface PressRotation {
  id: string;
  target_id: string;
  press_account_id: string;
  rotation_month: string; // "YYYY-MM"
  created_at: string;
  // Joined
  target?: Target;
  press_account?: PressAccount;
}

export interface FoiaRequest {
  id: string;
  target_id: string;
  va_id: string;
  press_account_id: string | null;
  status: FoiaRequestStatus;
  sent_at: string | null;
  response_received_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined
  target?: Target;
  va?: FoiaProfile;
  press_account?: PressAccount;
}

export interface FoiaInvite {
  id: string;
  email: string;
  invited_by: string | null;
  token: string;
  accepted: boolean;
  created_at: string;
  expires_at: string;
  // Joined
  inviter?: FoiaProfile;
}

// ---- UI / Form types ----

export interface ImportRow {
  jurisdiction_name: string;
  state: string;
  county?: string;
  population?: number;
  target_type: TargetType;
  foia_url?: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  errors: number;
  duplicates: string[];
}

export interface ColumnMapping {
  jurisdiction_name: string;
  state: string;
  county?: string;
  population?: string;
  target_type?: string;
  foia_url?: string;
}

export interface QueueItem extends Target {
  assignment?: FoiaAssignment;
  latest_request?: FoiaRequest;
  press_account_this_month?: PressAccount;
  portal_difficulty_score?: number | null;
}

export interface AdminStats {
  total_targets: number;
  requests_today: number;
  requests_this_week: number;
  pending_targets: number;
  va_breakdown: VABreakdown[];
}

export interface VABreakdown {
  va: FoiaProfile;
  sent_today: number;
  sent_this_week: number;
  total_sent: number;
  fulfilled: number;
  response_rate: number;
  assigned_count: number;
}

export const STATUS_LABELS: Record<FoiaRequestStatus, string> = {
  pending: 'Pending',
  sent: 'Sent',
  rejected: 'Rejected',
  fulfilled: 'Fulfilled',
  no_portal: 'No Portal',
  needs_review: 'Needs Review',
};

export const STATUS_COLORS: Record<FoiaRequestStatus, string> = {
  pending: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  fulfilled: 'bg-green-100 text-green-700',
  no_portal: 'bg-yellow-100 text-yellow-700',
  needs_review: 'bg-orange-100 text-orange-700',
};

export const TARGET_TYPE_LABELS: Record<TargetType, string> = {
  county_foia: 'County FOIA',
  city_foia: 'City FOIA',
  water_shutoff: 'Water Shutoff',
  population_list: 'Population List',
};
