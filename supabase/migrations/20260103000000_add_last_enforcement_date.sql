-- Add last_enforcement_date column for filter optimization
ALTER TABLE public.properties
ADD COLUMN IF NOT EXISTS last_enforcement_date TIMESTAMPTZ;

-- Create index for date range filtering
CREATE INDEX IF NOT EXISTS idx_properties_last_enforcement_date
ON properties(last_enforcement_date DESC NULLS LAST);

-- Create indexes for pressure level filtering (if not exist)
CREATE INDEX IF NOT EXISTS idx_properties_open_violations
ON properties(open_violations) WHERE open_violations > 0;

CREATE INDEX IF NOT EXISTS idx_properties_total_violations
ON properties(total_violations) WHERE total_violations > 0;

CREATE INDEX IF NOT EXISTS idx_properties_repeat_offender
ON properties(repeat_offender) WHERE repeat_offender = true;

-- Comment for documentation
COMMENT ON COLUMN properties.last_enforcement_date IS 'Most recent violation opened_date for this property - used for date range filtering';
