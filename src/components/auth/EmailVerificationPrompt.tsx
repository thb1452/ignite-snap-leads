import { useState } from 'react';
import { Mail, RefreshCw, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/use-auth';

export function EmailVerificationPrompt() {
  const { user, resendVerificationEmail, signOut } = useAuth();
  const [isResending, setIsResending] = useState(false);

  const handleResend = async () => {
    setIsResending(true);
    await resendVerificationEmail();
    setIsResending(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-full bg-primary/10 p-4">
            <Mail className="h-12 w-12 text-primary" />
          </div>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Verify your email
          </h1>
          <p className="text-muted-foreground">
            We sent a verification link to{' '}
            <span className="font-medium text-foreground">{user?.email}</span>.
            Please check your inbox and click the link to continue.
          </p>
        </div>

        <div className="bg-muted rounded-lg p-4 text-sm text-muted-foreground">
          <p>
            Can't find the email? Check your spam folder or request a new one below.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <Button onClick={handleResend} disabled={isResending}>
            {isResending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Mail className="h-4 w-4 mr-2" />
            )}
            Resend verification email
          </Button>
          <Button variant="ghost" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
