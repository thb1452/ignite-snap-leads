/**
 * Maps raw municipal violation types to user-friendly categories.
 * Wholesalers think in terms like "exterior issues" not "IPMC 304.2".
 */

export interface ViolationCategory {
  id: string;
  label: string;
  description: string;
  keywords: string[];
}

// User-friendly categories that investors actually care about
export const VIOLATION_CATEGORIES: ViolationCategory[] = [
  {
    id: 'exterior',
    label: 'Exterior Issues',
    description: 'Paint, siding, windows, doors, gutters',
    keywords: [
      'exterior', 'siding', 'paint', 'peeling', 'fascia', 'soffit', 
      'window', 'door', 'gutter', 'downspout', 'trim', 'corrosion',
      '304.2', '304.6', '304.7', '304.13', '304.15', 
      'protective treatment', 'weather tight', 'frames'
    ]
  },
  {
    id: 'structural',
    label: 'Structural',
    description: 'Foundation, roof, walls, load-bearing issues',
    keywords: [
      'structural', 'foundation', 'roof', 'wall', 'floor', 'ceiling',
      'load', 'bearing', 'collapse', 'unsafe structure', 'dangerous',
      'accessory structure', 'deck', 'porch', 'balcony', 'stair',
      '302.7', '304.4', '305.3', '305.4', '305.5', '305.6'
    ]
  },
  {
    id: 'safety',
    label: 'Safety Hazards',
    description: 'Electrical, fire, smoke detectors, hazards',
    keywords: [
      'safety', 'electrical', 'fire', 'smoke', 'carbon monoxide',
      'hazard', 'luminaire', 'wiring', 'circuit', 'egress',
      'handrail', 'guardrail', 'railing', '605.1', '605.3', '702'
    ]
  },
  {
    id: 'zoning',
    label: 'Zoning',
    description: 'Parking, setbacks, unpermitted work',
    keywords: [
      'zoning', 'parking', 'setback', 'permit', 'unpermitted',
      'variance', 'land use', 'occupancy', 'commercial', 'residential',
      'right of way', 'obstruction'
    ]
  },
  {
    id: 'maintenance',
    label: 'Maintenance',
    description: 'Weeds, trash, general neglect',
    keywords: [
      'weed', 'grass', 'overgrown', 'vegetation', 'trash', 'debris',
      'rubbish', 'garbage', 'litter', 'junk', 'abandoned', 'storage',
      'inoperable vehicle', 'accumulation', 'nuisance', 'blight',
      '302.4', '308.1'
    ]
  },
  {
    id: 'interior',
    label: 'Interior',
    description: 'Plumbing, HVAC, interior conditions',
    keywords: [
      'interior', 'plumbing', 'hvac', 'furnace', 'heating', 'cooling',
      'bathroom', 'kitchen', 'toilet', 'sink', 'sanitary', 'water',
      'ventilation', '504', '505', '506', '602', '603'
    ]
  },
  {
    id: 'vacancy',
    label: 'Vacancy',
    description: 'Vacant, boarded, registration required',
    keywords: [
      'vacant', 'vacancy', 'boarded', 'unoccupied', 'abandoned property',
      'register', 'registration', 'condemnation', 'closing', 'unfit',
      '109.1', '109.2'
    ]
  }
];

/**
 * Maps a raw violation type string to a category ID.
 * Returns 'other' if no match is found.
 */
export function mapToCategory(violationType: string): string {
  if (!violationType) return 'other';
  
  const lower = violationType.toLowerCase();
  
  for (const category of VIOLATION_CATEGORIES) {
    for (const keyword of category.keywords) {
      if (lower.includes(keyword.toLowerCase())) {
        return category.id;
      }
    }
  }
  
  return 'other';
}

/**
 * Check if a violation type matches a category
 */
export function violationMatchesCategory(violationType: string, categoryId: string): boolean {
  if (!violationType || !categoryId) return false;
  if (categoryId === 'other') return mapToCategory(violationType) === 'other';
  
  const category = getCategoryById(categoryId);
  if (!category) return false;
  
  const lower = violationType.toLowerCase();
  return category.keywords.some(kw => lower.includes(kw.toLowerCase()));
}

/**
 * Get category info by ID
 */
export function getCategoryById(id: string): ViolationCategory | undefined {
  return VIOLATION_CATEGORIES.find(c => c.id === id);
}

/**
 * Aggregates raw violation types into categories with property counts.
 * Takes array of {type, propertyCount} and returns {categoryId, label, propertyCount}
 */
export function aggregateByCategory(
  rawTypes: Array<{ type: string; propertyCount: number }>
): Array<{ categoryId: string; label: string; description: string; propertyCount: number }> {
  const categoryMap = new Map<string, number>();
  
  // Initialize all categories with 0
  for (const cat of VIOLATION_CATEGORIES) {
    categoryMap.set(cat.id, 0);
  }
  categoryMap.set('other', 0);
  
  // Track which properties we've already counted per category
  // Since a property can have multiple violation types that map to the same category,
  // we need to be careful not to double-count. However, since we're aggregating
  // from the RPC which already gives unique property counts per violation type,
  // we sum them (a property with Exterior paint AND Exterior siding issues counts as 1 for exterior)
  // 
  // Actually, this is tricky. The propertyCount for each type is independent.
  // If a property has both "IPMC 304.2" and "IPMC 304.6", it contributes to both types.
  // When we merge into "Exterior", we want the UNIQUE property count, not the sum.
  // 
  // For now, we'll use a conservative estimate: take the MAX of the individual type counts
  // within each category. This underestimates but is safer than double-counting.
  const categoryMaxCounts = new Map<string, number>();
  
  for (const { type, propertyCount } of rawTypes) {
    const categoryId = mapToCategory(type);
    const current = categoryMaxCounts.get(categoryId) || 0;
    // Use max to avoid overcounting (conservative estimate)
    categoryMaxCounts.set(categoryId, Math.max(current, propertyCount));
  }
  
  const results: Array<{ categoryId: string; label: string; description: string; propertyCount: number }> = [];
  
  for (const cat of VIOLATION_CATEGORIES) {
    const count = categoryMaxCounts.get(cat.id) || 0;
    if (count > 0) {
      results.push({
        categoryId: cat.id,
        label: cat.label,
        description: cat.description,
        propertyCount: count
      });
    }
  }
  
  // Add "Other" if there are uncategorized
  const otherCount = categoryMaxCounts.get('other') || 0;
  if (otherCount > 0) {
    results.push({
      categoryId: 'other',
      label: 'Other',
      description: 'Miscellaneous violations',
      propertyCount: otherCount
    });
  }
  
  // Sort by property count descending
  results.sort((a, b) => b.propertyCount - a.propertyCount);
  
  return results;
}
