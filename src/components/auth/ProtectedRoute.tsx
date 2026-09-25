import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/use-auth';
import { EmailVerificationPrompt } from './EmailVerificationPrompt';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireEmailVerification?: boolean;
}

export function ProtectedRoute({ children, requireEmailVerification = true }: ProtectedRouteProps) {
  const { user, loading, emailVerified, authError, refreshPermissions } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authError) {
    return (
      <div className="min-h-screen flex items-center justify-center flex-col gap-4 p-4">
        <h1 className="text-2xl font-bold">We couldn’t verify your session</h1>
        <button className="rounded-md bg-primary px-6 py-3 text-primary-foreground" onClick={refreshPermissions}>Try again</button>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requireEmailVerification && !emailVerified) {
    return <EmailVerificationPrompt />;
  }

  return <AppLayout>{children}</AppLayout>;
}