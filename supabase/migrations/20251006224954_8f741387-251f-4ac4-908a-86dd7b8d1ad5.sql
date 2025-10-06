-- Helper function to get untraced properties from a list
CREATE OR REPLACE FUNCTION fn_properties_untraced_in_list(p_list_id uuid, p_limit int DEFAULT 5000)
RETURNS TABLE(property_id uuid) 
LANGUAGE sql 
SECURITY DEFINER
AS $$
  SELECT lp.property_id
  FROM list_properties lp
  LEFT JOIN property_contacts pc ON pc.property_id = lp.property_id
  WHERE lp.list_id = p_list_id
  GROUP BY lp.property_id
  HAVING COUNT(pc.property_id) = 0
  LIMIT p_limit;
$$;

-- Bulk skip trace tracking tables
CREATE TABLE IF NOT EXISTS skiptrace_bulk_runs (
  run_id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  list_id uuid REFERENCES lead_lists(id) ON DELETE SET NULL,
  total int NOT NULL,
  queued int NOT NULL DEFAULT 0,
  succeeded int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  settings jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS skiptrace_bulk_items (
  run_id text REFERENCES skiptrace_bulk_runs(run_id) ON DELETE CASCADE,
  property_id uuid NOT NULL,
  status text CHECK (status IN ('queued','processing','success','no_hit','error')),
  message text,
  duration_ms int,
  PRIMARY KEY (run_id, property_id)
);

-- RLS for bulk run tables
ALTER TABLE skiptrace_bulk_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE skiptrace_bulk_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own bulk runs"
  ON skiptrace_bulk_runs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can view their own bulk items"
  ON skiptrace_bulk_items FOR SELECT
  USING (run_id IN (SELECT run_id FROM skiptrace_bulk_runs WHERE user_id = auth.uid()));

-- Helper function for incrementing bulk run counters
CREATE OR REPLACE FUNCTION fn_bulk_run_inc(p_run_id text, p_field text)
RETURNS void 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
  IF p_field = 'succeeded' THEN
    UPDATE skiptrace_bulk_runs SET succeeded = succeeded + 1 WHERE run_id = p_run_id;
  ELSIF p_field = 'failed' THEN
    UPDATE skiptrace_bulk_runs SET failed = failed + 1 WHERE run_id = p_run_id;
  END IF;
END;
$$;