-- Create a security definer function to accept invitations and assign roles
CREATE OR REPLACE FUNCTION public.accept_invitation(p_token text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation record;
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Not authenticated');
  END IF;

  -- Find the pending invitation
  SELECT * INTO v_invitation
  FROM public.user_invitations
  WHERE token = p_token
    AND status = 'pending'
    AND expires_at > now();

  IF v_invitation IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;

  -- Insert the role (ignore if already exists)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, v_invitation.role)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Mark invitation as accepted
  UPDATE public.user_invitations
  SET status = 'accepted', accepted_at = now()
  WHERE id = v_invitation.id;

  RETURN json_build_object('success', true, 'role', v_invitation.role);
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

-- Manually assign VA role to the existing invited users who don't have roles
INSERT INTO public.user_roles (user_id, role)
VALUES 
  ('04347767-8485-4d18-b967-fc26075ddb96', 'va'),
  ('218f1ae4-7ecb-441f-9ca9-d9eba5f7b25c', 'va')
ON CONFLICT (user_id, role) DO NOTHING;