-- Enable PostGIS if not already enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Add geometry column to properties if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'properties' AND column_name = 'geom'
  ) THEN
    ALTER TABLE properties ADD COLUMN geom geometry(Point, 4326);
  END IF;
END $$;

-- Create index on geometry
CREATE INDEX IF NOT EXISTS idx_properties_geom ON properties USING GIST(geom);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_properties_snap_score ON properties(snap_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_properties_updated_at ON properties(updated_at);

-- Update geom column from lat/lng
UPDATE properties 
SET geom = ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)
WHERE latitude IS NOT NULL 
  AND longitude IS NOT NULL 
  AND geom IS NULL;

-- Create trigger to auto-update geom when lat/lng changes
CREATE OR REPLACE FUNCTION update_properties_geom()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geom = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_properties_geom ON properties;
CREATE TRIGGER trg_update_properties_geom
  BEFORE INSERT OR UPDATE OF latitude, longitude ON properties
  FOR EACH ROW
  EXECUTE FUNCTION update_properties_geom();

-- Create bbox query function
CREATE OR REPLACE FUNCTION fn_properties_by_bbox(
  p_west numeric,
  p_south numeric,
  p_east numeric,
  p_north numeric,
  p_score_gte integer DEFAULT NULL,
  p_last_seen_lte integer DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH filtered AS (
    SELECT 
      id, address, city, state, zip, 
      latitude, longitude,
      snap_score, snap_insight, 
      updated_at, photo_url
    FROM properties
    WHERE geom && ST_MakeEnvelope(p_west, p_south, p_east, p_north, 4326)
      AND (p_score_gte IS NULL OR snap_score >= p_score_gte)
      AND (
        p_last_seen_lte IS NULL
        OR (CURRENT_DATE - COALESCE(updated_at::date, updated_at::date)) <= p_last_seen_lte
      )
    ORDER BY snap_score DESC NULLS LAST
  )
  SELECT jsonb_build_object(
    'items', (
      SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) 
      FROM (
        SELECT * FROM filtered 
        OFFSET p_offset 
        LIMIT p_limit
      ) t
    ),
    'total', (SELECT count(*) FROM filtered),
    'bbox', jsonb_build_array(p_west, p_south, p_east, p_north)
  );
$$;

-- Create skip trace jobs table
CREATE TABLE IF NOT EXISTS skiptrace_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  property_ids uuid[] NOT NULL,
  vendor text NOT NULL DEFAULT 'BatchData',
  status text NOT NULL DEFAULT 'queued',
  counts jsonb DEFAULT '{"total":0,"succeeded":0,"failed":0}'::jsonb,
  error text,
  created_at timestamptz DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  job_key text UNIQUE
);

-- Enable RLS on skiptrace_jobs
ALTER TABLE skiptrace_jobs ENABLE ROW LEVEL SECURITY;

-- RLS: users can only see their own jobs
DROP POLICY IF EXISTS "Users can view own jobs" ON skiptrace_jobs;
CREATE POLICY "Users can view own jobs" 
  ON skiptrace_jobs 
  FOR SELECT 
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can insert own jobs" ON skiptrace_jobs;
CREATE POLICY "Users can insert own jobs" 
  ON skiptrace_jobs 
  FOR INSERT 
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update own jobs" ON skiptrace_jobs;
CREATE POLICY "Users can update own jobs" 
  ON skiptrace_jobs 
  FOR UPDATE 
  USING (user_id = auth.uid());

-- Create credit ledger for audit trail
CREATE TABLE IF NOT EXISTS credit_ledger_skiptrace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  job_id uuid REFERENCES skiptrace_jobs(id),
  property_id uuid REFERENCES properties(id),
  delta integer NOT NULL,
  reason text NOT NULL,
  meta jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on credit ledger
ALTER TABLE credit_ledger_skiptrace ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own ledger" ON credit_ledger_skiptrace;
CREATE POLICY "Users can view own ledger" 
  ON credit_ledger_skiptrace 
  FOR SELECT 
  USING (user_id = auth.uid());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_key ON skiptrace_jobs(job_key);
CREATE INDEX IF NOT EXISTS idx_skiptrace_jobs_user_status ON skiptrace_jobs(user_id, status);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user ON credit_ledger_skiptrace(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_job ON credit_ledger_skiptrace(job_id);

-- Add consent field to user_profiles
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'user_profiles' AND column_name = 'consented_skiptrace'
  ) THEN
    ALTER TABLE user_profiles ADD COLUMN consented_skiptrace boolean DEFAULT false;
  END IF;
END $$;