// Mock data generator for demo purposes
// This generates fake property data without backend calls

const FAKE_ADDRESSES = [
  "1234 Elm Street", "567 Oak Avenue", "890 Pine Road", "234 Maple Drive",
  "456 Cedar Lane", "789 Birch Court", "123 Walnut Street", "345 Ash Avenue",
  "678 Cherry Road", "901 Hickory Drive", "234 Spruce Lane", "567 Willow Court",
  "890 Poplar Street", "123 Sycamore Avenue", "456 Magnolia Road", "789 Dogwood Drive",
  "234 Redwood Lane", "567 Cypress Court", "890 Juniper Street", "123 Fir Avenue"
];

const FAKE_CITIES = [
  "Dallas", "Fort Worth", "Arlington", "Plano", "Irving", "Garland", 
  "Frisco", "McKinney", "Mesquite", "Carrollton"
];

const VIOLATION_TYPES = [
  "Code Violation", "Tax Delinquency", "Water Shutoff", "Trash Complaint",
  "Overgrown Lawn", "Structural Damage", "Abandoned Vehicle", "Roof Damage"
];

// Enforcement-focused insights (neutral language)
const INSIGHTS = [
  "Active enforcement exceeds 180-day threshold. Multiple citations documented across municipal departments.",
  "Extended enforcement activity with recurring citations. Property subject to multi-agency oversight.",
  "Utility service enforcement action on record. Additional maintenance citations documented.",
  "Structural safety citation issued by building department. Case remains in active enforcement status.",
  "Pattern of recurring enforcement activity spanning 12+ months. Multiple departments involved.",
  "Property has accumulated multiple compliance notices. Building and safety citations on file.",
  "Extended enforcement duration with cross-department involvement. Recent citation activity noted.",
  "Active enforcement cases include maintenance and structural categories. Municipal follow-up scheduled."
];

const TAGS = [
  ["Structural citation", "Maintenance notice", "Active enforcement"],
  ["Tax citation", "Utility enforcement", "Vacancy notice"],
  ["Code violation", "Exterior maintenance", "Compliance pending"],
  ["Structural issues", "Multi-department", "Extended duration"],
  ["Exterior citation", "Municipal notice", "Active case"],
  ["Vacancy indicators", "Utility citation", "Enforcement active"]
];

// Generate random coordinates within Dallas-Fort Worth area
function generateRandomCoordinates() {
  const centerLat = 32.7767;
  const centerLng = -96.7970;
  const radius = 0.3; // ~20 mile radius
  
  const lat = centerLat + (Math.random() - 0.5) * radius;
  const lng = centerLng + (Math.random() - 0.5) * radius;
  
  return { lat, lng };
}

// Generate a random date within the last 6 months
function generateRandomDate() {
  const now = new Date();
  const sixMonthsAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const randomTime = sixMonthsAgo.getTime() + Math.random() * (now.getTime() - sixMonthsAgo.getTime());
  return new Date(randomTime).toISOString();
}

// Generate mock properties
export function generateMockProperties(count: number = 40) {
  const properties = [];
  
  for (let i = 0; i < count; i++) {
    const coords = generateRandomCoordinates();
    const address = FAKE_ADDRESSES[Math.floor(Math.random() * FAKE_ADDRESSES.length)];
    const city = FAKE_CITIES[Math.floor(Math.random() * FAKE_CITIES.length)];
    const violationType = VIOLATION_TYPES[Math.floor(Math.random() * VIOLATION_TYPES.length)];
    const insight = INSIGHTS[Math.floor(Math.random() * INSIGHTS.length)];
    const tags = TAGS[Math.floor(Math.random() * TAGS.length)];
    const snapScore = Math.floor(Math.random() * 100);
    const openedDate = generateRandomDate();
    const daysOpen = Math.floor(Math.random() * 180);
    
    properties.push({
      id: `mock-${i}`,
      address: `${address}`,
      city,
      state: "TX",
      zip: `7${Math.floor(Math.random() * 10)}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      latitude: coords.lat,
      longitude: coords.lng,
      snap_score: snapScore,
      snap_insight: insight,
      photo_url: null,
      updated_at: generateRandomDate(),
      violations: [
        {
          id: `viol-${i}-1`,
          violation_type: violationType,
          description: `${violationType} citation issued by municipality`,
          status: Math.random() > 0.5 ? "Open" : "Pending",
          opened_date: openedDate,
          days_open: daysOpen,
          case_id: `CASE-${Math.floor(Math.random() * 10000)}`
        }
      ],
      // Additional mock data for detail panel
      mockTags: tags,
      mockSource: `${violationType} • ${new Date(openedDate).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`
    });
  }
  
  return properties;
}
