import { supabase } from "@/integrations/supabase/client";

export interface Jurisdiction {
  id: string;
  name: string;
  city: string;
  county: string | null;
  state: string;
  default_zip_range: string | null;
  created_at: string;
}

export async function fetchJurisdictions(): Promise<Jurisdiction[]> {
  const { data, error } = await supabase
    .from("jurisdictions")
    .select("*")
    .order("name");

  if (error) {
    console.error("Error fetching jurisdictions:", error);
    throw error;
  }

  return data || [];
}

export async function getJurisdiction(id: string): Promise<Jurisdiction | null> {
  const { data, error } = await supabase
    .from("jurisdictions")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    console.error("Error fetching jurisdiction:", error);
    throw error;
  }

  return data;
}
