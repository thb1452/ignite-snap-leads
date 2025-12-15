-- ============================================================================
-- PHASE 1: CRITICAL SECURITY FIXES
-- Enable Row Level Security on core tables
-- ============================================================================

-- Add created_by column to properties table to track who added the property
-- This is optional/nullable since existing properties don't have this info
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Add user_id columns to user-specific tables if not already present
-- lead_activity already has user_id
-- lead_lists already has user_id

-- Create index for better query performance on created_by
CREATE INDEX IF NOT EXISTS idx_properties_created_by ON public.properties(created_by);

-- ============================================================================
-- ENABLE RLS ON CORE TABLES
-- ============================================================================

-- Enable RLS on properties table
-- Properties are shared across all users (public municipal data)
-- but we track who created them
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Enable RLS on violations table
-- Violations are also shared (linked to properties)
ALTER TABLE public.violations ENABLE ROW LEVEL SECURITY;

-- Enable RLS on lead_activity table
-- Activity is private to each user
ALTER TABLE public.lead_activity ENABLE ROW LEVEL SECURITY;

-- Enable RLS on lead_lists table
-- Lists are private to each user
ALTER TABLE public.lead_lists ENABLE ROW LEVEL SECURITY;

-- Enable RLS on list_properties table
-- List membership is private (via parent list)
ALTER TABLE public.list_properties ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- RLS POLICIES FOR PROPERTIES
-- Properties are SHARED - all authenticated users can view all properties
-- This matches the product vision: Snap provides municipal data to all users
-- ============================================================================

CREATE POLICY "Anyone can view properties"
  ON public.properties
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert properties"
  ON public.properties
  FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Either the user is creating it themselves, or created_by is null
    created_by = auth.uid() OR created_by IS NULL
  );

CREATE POLICY "Authenticated users can update properties"
  ON public.properties
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RLS POLICIES FOR VIOLATIONS
-- Violations are SHARED - all authenticated users can view all violations
-- ============================================================================

CREATE POLICY "Anyone can view violations"
  ON public.violations
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert violations"
  ON public.violations
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update violations"
  ON public.violations
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ============================================================================
-- RLS POLICIES FOR LEAD_ACTIVITY
-- Activity is PRIVATE - users only see their own activity
-- ============================================================================

CREATE POLICY "Users can view own activity"
  ON public.lead_activity
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own activity"
  ON public.lead_activity
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own activity"
  ON public.lead_activity
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own activity"
  ON public.lead_activity
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES FOR LEAD_LISTS
-- Lists are PRIVATE - users only see their own lists
-- ============================================================================

CREATE POLICY "Users can view own lists"
  ON public.lead_lists
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert own lists"
  ON public.lead_lists
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own lists"
  ON public.lead_lists
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete own lists"
  ON public.lead_lists
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- ============================================================================
-- RLS POLICIES FOR LIST_PROPERTIES
-- List properties are PRIVATE - users only see properties in their own lists
-- ============================================================================

CREATE POLICY "Users can view own list properties"
  ON public.list_properties
  FOR SELECT
  TO authenticated
  USING (
    list_id IN (
      SELECT id FROM public.lead_lists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert to own lists"
  ON public.list_properties
  FOR INSERT
  TO authenticated
  WITH CHECK (
    list_id IN (
      SELECT id FROM public.lead_lists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete from own lists"
  ON public.list_properties
  FOR DELETE
  TO authenticated
  USING (
    list_id IN (
      SELECT id FROM public.lead_lists WHERE user_id = auth.uid()
    )
  );

-- ============================================================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================================================

COMMENT ON TABLE public.properties IS 'Properties are shared across all authenticated users. Municipal data is public by design.';
COMMENT ON TABLE public.violations IS 'Violations are shared across all authenticated users. Linked to properties.';
COMMENT ON TABLE public.lead_activity IS 'User-private activity tracking. Each user only sees their own notes and status updates.';
COMMENT ON TABLE public.lead_lists IS 'User-private lead lists/collections. Each user only sees their own lists.';
COMMENT ON TABLE public.list_properties IS 'User-private list membership. Accessible via parent list ownership.';

COMMENT ON COLUMN public.properties.created_by IS 'Tracks which user added this property (nullable for legacy data and bulk imports).';
