/**
 * Extracts a clean, short category from verbose violation_type strings.
 * 
 * Examples:
 * - "IPMC 109.2 - Closing of vacant structures - vacant - If the structure is vacant..." → "Vacant Structure"
 * - "IPMC 109.1.3 - Unfit for Human Occupancy - Structure unfit for Human occupancy..." → "Unfit for Occupancy"
 * - "Safety" → "Safety"
 * - "Fire" → "Fire"
 */

// Known category mappings - map keywords to clean labels
const CATEGORY_MAP: Record<string, string> = {
  'vacant': 'Vacant Structure',
  'unfit for human occupancy': 'Unfit for Occupancy',
  'closing of vacant': 'Vacant Structure',
  'unsafe structure': 'Unsafe Structure',
  'dangerous building': 'Dangerous Building',
  'fire': 'Fire',
  'safety': 'Safety',
  'electrical': 'Electrical',
  'plumbing': 'Plumbing',
  'structural': 'Structural',
  'zoning': 'Zoning',
  'nuisance': 'Nuisance',
  'debris': 'Debris',
  'overgrown': 'Overgrown',
  'weeds': 'Weeds',
  'trash': 'Trash',
  'graffiti': 'Graffiti',
  'abandoned vehicle': 'Abandoned Vehicle',
  'rodent': 'Rodent',
  'vermin': 'Vermin',
  'sanitary': 'Sanitary',
  'water': 'Water',
  'heating': 'Heating',
  'ventilation': 'Ventilation',
  'owner shall register': 'Registration Required',
  'condemnation': 'Condemnation',
};

export function formatViolationType(violationType: string | null): string {
  if (!violationType) return 'Unknown';
  
  const lower = violationType.toLowerCase();
  
  // Check if it's already a short/clean type (less than 25 chars, no code prefix)
  if (violationType.length < 25 && !violationType.includes(' - ')) {
    return violationType;
  }
  
  // Try to match known categories
  for (const [keyword, label] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword)) {
      return label;
    }
  }
  
  // Try to extract the category between first two dashes: "CODE - Category - Description"
  const parts = violationType.split(' - ');
  if (parts.length >= 2) {
    // Take the second part (category name) and clean it
    const category = parts[1].trim();
    // Limit length and capitalize properly
    if (category.length <= 30) {
      return category;
    }
    // If still too long, take first few words
    return category.split(' ').slice(0, 3).join(' ');
  }
  
  // Fallback: return first 20 chars with ellipsis if too long
  return violationType.length > 20 ? violationType.substring(0, 20) + '…' : violationType;
}
