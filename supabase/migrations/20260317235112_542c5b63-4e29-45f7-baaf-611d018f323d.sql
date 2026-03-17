
-- Beta waitlist table
CREATE TABLE public.beta_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  notes text
);

ALTER TABLE public.beta_waitlist ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can submit to waitlist
CREATE POLICY "Anyone can join waitlist" ON public.beta_waitlist
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Only admins can view/manage waitlist
CREATE POLICY "Admins can manage waitlist" ON public.beta_waitlist
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Add is_beta_user flag to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_beta_user boolean NOT NULL DEFAULT false;
