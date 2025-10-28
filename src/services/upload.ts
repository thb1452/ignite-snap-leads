import { supabase } from "@/integrations/supabase/client";
import { callFn } from "@/integrations/http/functions";

interface CSVRow {
  case_id?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  violation?: string;
  status?: string;
  opened_date?: string;
  last_updated?: string;
}

interface UploadResult {
  propertiesCreated: number;
  violationsCreated: number;
  errors: string[];
}

/**
 * Upload CSV violation data to the database
 * Creates properties and violations from parsed CSV rows
 * Optimized for batch operations
 */
export async function uploadViolationCSV(rows: CSVRow[]): Promise<UploadResult> {
  const result: UploadResult = {
    propertiesCreated: 0,
    violationsCreated: 0,
    errors: [],
  };

  if (rows.length === 0) {
    throw new Error("No data to upload");
  }

  // Step 1: Prepare unique properties and group violations
  const propertyMap = new Map<string, { row: CSVRow; violations: CSVRow[] }>();
  
  rows.forEach((row, index) => {
    if (!row.address || !row.city || !row.violation) {
      result.errors.push(`Row ${index + 1}: Missing required fields (address, city, or violation)`);
      return;
    }

    const addressKey = `${row.address}|${row.city}|${row.state}|${row.zip}`.toLowerCase();
    if (!propertyMap.has(addressKey)) {
      propertyMap.set(addressKey, { row, violations: [] });
    }
    propertyMap.get(addressKey)!.violations.push(row);
  });

  // Step 2: Check which properties already exist (batch query)
  const addresses = Array.from(propertyMap.values()).map(p => p.row.address!);
  const cities = Array.from(propertyMap.values()).map(p => p.row.city!);
  
  const { data: existingProperties, error: searchError } = await supabase
    .from("properties")
    .select("id, address, city, state, zip")
    .or(
      Array.from(propertyMap.values())
        .map(p => `and(address.ilike.${p.row.address},city.ilike.${p.row.city})`)
        .join(',')
    );

  if (searchError) {
    console.error("Error searching for existing properties:", searchError);
  }

  // Map existing properties by address key
  const existingPropertyMap = new Map<string, string>();
  (existingProperties || []).forEach(prop => {
    const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
    existingPropertyMap.set(key, prop.id);
  });

  // Step 3: Bulk insert new properties
  const newProperties = Array.from(propertyMap.entries())
    .filter(([key]) => !existingPropertyMap.has(key))
    .map(([_, { row }]) => ({
      address: row.address!,
      city: row.city!,
      state: row.state || "",
      zip: row.zip || "",
      latitude: null,
      longitude: null,
      snap_score: null,
      snap_insight: null,
    }));

  let createdPropertyIds: { id: string; address: string; city: string; state: string; zip: string }[] = [];
  
  if (newProperties.length > 0) {
    const { data: insertedProperties, error: insertError } = await supabase
      .from("properties")
      .insert(newProperties)
      .select("id, address, city, state, zip");

    if (insertError) {
      result.errors.push(`Failed to create properties: ${insertError.message}`);
      throw new Error("Failed to create properties");
    }

    createdPropertyIds = insertedProperties || [];
    result.propertiesCreated = createdPropertyIds.length;

    // Add newly created properties to the map
    createdPropertyIds.forEach(prop => {
      const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
      existingPropertyMap.set(key, prop.id);
    });
  }

  // Step 4: Bulk insert all violations
  const allViolations: any[] = [];
  
  for (const [addressKey, { violations }] of propertyMap.entries()) {
    const propertyId = existingPropertyMap.get(addressKey);
    
    if (!propertyId) {
      result.errors.push(`Could not find property ID for ${addressKey}`);
      continue;
    }

    violations.forEach(row => {
      const openedDate = row.opened_date ? new Date(row.opened_date) : null;
      const lastUpdated = row.last_updated ? new Date(row.last_updated) : null;
      const daysOpen = openedDate 
        ? Math.floor((Date.now() - openedDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      allViolations.push({
        property_id: propertyId,
        case_id: row.case_id || null,
        violation_type: row.violation!,
        description: null,
        status: row.status || "Open",
        opened_date: openedDate ? openedDate.toISOString().split('T')[0] : null,
        last_updated: lastUpdated ? lastUpdated.toISOString().split('T')[0] : null,
        days_open: daysOpen,
      });
    });
  }

  // Insert all violations in one batch
  if (allViolations.length > 0) {
    const { error: violationError } = await supabase
      .from("violations")
      .insert(allViolations);

    if (violationError) {
      result.errors.push(`Failed to create violations: ${violationError.message}`);
      throw new Error("Failed to create violations");
    }

    result.violationsCreated = allViolations.length;
  }

  // Generate AI insights for all properties (async, non-blocking)
  if (existingPropertyMap.size > 0) {
    const allPropertyIds = Array.from(existingPropertyMap.values());
    
    // Fire and forget - don't wait for insights to complete
    callFn("generate-insights", { propertyIds: allPropertyIds }).catch(error => {
      console.error("Error generating insights:", error);
      // Don't fail the upload if insights fail
    });
  }

  return result;
}
