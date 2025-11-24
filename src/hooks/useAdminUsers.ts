import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastLogin: string;
  totalUploads: number;
  uploads7Days: number;
}

export function useAdminUsers(refreshTrigger?: Date) {
  return useQuery({
    queryKey: ["admin-users", refreshTrigger],
    queryFn: async (): Promise<AdminUser[]> => {
      // Get all user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Get upload counts for each user
      const usersWithData = await Promise.all(
        (userRoles || []).map(async (userRole) => {
          // Get total uploads
          const { count: totalUploads } = await supabase
            .from("upload_jobs")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userRole.user_id);

          // Get uploads in last 7 days
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          const { count: uploads7Days } = await supabase
            .from("upload_jobs")
            .select("*", { count: "exact", head: true })
            .eq("user_id", userRole.user_id)
            .gte("created_at", sevenDaysAgo.toISOString());

          return {
            id: userRole.user_id,
            name: "User", // TODO: Get from profiles table if exists
            email: userRole.user_id, // TODO: Get from auth.users via API
            role: userRole.role.toUpperCase(),
            status: "Active",
            lastLogin: new Date().toISOString(),
            totalUploads: totalUploads || 0,
            uploads7Days: uploads7Days || 0,
          };
        })
      );

      return usersWithData;
    },
    refetchInterval: 30000,
  });
}
