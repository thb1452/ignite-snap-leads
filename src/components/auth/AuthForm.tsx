import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { WaitlistForm } from '@/components/waitlist/WaitlistForm';
import { lovable } from '@/integrations/lovable/index';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type SignInFormData = z.infer<typeof signInSchema>;

export function AuthForm() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [showWaitlist, setShowWaitlist] = useState(mode === 'signup');
  
  const { signIn, resetPassword } = useAuth();
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if (result?.error) {
        toast({
          title: "Google sign in failed",
          description: result.error.message || "Something went wrong",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Google sign in failed",
        description: err.message || "Something went wrong",
        variant: "destructive",
      });
    } finally {
      setIsGoogleLoading(false);
    }
  };
  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true);
    await signIn(data.email, data.password);
    setIsLoading(false);
  };

  const handleResetPassword = async () => {
    if (!resetEmail) return;
    setIsLoading(true);
    await resetPassword(resetEmail);
    setIsLoading(false);
    setShowForgotPassword(false);
    setResetEmail('');
  };

  // If user arrived via a signup link, show waitlist instead
  if (showWaitlist) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
        <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold bg-[var(--gradient-primary)] bg-clip-text text-transparent">
              Join the Waitlist
            </CardTitle>
            <CardDescription>
              We're in private beta. Drop your info and we'll let you know when spots open up.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WaitlistForm />
          </CardContent>
          <CardFooter className="justify-center">
            <p className="text-xs text-muted-foreground">
              Already have an account?{' '}
              <button type="button" onClick={() => setShowWaitlist(false)} className="text-brand hover:underline">
                Sign in
              </button>
            </p>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold bg-[var(--gradient-primary)] bg-clip-text text-transparent">
            {mode === 'signin' ? 'Welcome Back' : 'Snap Ignite'}
          </CardTitle>
          <CardDescription>
            {mode === 'signin' ? 'Sign in to your Snap Ignite account.' : 'Access your violation leads dashboard.'}
          </CardDescription>
        </CardHeader>

        {showForgotPassword ? (
          <div>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@example.com"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                <p className="text-sm text-muted-foreground">
                  Enter your email to receive a password reset link
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-2">
              <Button 
                onClick={handleResetPassword} 
                className="w-full" 
                disabled={isLoading || !resetEmail}
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send Reset Link
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowForgotPassword(false)}
                className="w-full"
              >
                Back to Sign In
              </Button>
            </CardFooter>
          </div>
        ) : (
          <form onSubmit={signInForm.handleSubmit(handleSignIn)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  type="email"
                  placeholder="you@example.com"
                  {...signInForm.register('email')}
                />
                {signInForm.formState.errors.email && (
                  <p className="text-sm text-destructive">
                    {signInForm.formState.errors.email.message}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signin-password">Password</Label>
                <Input
                  id="signin-password"
                  type="password"
                  {...signInForm.register('password')}
                />
                {signInForm.formState.errors.password && (
                  <p className="text-sm text-destructive">
                    {signInForm.formState.errors.password.message}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-brand hover:underline"
              >
                Forgot password?
              </button>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Don't have an account?{' '}
                <button type="button" onClick={() => setShowWaitlist(true)} className="text-brand hover:underline">
                  Join the waitlist
                </button>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
