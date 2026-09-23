import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileGateway } from "./profileReadiness";
import { withTimeout } from "@/lib/withTimeout";

const TIMEOUT_MS = 12000;

/** Uses only the existing customer client. No service key, identity creation or financial writes. */
export function createProfileGateway(client: SupabaseClient): ProfileGateway {
  return {
    async verifyUser() {
      const result = await withTimeout(client.auth.getUser(), TIMEOUT_MS, "Account check timed out");
      return { user: result.data.user, error: result.error };
    },
    async findProfiles(userId, limit) {
      return await withTimeout(client.from("profiles")
        .select("id,user_id,org_id,full_name,created_at").eq("user_id", userId).limit(limit),
      TIMEOUT_MS, "Profile check timed out");
    },
    async findOrganizations(organizationId, limit) {
      return await withTimeout(client.from("organizations")
        .select("id,name").eq("id", organizationId).limit(limit), TIMEOUT_MS, "Account check timed out");
    },
    async updateName(profileId, userId, name) {
      return await withTimeout(client.from("profiles").update({ full_name: name })
        .eq("id", profileId).eq("user_id", userId).select("id"), TIMEOUT_MS, "Account update timed out");
    },
  };
}
