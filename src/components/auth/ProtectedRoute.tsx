import { ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { AuthForm } from './AuthForm';
import { EmailVerificationPrompt } from './EmailVerificationPrompt';
import { AppLayout } from '@/components/layout/AppLayout';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireEmailVerification?: boolean;
}

export function ProtectedRoute({ children, requireEmailVerification = true }: ProtectedRouteProps) {
  const { user, loading, emailVerified } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  if (requireEmailVerification && !emailVerified) {
    return <EmailVerificationPrompt />;
  }

  return <AppLayout>{children}</AppLayout>;
}