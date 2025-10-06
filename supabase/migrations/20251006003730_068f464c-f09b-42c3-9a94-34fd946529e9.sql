-- Drop existing conflicting tables
DROP TABLE IF EXISTS staging_violations CASCADE;
DROP TABLE IF EXISTS contacts CASCADE;
DROP TABLE IF EXISTS audit_events CASCADE;
DROP TABLE IF EXISTS violations CASCADE;
DROP TABLE IF EXISTS uploads CASCADE;
DROP TABLE IF EXISTS job_materials CASCADE;
DROP TABLE IF EXISTS materials CASCADE;
DROP TABLE IF EXISTS meetings CASCADE;

-- Properties table (main leads table)
CREATE TABLE properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  zip TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  snap_score INTEGER,
  snap_insight TEXT,
  photo_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Violations table (can have multiple per property)
CREATE TABLE violations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  case_id TEXT,
  violation_type TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  opened_date DATE,
  last_updated DATE,
  days_open INTEGER,
  created_at TIMESTAMP DEFAULT NOW()
);

-- User activity tracking
CREATE TABLE lead_activity (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  user_id UUID,
  status TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Lead lists (collections)
CREATE TABLE lead_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Junction table for many-to-many
CREATE TABLE list_properties (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  list_id UUID REFERENCES lead_lists(id) ON DELETE CASCADE,
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  added_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(list_id, property_id)
);

-- Indexes for performance
CREATE INDEX idx_properties_city ON properties(city);
CREATE INDEX idx_properties_snap_score ON properties(snap_score);
CREATE INDEX idx_violations_property ON violations(property_id);
CREATE INDEX idx_violations_status ON violations(status);

-- Insert sample properties
INSERT INTO properties (address, city, state, zip, latitude, longitude, snap_score, snap_insight, photo_url) VALUES
('123 Main St', 'Springfield', 'IL', '62701', 39.7817, -89.6501, 85, 'Recently opened safety-related issue—likely deferred maintenance. Owner responsiveness may be low.', 'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=123+Main+St+Springfield+IL'),
('456 Oak Ave', 'Springfield', 'IL', '62702', 39.7995, -89.6440, 42, 'Long-standing unresolved violation; potential distress and negotiation leverage.', 'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=456+Oak+Ave+Springfield+IL'),
('789 Pine St', 'Springfield', 'IL', '62703', 39.7900, -89.6350, 78, 'Recently opened safety-related issue—likely deferred maintenance. Owner responsiveness may be low.', 'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=789+Pine+St+Springfield+IL'),
('321 Elm Dr', 'Chicago', 'IL', '60601', 41.8781, -87.6298, 92, 'Multiple violations indicate severe neglect. High probability of motivated seller.', 'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=321+Elm+Dr+Chicago+IL'),
('654 Maple Ln', 'Chicago', 'IL', '60602', 41.8819, -87.6278, 65, 'Moderate urgency. Property owner may be open to negotiation.', 'https://maps.googleapis.com/maps/api/streetview?size=600x400&location=654+Maple+Ln+Chicago+IL');

-- Insert violations (including multiple for some properties)
INSERT INTO violations (property_id, case_id, violation_type, description, status, opened_date, last_updated, days_open) 
SELECT id, 'VIO-2024-001', 'Unsafe roof condition', 'Unsafe roof condition requiring immediate repair', 'Open', '2024-01-14', '2024-01-14', 265
FROM properties WHERE address = '123 Main St';

INSERT INTO violations (property_id, case_id, violation_type, description, status, opened_date, last_updated, days_open)
SELECT id, 'VIO-2024-002', 'Property maintenance violations', 'Property maintenance violations', 'Pending', '2023-06-09', '2024-01-09', 484
FROM properties WHERE address = '456 Oak Ave';

INSERT INTO violations (property_id, case_id, violation_type, description, status, opened_date, last_updated, days_open)
SELECT id, 'VIO-2024-003', 'Fire safety code violations', 'Fire safety code violations', 'Open', '2024-01-31', '2024-01-31', 248
FROM properties WHERE address = '789 Pine St';

-- Property with MULTIPLE violations
INSERT INTO violations (property_id, case_id, violation_type, description, status, opened_date, last_updated, days_open)
SELECT id, 'VIO-2024-004', 'Structural damage', 'Foundation and structural integrity issues', 'Open', '2023-09-15', '2024-09-15', 386
FROM properties WHERE address = '321 Elm Dr';

INSERT INTO violations (property_id, case_id, violation_type, description, status, opened_date, last_updated, days_open)
SELECT id, 'VIO-2024-005', 'Code violations', 'Multiple building code violations', 'Open', '2023-11-20', '2024-09-20', 320
FROM properties WHERE address = '321 Elm Dr';

INSERT INTO violations (property_id, case_id, violation_type, description, status, opened_date, last_updated, days_open)
SELECT id, 'VIO-2024-006', 'Health hazard', 'Unsanitary conditions and health code violations', 'Open', '2024-02-10', '2024-09-10', 238
FROM properties WHERE address = '321 Elm Dr';

INSERT INTO violations (property_id, case_id, violation_type, description, status, opened_date, last_updated, days_open)
SELECT id, 'VIO-2024-007', 'Exterior maintenance', 'Peeling paint and exterior deterioration', 'Pending', '2024-03-01', '2024-09-01', 219
FROM properties WHERE address = '654 Maple Ln';

-- Disable RLS for fast development
ALTER TABLE properties DISABLE ROW LEVEL SECURITY;
ALTER TABLE violations DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activity DISABLE ROW LEVEL SECURITY;
ALTER TABLE lead_lists DISABLE ROW LEVEL SECURITY;
ALTER TABLE list_properties DISABLE ROW LEVEL SECURITY;