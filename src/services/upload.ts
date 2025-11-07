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
  duplicates: string[];
}

interface UploadProgress {
  stage: 'validating' | 'checking' | 'creating-properties' | 'creating-violations' | 'complete';
  current: number;
  total: number;
  message: string;
}

/**
 * Upload CSV violation data to the database
 * Creates properties and violations from parsed CSV rows
 * Optimized for batch operations with progress tracking
 */
export async function uploadViolationCSV(
  rows: CSVRow[],
  onProgress?: (progress: UploadProgress) => void
): Promise<UploadResult> {
  const result: UploadResult = {
    propertiesCreated: 0,
    violationsCreated: 0,
    errors: [],
    duplicates: [],
  };

  if (rows.length === 0) {
    throw new Error("No data to upload");
  }

  onProgress?.({ stage: 'validating', current: 0, total: rows.length, message: 'Checking for duplicates...' });

  // Step 1: Check for duplicate case_ids and prepare unique properties
  const caseIdSet = new Set<string>();
  const duplicateCaseIds = new Set<string>();
  
  rows.forEach((row) => {
    if (row.case_id) {
      if (caseIdSet.has(row.case_id)) {
        duplicateCaseIds.add(row.case_id);
      } else {
        caseIdSet.add(row.case_id);
      }
    }
  });

  if (duplicateCaseIds.size > 0) {
    result.duplicates = Array.from(duplicateCaseIds);
    result.errors.push(`Found ${duplicateCaseIds.size} duplicate case IDs in CSV`);
  }

  onProgress?.({ stage: 'validating', current: rows.length, total: rows.length, message: 'Grouping properties...' });

  // Step 2: Prepare unique properties and group violations
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

  onProgress?.({ stage: 'checking', current: 0, total: propertyMap.size, message: 'Checking existing properties...' });

  // Step 3: Check which properties already exist (optimized for large datasets)
  const uniqueAddresses = Array.from(new Set(Array.from(propertyMap.values()).map(p => p.row.address!)));
  const uniqueCities = Array.from(new Set(Array.from(propertyMap.values()).map(p => p.row.city!)));
  
  // Query properties by address and city in batches to avoid query length limits
  const { data: existingProperties, error: searchError } = await supabase
    .from("properties")
    .select("id, address, city, state, zip")
    .in("address", uniqueAddresses)
    .in("city", uniqueCities);

  if (searchError) {
    console.error("Error searching for existing properties:", searchError);
    result.errors.push(`Property lookup failed: ${searchError.message}`);
  }

  // Map existing properties by address key
  const existingPropertyMap = new Map<string, string>();
  (existingProperties || []).forEach(prop => {
    const key = `${prop.address}|${prop.city}|${prop.state}|${prop.zip}`.toLowerCase();
    existingPropertyMap.set(key, prop.id);
  });

  onProgress?.({ stage: 'creating-properties', current: 0, total: propertyMap.size, message: 'Creating new properties...' });

  // Step 4: Bulk insert new properties
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

  // Step 5: Bulk insert all violations in batches (max 1000 per batch for reliability)
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

  onProgress?.({ stage: 'creating-violations', current: 0, total: allViolations.length, message: 'Preparing violations...' });

  // Insert violations in batches to avoid payload size limits
  if (allViolations.length > 0) {
    const BATCH_SIZE = 1000;
    for (let i = 0; i < allViolations.length; i += BATCH_SIZE) {
      const batch = allViolations.slice(i, i + BATCH_SIZE);
      
      onProgress?.({ 
        stage: 'creating-violations', 
        current: i + batch.length, 
        total: allViolations.length, 
        message: `Uploading violations (${i + batch.length}/${allViolations.length})...` 
      });

      const { error: violationError } = await supabase
        .from("violations")
        .insert(batch);

      if (violationError) {
        result.errors.push(`Failed to create violations batch ${i}-${i + batch.length}: ${violationError.message}`);
        throw new Error("Failed to create violations");
      }
    }

    result.violationsCreated = allViolations.length;
  }

  onProgress?.({ stage: 'complete', current: allViolations.length, total: allViolations.length, message: 'Upload complete!' });

  // Generate AI insights and geocode properties (async, non-blocking)
  if (existingPropertyMap.size > 0) {
    const allPropertyIds = Array.from(existingPropertyMap.values());
    
    // Fire and forget - don't wait for these to complete
    Promise.all([
      callFn("generate-insights", { propertyIds: allPropertyIds }),
      callFn("geocode-properties", { propertyIds: allPropertyIds })
    ]).catch(error => {
      console.error("Error in background processing:", error);
      // Don't fail the upload if these fail
    });
  }

  return result;
}
