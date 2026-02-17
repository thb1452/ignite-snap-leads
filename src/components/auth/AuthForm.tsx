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
  starter: '$79',
  professional: '$149',
  enterprise: '$299',
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
    if (inviteToken) return 'signup';
    if (mode === 'signup') return 'signup';
    if (mode === 'signin') return 'signin';
    return 'signin'; // default
  };
  
  const [activeTab, setActiveTab] = useState(getTargetTab());
  const { signIn, signUp, resetPassword } = useAuth();
  
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
    await signIn(data.email, data.password);
    setIsLoading(false);
  };

  const handleSignUp = async (data: SignUpFormData) => {
    console.log('[AuthForm] handleSignUp called with:', { email: data.email, fullName: data.fullName });
    setIsLoading(true);
    try {
      // Pass invite token to signUp if present
      const result = await signUp(data.email, data.password, data.fullName, inviteToken || undefined);
      console.log('[AuthForm] signUp result:', result);
    } catch (err) {
      console.error('[AuthForm] signUp error:', err);
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
        title: "Create Your Account",
        description: "Sign up to access enforcement intelligence."
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
        
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {showTabs && (
            <div className="px-6 pb-4">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>
            </div>
          )}
          
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
                  {mode === 'signin' && (
                    <p className="text-xs text-center text-muted-foreground">
                      Don't have an account?{' '}
                      <a href="/auth?mode=signup" className="text-brand hover:underline">
                        Sign up
                      </a>
                    </p>
                  )}
                </CardFooter>
              </form>
            )}
          </TabsContent>
          
          <TabsContent value="signup">
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
                    <p className="text-sm text-destructive">
                      {signUpForm.formState.errors.fullName.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    type="email"
                    placeholder="you@example.com"
                    disabled={!!inviteEmail}
                    {...signUpForm.register('email')}
                  />
                  {signUpForm.formState.errors.email && (
                    <p className="text-sm text-destructive">
                      {signUpForm.formState.errors.email.message}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    type="password"
                    {...signUpForm.register('password')}
                  />
                  {signUpForm.formState.errors.password && (
                    <p className="text-sm text-destructive">
                      {signUpForm.formState.errors.password.message}
                    </p>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3">
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isLoading}
                  onClick={() => console.log('[AuthForm] Button clicked, form valid:', signUpForm.formState.isValid, 'errors:', signUpForm.formState.errors)}
                >
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {inviteToken 
                    ? 'Accept Invitation & Create Account' 
                    : selectedPlan 
                      ? `Start ${PLAN_DISPLAY_NAMES[selectedPlan] || 'Your'} Plan`
                      : 'Create Account'
                  }
                </Button>
                {mode === 'signup' && (
                  <p className="text-xs text-center text-muted-foreground">
                    Already have an account?{' '}
                    <a href="/auth?mode=signin" className="text-brand hover:underline">
                      Sign in
                    </a>
                  </p>
                )}
              </CardFooter>
            </form>
          </TabsContent>
        </Tabs>
      </Card>
    </div>
  );
}
