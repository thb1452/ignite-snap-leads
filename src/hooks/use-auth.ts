import { useState, useEffect, useCallback } from 'react';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export type AppRole = 'admin' | 'va' | 'user';

const ROLES_CACHE_KEY = 'snap_user_roles_cache';

// Helper to get cached roles from localStorage
function getCachedRoles(userId: string): AppRole[] | null {
  try {
    const cached = localStorage.getItem(ROLES_CACHE_KEY);
    if (cached) {
      const { userId: cachedUserId, roles, timestamp } = JSON.parse(cached);
      // Cache valid for 24 hours
      const isValid = cachedUserId === userId && Date.now() - timestamp < 24 * 60 * 60 * 1000;
      if (isValid && roles?.length > 0) {
        console.log('[useAuth] Using cached roles:', roles);
        return roles as AppRole[];
      }
    }
  } catch (e) {
    console.warn('[useAuth] Error reading cached roles:', e);
  }
  return null;
}

// Helper to cache roles to localStorage
function cacheRoles(userId: string, roles: AppRole[]) {
  try {
    localStorage.setItem(ROLES_CACHE_KEY, JSON.stringify({
      userId,
      roles,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.warn('[useAuth] Error caching roles:', e);
  }
}

// Helper to clear cached roles
function clearCachedRoles() {
  try {
    localStorage.removeItem(ROLES_CACHE_KEY);
  } catch (e) {
    console.warn('[useAuth] Error clearing cached roles:', e);
  }
}

// Fetch roles with retry logic
async function fetchRolesWithRetry(userId: string, maxRetries = 3): Promise<AppRole[]> {
  let lastError: Error | null = null;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { data: roleData, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);
      
      if (error) throw error;
      
      const fetchedRoles = roleData?.map(r => r.role as AppRole) || [];
      const finalRoles = fetchedRoles.length > 0 ? fetchedRoles : ['user'] as AppRole[];
      
      // Cache successful fetch
      cacheRoles(userId, finalRoles);
      console.log('[useAuth] Fetched roles for', userId, ':', finalRoles);
      return finalRoles;
    } catch (err: any) {
      lastError = err;
      console.warn(`[useAuth] Role fetch attempt ${attempt + 1} failed:`, err.message);
      
      // Exponential backoff: 500ms, 1s, 2s
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }
  
  // All retries failed - try cache
  const cachedRoles = getCachedRoles(userId);
  if (cachedRoles) {
    console.log('[useAuth] Using cached roles after fetch failure:', cachedRoles);
    return cachedRoles;
  }
  
  console.error('[useAuth] All role fetch attempts failed:', lastError);
  return ['user'];
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    let mounted = true;
    
    // Safety timeout to prevent infinite loading
    const loadingTimeout = setTimeout(() => {
      if (mounted && loading) {
        console.warn('[useAuth] Loading timeout reached, forcing complete');
        
        // Try to use cached roles before giving up
        const currentUser = user;
        if (currentUser) {
          const cachedRoles = getCachedRoles(currentUser.id);
          if (cachedRoles) {
            console.log('[useAuth] Using cached roles on timeout:', cachedRoles);
            setRoles(cachedRoles);
          }
        }
        
        setLoading(false);
      }
    }, 5000);
    
    // Get initial session and roles
    const initializeAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const currentUser = session?.user ?? null;
        
        if (!mounted) return;
        setUser(currentUser);
        
        if (currentUser) {
          // Try cache first for faster initial load
          const cachedRoles = getCachedRoles(currentUser.id);
          if (cachedRoles) {
            setRoles(cachedRoles);
          }
          
          // Then fetch fresh roles
          const freshRoles = await fetchRolesWithRetry(currentUser.id);
          if (mounted) {
            setRoles(freshRoles);
          }
        } else {
          setRoles([]);
          clearCachedRoles();
        }
      } catch (err) {
        console.error('[useAuth] Init error:', err);
        // Still set loading to false to prevent infinite spinner
        setRoles([]);
      } finally {
        if (mounted) {
          clearTimeout(loadingTimeout);
          setLoading(false);
        }
      }
    };

    initializeAuth();

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        // Use cached roles immediately for responsiveness
        const cachedRoles = getCachedRoles(currentUser.id);
        if (cachedRoles) {
          setRoles(cachedRoles);
        }
        
        // Then fetch fresh roles with retry
        const freshRoles = await fetchRolesWithRetry(currentUser.id);
        if (mounted) {
          setRoles(freshRoles);
        }
      } else {
        setRoles([]);
        clearCachedRoles();
      }
    });

    return () => {
      mounted = false;
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string, inviteToken?: string) => {
    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: redirectUrl
        }
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
  const emailVerified = user?.email_confirmed_at != null;

  const resendVerificationEmail = async () => {
    if (!user?.email) return { error: new Error('No email address') };

    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: user.email,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
        },
      });

      if (error) throw error;

      toast({
        title: "Verification email sent",
        description: "Check your inbox for the verification link",
      });

      return { error: null };
    } catch (error: any) {
      toast({
        title: "Failed to send verification email",
        description: error.message,
        variant: "destructive",
      });
      return { error };
    }
  };

  return {
    user,
    roles,
    loading,
    hasRole,
    isAdmin,
    isVA,
    emailVerified,
    signUp,
    signIn,
    signOut,
    resetPassword,
    resendVerificationEmail,
  };
}