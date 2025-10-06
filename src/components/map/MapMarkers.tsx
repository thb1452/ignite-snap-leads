import { Marker, Popup } from "react-leaflet";
import L from "leaflet";

interface Violation {
  id: string;
  violation_type: string;
  description: string | null;
  status: string;
  opened_date: string | null;
  days_open: number | null;
  case_id: string | null;
}

interface LeadActivity {
  id: string;
  property_id: string;
  status: string;
  notes: string | null;
  created_at: string;
}

interface PropertyWithViolations {
  id: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  snap_score: number | null;
  snap_insight: string | null;
  photo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  created_at: string;
  updated_at: string;
  violations: Violation[];
  latest_activity?: LeadActivity | null;
}

interface MapMarkersProps {
  properties: PropertyWithViolations[];
  onMarkerClick: (property: PropertyWithViolations) => void;
}

const createMarkerIcon = (snapScore: number | null, violationCount: number) => {
  let color = "#9CA3AF"; // gray - default
  
  if (snapScore !== null) {
    if (snapScore >= 80) color = "#EF4444"; // red - hot
    else if (snapScore >= 60) color = "#F97316"; // orange - warm
    else if (snapScore >= 40) color = "#EAB308"; // yellow - medium
  }

  const size = violationCount >= 3 ? 32 : 24;

  return L.divIcon({
    className: "custom-marker",
    html: `
      <div style="
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${size === 32 ? '14px' : '11px'};
      ">
        ${snapScore ?? '?'}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
};

export function MapMarkers({ properties, onMarkerClick }: MapMarkersProps) {
  return (
    <>
      {properties
        .filter((property) => property.latitude && property.longitude)
        .map((property) => (
          <Marker
            key={property.id}
            position={[Number(property.latitude), Number(property.longitude)]}
            icon={createMarkerIcon(property.snap_score, property.violations.length)}
          >
            <Popup>
              <div style={{ minWidth: '200px' }}>
                <div style={{ fontWeight: 'bold' }}>
                  SnapScore: {property.snap_score ?? 'N/A'}
                </div>
                <div>{property.address}</div>
                <div>{property.city}, {property.state}</div>
                <div>Violations: {property.violations.length}</div>
                <button 
                  onClick={() => onMarkerClick(property)}
                  style={{
                    marginTop: '8px',
                    padding: '4px 8px',
                    backgroundColor: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  View Details
                </button>
              </div>
            </Popup>
          </Marker>
        ))}
    </>
  );
}
