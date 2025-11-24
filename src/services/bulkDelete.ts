import { supabase } from "@/integrations/supabase/client";

export async function bulkDeletePropertiesByCityOrState(cityOrState: string): Promise<{ deleted: number }> {
  const { data, error } = await supabase.functions.invoke('bulk-delete-properties', {
    body: { cityOrState },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  
  return { deleted: data.deleted };
}