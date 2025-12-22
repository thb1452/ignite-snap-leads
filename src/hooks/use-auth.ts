import { useState, useEffect } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type AppRole = 'admin' | 'va' | 'user';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    
    // Get initial session and roles
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;
        
        if (!mounted) return;
        setUser(currentUser);
        
        if (currentUser) {
          // Fetch roles for this user
          const { data: roleData, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id);
          
          if (!mounted) return;
          
          if (error) {
            console.error('[useAuth] Error fetching roles:', error);
            // Default to 'user' role if can't fetch
            setRoles(['user']);
          } else {
            const fetchedRoles = roleData?.map(r => r.role as AppRole) || [];
            // Default to 'user' if no roles found
            const finalRoles = fetchedRoles.length > 0 ? fetchedRoles : ['user'] as AppRole[];
            console.log('[useAuth] Initial roles for', currentUser.id, ':', finalRoles);
            setRoles(finalRoles);
          }
        } else {
          setRoles([]);
        }
      } catch (err) {
        console.error('[useAuth] Init error:', err);
        // Still set loading to false to prevent infinite spinner
        setRoles([]);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch roles when auth state changes
        setTimeout(async () => {
          const { data: roleData, error } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id);
          
          if (error) {
            console.error('[useAuth] Error fetching roles on change:', error);
            setRoles(['user']);
          } else {
            const fetchedRoles = roleData?.map(r => r.role as AppRole) || [];
            const finalRoles = fetchedRoles.length > 0 ? fetchedRoles : ['user'] as AppRole[];
            console.log('[useAuth] Updated roles for', currentUser.id, ':', finalRoles);
            setRoles(finalRoles);
          }
        }, 0);
      } else {
        setRoles([]);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string, inviteToken?: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        // Create profile after successful signup
        const { error: profileError } = await supabase
          .from('profiles')
          .insert({
            user_id: data.user.id,
            org_id: '00000000-0000-0000-0000-000000000001', // Demo org
            email,
            full_name: fullName,
          });

        if (profileError) {
          console.error('Profile creation error:', profileError);
        }

        // If there's an invite token, mark invitation as accepted and assign role
        if (inviteToken) {
          const { data: invitation, error: inviteError } = await supabase
            .from('user_invitations')
            .update({ 
              status: 'accepted',
              accepted_at: new Date().toISOString()
            })
            .eq('token', inviteToken)
            .eq('email', email)
            .eq('status', 'pending')
            .select()
            .single();

          if (invitation && !inviteError) {
            // Assign the role from the invitation
            const { error: roleError } = await supabase
              .from('user_roles')
              .insert({
                user_id: data.user.id,
                role: invitation.role,
              });

            if (roleError) {
              console.error('Role assignment error:', roleError);
            } else {
              console.log('Role assigned from invitation:', invitation.role);
            }
          } else {
            console.error('Failed to process invitation:', inviteError);
          }
        }

        toast({
          title: "Account created successfully!",
          description: inviteToken ? "Welcome to the team!" : "Welcome to Snap Ignite Demo",
        });
      }

      return { data, error: null };
    } catch (error: any) {
      toast({
        title: "Sign up failed",
        description: error.message,
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      toast({
        title: "Welcome back!",
        description: "Successfully signed in",
      });

      return { data, error: null };
    } catch (error: any) {
      toast({
        title: "Sign in failed",
        description: error.message,
        variant: "destructive",
      });
      return { data: null, error };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;

      toast({
        title: "Signed out successfully",
        description: "See you next time!",
      });
    } catch (error: any) {
      toast({
        title: "Sign out failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const redirectUrl = `${window.location.origin}/reset-password`;
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) throw error;

      toast({
        title: "Password reset email sent",
        description: "Check your email for a password reset link",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: "Password reset failed",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  const hasRole = (role: AppRole) => roles.includes(role);
  const isAdmin = hasRole('admin');
  const isVA = hasRole('va');

  return {
    user,
    roles,
    loading,
    hasRole,
    isAdmin,
    isVA,
    signUp,
    signIn,
    signOut,
    resetPassword,
  };
}