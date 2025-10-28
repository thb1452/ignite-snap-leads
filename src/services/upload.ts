import { supabase } from "@/integrations/supabase/client";

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

  // Group rows by address to avoid duplicate properties
  const propertiesByAddress = new Map<string, CSVRow[]>();
  
  rows.forEach((row, index) => {
    if (!row.address || !row.city || !row.violation) {
      result.errors.push(`Row ${index + 1}: Missing required fields (address, city, or violation)`);
      return;
    }

    const addressKey = `${row.address}|${row.city}|${row.state}|${row.zip}`.toLowerCase();
    if (!propertiesByAddress.has(addressKey)) {
      propertiesByAddress.set(addressKey, []);
    }
    propertiesByAddress.get(addressKey)!.push(row);
  });

  // Process each unique property
  for (const [addressKey, propertyRows] of propertiesByAddress.entries()) {
    const firstRow = propertyRows[0];
    
    try {
      // Check if property already exists
      const { data: existingProperty, error: searchError } = await supabase
        .from("properties")
        .select("id")
        .ilike("address", firstRow.address!)
        .ilike("city", firstRow.city!)
        .limit(1)
        .maybeSingle();

      if (searchError) {
        result.errors.push(`Error searching for property ${firstRow.address}: ${searchError.message}`);
        continue;
      }

      let propertyId: string;

      if (existingProperty) {
        // Use existing property
        propertyId = existingProperty.id;
      } else {
        // Create new property
        const { data: newProperty, error: propertyError } = await supabase
          .from("properties")
          .insert({
            address: firstRow.address!,
            city: firstRow.city!,
            state: firstRow.state || "",
            zip: firstRow.zip || "",
            latitude: null, // Can be geocoded later
            longitude: null,
            snap_score: null, // Can be calculated later
            snap_insight: null,
          })
          .select("id")
          .single();

        if (propertyError || !newProperty) {
          result.errors.push(`Failed to create property ${firstRow.address}: ${propertyError?.message}`);
          continue;
        }

        propertyId = newProperty.id;
        result.propertiesCreated++;
      }

      // Insert all violations for this property
      for (const row of propertyRows) {
        try {
          const openedDate = row.opened_date ? new Date(row.opened_date) : null;
          const lastUpdated = row.last_updated ? new Date(row.last_updated) : null;
          const daysOpen = openedDate 
            ? Math.floor((Date.now() - openedDate.getTime()) / (1000 * 60 * 60 * 24))
            : null;

          const { error: violationError } = await supabase
            .from("violations")
            .insert({
              property_id: propertyId,
              case_id: row.case_id || null,
              violation_type: row.violation!,
              description: null,
              status: row.status || "Open",
              opened_date: openedDate ? openedDate.toISOString().split('T')[0] : null,
              last_updated: lastUpdated ? lastUpdated.toISOString().split('T')[0] : null,
              days_open: daysOpen,
            });

          if (violationError) {
            result.errors.push(
              `Failed to create violation for ${row.address} (Case: ${row.case_id}): ${violationError.message}`
            );
          } else {
            result.violationsCreated++;
          }
        } catch (err: any) {
          result.errors.push(`Error processing violation: ${err.message}`);
        }
      }
    } catch (err: any) {
      result.errors.push(`Error processing property ${firstRow.address}: ${err.message}`);
    }
  }

  return result;
}
