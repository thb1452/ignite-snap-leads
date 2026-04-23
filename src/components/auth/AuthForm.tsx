import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams, Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/hooks/use-auth';
import { Loader2 } from 'lucide-react';
import { lovable } from '@/integrations/lovable/index';
import { useToast } from '@/hooks/use-toast';
import { Separator } from '@/components/ui/separator';

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signUpSchema = z.object({
  fullName: z.string().min(1, 'Full name is required'),
  email: z.string().email('Invalid email address'),
  phone: z.string().optional(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  smsConsent: z.boolean().optional(),
});

type SignInFormData = z.infer<typeof signInSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

export function AuthForm() {
  const [searchParams] = useSearchParams();
  const mode = searchParams.get('mode');
  
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [isSignUp, setIsSignUp] = useState(mode === 'signup');
  
  const { signIn, signUp, resetPassword } = useAuth();
  const { toast } = useToast();

  const handleGoogleSignIn = async () => {
    setIsGoogleLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: `${window.location.origin}/auth`,
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
    defaultValues: { email: '', password: '' },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { fullName: '', email: '', phone: '', password: '', smsConsent: false },
  });

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true);
    await signIn(data.email, data.password);
    setIsLoading(false);
  };

  const handleSignUp = async (data: SignUpFormData) => {
    setIsLoading(true);
    await signUp(data.email, data.password, data.fullName);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold bg-[var(--gradient-primary)] bg-clip-text text-transparent">
            {isSignUp ? 'Create Your Account' : 'Welcome Back'}
          </CardTitle>
          <CardDescription>
            {isSignUp ? 'Sign up to start finding distressed property leads.' : 'Sign in to your Snap Ignite account.'}
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
        ) : isSignUp ? (
          <form onSubmit={signUpForm.handleSubmit(handleSignUp)}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="signup-name">Full Name</Label>
                <Input
                  id="signup-name"
                  type="text"
                  placeholder="John Doe"
                  {...signUpForm.register('fullName')}
                />
                {signUpForm.formState.errors.fullName && (
                  <p className="text-sm text-destructive">{signUpForm.formState.errors.fullName.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-email">Email</Label>
                <Input
                  id="signup-email"
                  type="email"
                  placeholder="you@example.com"
                  {...signUpForm.register('email')}
                />
                {signUpForm.formState.errors.email && (
                  <p className="text-sm text-destructive">{signUpForm.formState.errors.email.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-phone">Phone Number <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="signup-phone"
                  type="tel"
                  placeholder="+1 (555) 123-4567"
                  {...signUpForm.register('phone')}
                />
                <p className="text-xs text-muted-foreground">For property alert SMS notifications</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="signup-password">Password</Label>
                <Input
                  id="signup-password"
                  type="password"
                  placeholder="At least 8 characters"
                  {...signUpForm.register('password')}
                />
                {signUpForm.formState.errors.password && (
                  <p className="text-sm text-destructive">{signUpForm.formState.errors.password.message}</p>
                )}
              </div>

              {/* A2P 10DLC SMS opt-in — OPTIONAL, not pre-checked, separate from Terms acceptance */}
              <div className="rounded-md border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-start space-x-3">
                  <Checkbox
                    id="signup-sms-consent"
                    checked={signUpForm.watch('smsConsent') === true}
                    onCheckedChange={(checked) => {
                      signUpForm.setValue('smsConsent', checked === true, { shouldValidate: false });
                    }}
                    className="mt-0.5"
                  />
                  <label htmlFor="signup-sms-consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    I agree to receive recurring automated text messages from Snap Ignite, including property alerts, account notifications, and platform updates. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help.
                  </label>
                </div>
                <p className="text-[11px] text-muted-foreground/80 pl-7">
                  Optional — you can sign up without enabling SMS. Consent is not a condition of purchase. View our{' '}
                  <Link to="/privacy-policy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Privacy Policy</Link>{' '}and{' '}
                  <Link to="/terms-and-conditions" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Terms and Conditions</Link>.
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex flex-col gap-3">
              <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Create Account
              </Button>

              <div className="flex items-center gap-3 w-full">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || isGoogleLoading}
                onClick={handleGoogleSignIn}
              >
                {isGoogleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Continue with Google
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Already have an account?{' '}
                <button type="button" onClick={() => setIsSignUp(false)} className="text-brand hover:underline">
                  Sign in
                </button>
              </p>
            </CardFooter>
          </form>
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
              <Button type="submit" className="w-full" disabled={isLoading || isGoogleLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Sign In
              </Button>

              <div className="flex items-center gap-3 w-full">
                <Separator className="flex-1" />
                <span className="text-xs text-muted-foreground">or</span>
                <Separator className="flex-1" />
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full"
                disabled={isLoading || isGoogleLoading}
                onClick={handleGoogleSignIn}
              >
                {isGoogleLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                Continue with Google
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Don't have an account?{' '}
                <button type="button" onClick={() => setIsSignUp(true)} className="text-brand hover:underline">
                  Create one
                </button>
              </p>
            </CardFooter>
          </form>
        )}
      </Card>
    </div>
  );
}
