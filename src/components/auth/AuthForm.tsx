import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';
import { Loader2, Mail } from 'lucide-react';
import { analytics } from '@/lib/analytics';
import { logActivity } from '@/services/activityLogger';

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

const signUpSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  fullName: z.string().min(2, 'Full name is required'),
});

type SignInFormData = z.infer<typeof signInSchema>;
type SignUpFormData = z.infer<typeof signUpSchema>;

const PLAN_DISPLAY_NAMES: Record<string, string> = {
  starter: 'Starter',
  professional: 'Professional', 
  enterprise: 'Enterprise',
};

const PLAN_PRICES: Record<string, string> = {
  starter: '$49',
  professional: '$99',
  enterprise: '$199',
};

export function AuthForm() {
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('invite');
  const inviteEmail = searchParams.get('email');
  const mode = searchParams.get('mode'); // 'signin' or 'signup'
  const selectedPlan = searchParams.get('plan'); // 'starter', 'professional', 'enterprise'
  
  const [isLoading, setIsLoading] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  
  // Determine tab based on mode param, invite token, or default to signin
  const getTargetTab = () => {
    // During private beta, always default to signin (no public signups)
    if (mode === 'signin') return 'signin';
    return 'signin';
  };
  
  const [activeTab, setActiveTab] = useState(getTargetTab());
  const { signIn, signUp, resetPassword } = useAuth();

  // Fire signup_page_view when signup tab is active
  useEffect(() => {
    if (activeTab === 'signup') {
      analytics.signupPageView();
    }
  }, [activeTab]);
  
  // Hide tabs when mode is explicitly set (cleaner UX)
  const showTabs = !mode && !inviteToken;

  // Update active tab when URL params change
  useEffect(() => {
    setActiveTab(getTargetTab());
  }, [mode, inviteToken]);

  const signInForm = useForm<SignInFormData>({
    resolver: zodResolver(signInSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const signUpForm = useForm<SignUpFormData>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      email: inviteEmail || '',
      password: '',
      fullName: '',
    },
  });

  // Pre-fill email from invitation
  useEffect(() => {
    if (inviteEmail) {
      signUpForm.setValue('email', inviteEmail);
    }
  }, [inviteEmail, signUpForm]);

  const handleSignIn = async (data: SignInFormData) => {
    setIsLoading(true);
    const result = await signIn(data.email, data.password);
    if (result && !('error' in result && result.error)) {
      analytics.loginSuccess();
      logActivity({ action: 'login' });
    }
    setIsLoading(false);
  };

  const handleSignUp = async (data: SignUpFormData) => {
    console.log('[AuthForm] handleSignUp called with:', { email: data.email, fullName: data.fullName });
    analytics.signupSubmitted();
    setIsLoading(true);
    try {
      // Pass invite token to signUp if present
      const result = await signUp(data.email, data.password, data.fullName, inviteToken || undefined);
      console.log('[AuthForm] signUp result:', result);
      if (result && !('error' in result && result.error)) {
        analytics.signupSuccess();
        logActivity({ action: 'signup' });
      } else {
        analytics.signupFailed('signup_returned_error');
      }
    } catch (err) {
      console.error('[AuthForm] signUp error:', err);
      analytics.signupFailed(err instanceof Error ? err.message : 'unknown');
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetEmail) return;
    setIsLoading(true);
    await resetPassword(resetEmail);
    setIsLoading(false);
    setShowForgotPassword(false);
    setResetEmail('');
  };

  // Get the title and description based on context
  const getHeaderContent = () => {
    if (inviteToken) {
      return {
        title: "You're Invited!",
        description: "Create your account to join the team."
      };
    }
    if (mode === 'signup' && selectedPlan) {
      const planName = PLAN_DISPLAY_NAMES[selectedPlan] || selectedPlan;
      const planPrice = PLAN_PRICES[selectedPlan] || '';
      return {
        title: `Get Started with ${planName}`,
        description: `Create your account to start your ${planName} plan${planPrice ? ` at ${planPrice}/month` : ''}.`
      };
    }
    if (mode === 'signup') {
      return {
        title: "Private Beta",
        description: "Signups are currently paused. Join our waitlist for early access."
      };
    }
    if (mode === 'signin') {
      return {
        title: "Welcome Back",
        description: "Sign in to your Snap Ignite account."
      };
    }
    return {
      title: "Snap Ignite",
      description: "Access your violation leads dashboard."
    };
  };

  const headerContent = getHeaderContent();

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-elegant)]">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold bg-[var(--gradient-primary)] bg-clip-text text-transparent">
            {headerContent.title}
          </CardTitle>
          <CardDescription>
            {headerContent.description}
          </CardDescription>
        </CardHeader>

        {inviteToken && (
          <div className="px-6 pb-2">
            <Alert className="bg-primary/10 border-primary/20">
              <Mail className="h-4 w-4" />
              <AlertDescription>
                <strong>Invitation detected!</strong> Complete signup to join the team.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {selectedPlan && mode === 'signup' && (
          <div className="px-6 pb-2">
            <Alert className="bg-brand/10 border-brand/20">
              <AlertDescription className="text-center">
                <span className="font-semibold text-brand">{PLAN_DISPLAY_NAMES[selectedPlan]}</span>
                {PLAN_PRICES[selectedPlan] && (
                  <span className="text-muted-foreground"> • {PLAN_PRICES[selectedPlan]}/month</span>
                )}
              </AlertDescription>
            </Alert>
          </div>
        )}
        
        <Tabs value={activeTab} onValueChange={(val) => { if (val === 'signin') setActiveTab(val); }} className="w-full">
          {/* Signup tab hidden during private beta */}
          
          <TabsContent value="signin">
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
                    Need help? <a href="mailto:hello@snapignite.com" className="text-brand hover:underline">Contact us</a>
                  </p>
                </CardFooter>
              </form>
            )}
          </TabsContent>
          
          <TabsContent value="signup">
            <CardContent className="space-y-4 text-center py-8">
              <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
                <Mail className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <p className="font-semibold text-lg">Signups Are Paused</p>
                <p className="text-sm text-muted-foreground">
                  New signups are temporarily paused. Check back soon or contact us at hello@snapignite.com.
                </p>
              </div>
              <a
                href="mailto:hello@snapignite.com"
                className="inline-flex items-center justify-center rounded-md bg-primary text-primary-foreground px-6 py-2 text-sm font-medium hover:bg-primary/90 transition"
              >
                Contact Us
              </a>
            </CardContent>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
