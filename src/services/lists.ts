import { supabase } from "@/integrations/supabase/externalClient";

export async function bulkAddToList(listId: string, propertyIds: string[]) {
  if (!propertyIds.length) return 0;
  const rows = propertyIds.map((pid) => ({ list_id: listId, property_id: pid }));
  const { error } = await supabase
    .from("list_properties")
    .upsert(rows, { onConflict: "list_id,property_id", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}

export interface AddFilteredToListParams {
  listId: string;
  city?: string | null;
  state?: string | null;
  minScore?: number | null;
  maxScore?: number | null;
  jurisdictionId?: string | null;
  enforcementType?: string | null;
  limit?: number;
}

export interface AddFilteredResult {
  success: boolean;
  inserted?: number;
  total_matching?: number;
  limit_applied?: number;
  error?: string;
}

export async function addFilteredToList(params: AddFilteredToListParams): Promise<AddFilteredResult> {
  const { data, error } = await supabase.rpc("fn_add_filtered_to_list", {
    p_list_id: params.listId,
    p_city: params.city || null,
    p_state: params.state || null,
    p_min_score: params.minScore ?? null,
    p_max_score: params.maxScore ?? null,
    p_jurisdiction_id: params.jurisdictionId || null,
    p_enforcement_type: params.enforcementType || null,
    p_limit: params.limit ?? 25000,
  });

  if (error) throw error;
  return data as unknown as AddFilteredResult;
}

export interface UserList {
  id: string;
  name: string;
  created_at: string;
  property_count: number;
}

export async function getUserLists(): Promise<UserList[]> {
  const { data, error } = await supabase.rpc("fn_get_user_lists");
  if (error) throw error;
  return (data || []) as UserList[];
}

export interface ListProperty {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  total_violations: number | null;
  open_violations: number | null;
  enforcement_type: string;
  opportunity_class: string | null;
  added_at: string;
}

export interface ListPropertiesResult {
  success: boolean;
  items: ListProperty[];
  total: number;
  page: number;
  page_size: number;
  error?: string;
}

export async function getListProperties(
  listId: string,
  page: number = 1,
  pageSize: number = 50
): Promise<ListPropertiesResult> {
  const { data, error } = await supabase.rpc("fn_get_list_properties", {
    p_list_id: listId,
    p_page: page,
    p_page_size: pageSize,
  });

  if (error) throw error;
  return data as unknown as ListPropertiesResult;
}

export async function createList(name: string): Promise<string> {
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) throw new Error("Not authenticated");

  const { data, error } = await supabase
    .from("lead_lists")
    .insert({ name, user_id: userData.user.id })
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

export async function removeFromList(listId: string, propertyIds: string[]) {
  if (!propertyIds.length) return 0;
  
  const { error } = await supabase
    .from("list_properties")
    .delete()
    .eq("list_id", listId)
    .in("property_id", propertyIds);

  if (error) throw error;
  return propertyIds.length;
}
