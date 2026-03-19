-- Performance indexes for fn_map_markers_in_bounds and property queries
-- Run in Supabase SQL Editor; does not modify or delete any data.

-- 1. Bounding box / viewport queries: index on geocoded (lat, lng) for range scans
-- fn_map_markers_in_bounds filters: latitude BETWEEN min/max, longitude BETWEEN min/max
CREATE INDEX IF NOT EXISTS idx_properties_lat_lng_geocoded
  ON public.properties (latitude, longitude)
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND latitude != 0
    AND longitude != 0;

-- 2. Map markers common filter path: bbox + snap_score (ORDER BY snap_score DESC, id)
-- Composite helps when bbox is selective and we sort by score
CREATE INDEX IF NOT EXISTS idx_properties_lat_lng_snap_score
  ON public.properties (latitude, longitude, snap_score DESC NULLS LAST, id)
  WHERE latitude IS NOT NULL
    AND longitude IS NOT NULL
    AND latitude != 0
    AND longitude != 0;

-- 3. violation_types GIN already exists (20260105, 20260203) - skip
