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
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch roles for this user
        const { data: roleData } = await supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', currentUser.id);
        
        const fetchedRoles = roleData?.map(r => r.role as AppRole) || [];
        console.log('[useAuth] Initial roles for', currentUser.id, ':', fetchedRoles);
        setRoles(fetchedRoles);
      } else {
        setRoles([]);
      }
      
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        // Fetch roles when auth state changes
        setTimeout(async () => {
          const { data: roleData } = await supabase
            .from('user_roles')
            .select('role')
            .eq('user_id', currentUser.id);
          
          const fetchedRoles = roleData?.map(r => r.role as AppRole) || [];
          console.log('[useAuth] Updated roles for', currentUser.id, ':', fetchedRoles);
          setRoles(fetchedRoles);
        }, 0);
      } else {
        setRoles([]);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
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

        toast({
          title: "Account created successfully!",
          description: "Welcome to Snap Ignite Demo",
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