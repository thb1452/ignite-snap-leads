import { supabase } from "@/integrations/supabase/client";

export async function bulkAddToList(listId: string, propertyIds: string[]) {
  if (!propertyIds.length) return 0;
  const rows = propertyIds.map((pid) => ({ list_id: listId, property_id: pid }));
  const { error } = await supabase
    .from("list_properties")
    .upsert(rows, { onConflict: "list_id,property_id", ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
}
