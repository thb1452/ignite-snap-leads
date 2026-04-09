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
  // Verify we have an active session first
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData?.session) {
    console.warn("getUserLists: no active session");
    return [];
  }

  // Direct query instead of RPC to avoid auth.uid() timing issues
  const { data, error } = await supabase
    .from("lead_lists")
    .select("id, name, created_at")
    .order("created_at", { ascending: false });

  if (error) throw error;

  // Attach property counts via a separate query
  const lists = data || [];
  if (lists.length === 0) return [];

  const { data: countData } = await supabase
    .from("list_properties")
    .select("list_id")
    .in("list_id", lists.map(l => l.id));

  const countMap: Record<string, number> = {};
  (countData || []).forEach(row => {
    countMap[row.list_id] = (countMap[row.list_id] || 0) + 1;
  });

  return lists.map(l => ({
    id: l.id,
    name: l.name,
    created_at: l.created_at,
    property_count: countMap[l.id] || 0,
  }));
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
  // Get total count first
  const { count, error: countError } = await supabase
    .from("list_properties")
    .select("id", { count: "exact", head: true })
    .eq("list_id", listId);

  if (countError) throw countError;
  const total = count ?? 0;

  if (total === 0) {
    return { success: true, items: [], total: 0, page, page_size: pageSize };
  }

  // Fetch paginated property IDs
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const { data: listRows, error: listError } = await supabase
    .from("list_properties")
    .select("property_id, added_at")
    .eq("list_id", listId)
    .order("added_at", { ascending: false })
    .range(from, to);

  if (listError) throw listError;
  if (!listRows || listRows.length === 0) {
    return { success: true, items: [], total, page, page_size: pageSize };
  }

  const propertyIds = listRows.map(r => r.property_id).filter(Boolean) as string[];

  // Fetch property details
  const { data: props, error: propsError } = await supabase
    .from("properties")
    .select("id, address, city, state, zip, snap_score, total_violations, open_violations, enforcement_type, opportunity_class, street_name, street_number")
    .in("id", propertyIds);

  if (propsError) throw propsError;

  // Build lookup and preserve order
  const propMap = new Map((props || []).map(p => [p.id, p]));
  const addedAtMap = new Map(listRows.map(r => [r.property_id, r.added_at]));

  const items: ListProperty[] = propertyIds
    .map(pid => {
      const p = propMap.get(pid);
      if (!p) return null;
      return {
        id: p.id,
        address: p.address,
        city: p.city,
        state: p.state,
        zip: p.zip,
        snap_score: p.snap_score,
        total_violations: p.total_violations,
        open_violations: p.open_violations,
        enforcement_type: p.enforcement_type,
        opportunity_class: p.opportunity_class,
        added_at: addedAtMap.get(pid) || "",
        street_name: (p as any).street_name || null,
        street_number: (p as any).street_number || null,
      } as ListProperty;
    })
    .filter(Boolean) as ListProperty[];

  return { success: true, items, total, page, page_size: pageSize };
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
