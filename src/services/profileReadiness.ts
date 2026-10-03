/** Account/profile checks only. A ready profile never grants property or export access. */
export interface ReadyProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  org_id: string;
  created_at: string;
}

export interface ReadyOrganization { id: string; name: string }
export type ProfileBlocker = "signed_out" | "session_changed" | "email_unverified" |
  "profile_missing" | "profile_ambiguous" | "profile_invalid" |
  "organization_missing" | "organization_ambiguous" | "unavailable";

export type ProfileReadiness = {
  status: "ready"; profile: ReadyProfile; organization: ReadyOrganization;
} | { status: ProfileBlocker; profile: null; organization: null };

type ReadResult = { data: unknown; error: unknown };
export interface ProfileGateway {
  verifyUser(): Promise<{ user: unknown; error: unknown }>;
  findProfiles(userId: string, limit: 2): Promise<ReadResult>;
  findOrganizations(organizationId: string, limit: 2): Promise<ReadResult>;
  updateName(profileId: string, userId: string, name: string): Promise<ReadResult>;
}

const isId = (value: unknown): value is string => typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) &&
  value !== "00000000-0000-0000-0000-000000000000";
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
const blocked = (status: ProfileBlocker): ProfileReadiness => ({ status, profile: null, organization: null });

/** Every read is scoped to the freshly verified Auth UUID; cached user metadata is not a profile. */
export async function loadProfileReadiness(gateway: ProfileGateway, expectedUserId: string): Promise<ProfileReadiness> {
  if (!isId(expectedUserId)) return blocked("signed_out");
  try {
    const auth = await gateway.verifyUser();
    if (auth.error) return blocked("unavailable");
    if (!object(auth.user) || !isId(auth.user.id) || auth.user.is_anonymous === true) return blocked("signed_out");
    if (auth.user.id !== expectedUserId) return blocked("session_changed");
    if (typeof auth.user.email !== "string" || !auth.user.email.trim() ||
        !timestamp(auth.user.email_confirmed_at)) return blocked("email_unverified");

    const rows = await gateway.findProfiles(expectedUserId, 2);
    if (rows.error || !Array.isArray(rows.data)) return blocked("unavailable");
    if (rows.data.length === 0) return blocked("profile_missing");
    if (rows.data.length !== 1) return blocked("profile_ambiguous");
    const row: unknown = rows.data[0];
    if (!object(row) || !isId(row.id) || row.user_id !== expectedUserId ||
        !isId(row.org_id) || !timestamp(row.created_at) ||
        !(row.full_name === null || typeof row.full_name === "string")) return blocked("profile_invalid");

    const orgs = await gateway.findOrganizations(row.org_id, 2);
    if (orgs.error || !Array.isArray(orgs.data)) return blocked("unavailable");
    if (orgs.data.length === 0) return blocked("organization_missing");
    if (orgs.data.length !== 1) return blocked("organization_ambiguous");
    const org: unknown = orgs.data[0];
    if (!object(org) || org.id !== row.org_id || typeof org.name !== "string" || !org.name.trim())
      return blocked("organization_missing");

    return { status: "ready", profile: { id: row.id, user_id: expectedUserId, org_id: row.org_id,
      full_name: row.full_name as string | null, created_at: row.created_at, email: auth.user.email },
      organization: { id: row.org_id, name: org.name } };
  } catch {
    return blocked("unavailable");
  }
}

export class ProfileUpdateError extends Error {
  constructor() { super("Your account details could not be updated. Refresh and try again."); this.name = "ProfileUpdateError"; }
}

/** Revalidates the account and unique profile before updating the single safe name column. */
export async function saveProfileName(gateway: ProfileGateway, expectedUserId: string,
  expectedProfileId: string, input: string): Promise<void> {
  if (!isId(expectedProfileId) || typeof input !== "string" ||
      input.trim().length < 1 || input.trim().length > 200 ||
      [...input].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127))
    throw new ProfileUpdateError();
  const state = await loadProfileReadiness(gateway, expectedUserId);
  if (state.status !== "ready" || state.profile.id !== expectedProfileId) throw new ProfileUpdateError();
  try {
    const result = await gateway.updateName(expectedProfileId, expectedUserId, input.trim());
    if (result.error || !Array.isArray(result.data) || result.data.length !== 1 ||
        !object(result.data[0]) || result.data[0].id !== expectedProfileId) throw new ProfileUpdateError();
  } catch {
    throw new ProfileUpdateError();
  }
}

export function profileReadinessMessage(status: ProfileReadiness["status"]): string {
  if (status === "ready") return "Your account details are available.";
  if (status === "signed_out" || status === "session_changed") return "Sign in again to view your account details.";
  if (status === "email_unverified") return "Verify your email to finish setting up your account.";
  if (status === "unavailable") return "We could not check your account details. Try again shortly.";
  return "Your account setup needs attention. Contact support before changing your details.";
}
