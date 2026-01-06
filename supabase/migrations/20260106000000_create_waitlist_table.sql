-- ============================================================================
-- Create Waitlist Table for Landing Page Email Capture
-- Date: 2026-01-06
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  role TEXT CHECK (role IN ('wholesaler', 'investor', 'agent', 'other')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  contacted BOOLEAN DEFAULT false,
  contacted_at TIMESTAMPTZ,
  notes TEXT
);

-- Add index on email for fast lookups
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON public.waitlist(email);

-- Add index on created_at for chronological queries
CREATE INDEX IF NOT EXISTS idx_waitlist_created_at ON public.waitlist(created_at DESC);

-- Enable RLS
ALTER TABLE public.waitlist ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert (public signup)
CREATE POLICY "Anyone can sign up for waitlist"
  ON public.waitlist
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Policy: Only admins can view waitlist
CREATE POLICY "Admins can view waitlist"
  ON public.waitlist
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Policy: Only admins can update waitlist
CREATE POLICY "Admins can update waitlist"
  ON public.waitlist
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_profiles
      WHERE user_profiles.user_id = auth.uid()
      AND user_profiles.role = 'admin'
    )
  );

-- Comments for documentation
COMMENT ON TABLE public.waitlist IS 'Email capture for landing page early access signups';
COMMENT ON COLUMN public.waitlist.email IS 'User email address (unique)';
COMMENT ON COLUMN public.waitlist.role IS 'User role: wholesaler, investor, agent, or other';
COMMENT ON COLUMN public.waitlist.contacted IS 'Has the user been contacted by sales team';
COMMENT ON COLUMN public.waitlist.contacted_at IS 'Timestamp when user was contacted';
