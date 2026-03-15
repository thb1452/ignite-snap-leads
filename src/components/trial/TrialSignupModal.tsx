import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Check, Loader2, Zap, TrendingUp, Building2, CreditCard, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/externalClient";
import { Link } from "react-router-dom";

const TIER_CONFIG: Record<string, {
  display: string;
  price: number;
  icon: any;
  features: string[];
}> = {
  starter: {
    display: "Starter",
    price: 79,
    icon: Zap,
    features: [
      "5,000 exports/month",
      "Code violation data",
      "Basic filters (location, category, search)",
      "SnapScore ranking",
    ],
  },
  professional: {
    display: "Pro",
    price: 149,
    icon: TrendingUp,
    features: [
      "15,000 exports/month",
      "All Starter features",
      "Pressure Level™ filtering",
      "Priority support",
    ],
  },
  enterprise: {
    display: "Elite",
    price: 299,
    icon: Building2,
    features: [
      "25,000 exports/month",
      "All Pro features",
      "Water shutoff data",
    ],
  },
  elite: {
    display: "Elite",
    price: 299,
    icon: Building2,
    features: [
      "25,000 exports/month",
      "All Pro features",
      "Water shutoff data",
    ],
  },
};

/** Create a Stripe Checkout session with a 7-day trial using supabase.functions.invoke */
async function createTrialCheckoutSession(tierName: string): Promise<string> {
  const TIMEOUT_MS = 15000;

  const invokePromise = supabase.functions.invoke("create-checkout-session", {
    body: {
      tier_name: tierName,
      billing_cycle: "monthly",
      trial: true,
    },
  });

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(
      () => reject(new Error("Checkout request timed out. Please check your connection and try again.")),
      TIMEOUT_MS
    )
  );

  const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

  if (error) {
    throw new Error(error.message || "Failed to create checkout session");
  }

  const url = data?.url || data?.checkout_url;
  if (!url) throw new Error("No checkout URL returned. Please try again.");
  return url;
}

interface TrialSignupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTier: string;
}

export function TrialSignupModal({ open, onOpenChange, selectedTier }: TrialSignupModalProps) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);

  const tier = TIER_CONFIG[selectedTier] || TIER_CONFIG.starter;
  const TierIcon = tier.icon;

  const trialEndDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  /** Redirect an authenticated user to Stripe Checkout with trial */
  const redirectToStripeCheckout = async () => {
    const checkoutUrl = await createTrialCheckoutSession(selectedTier);
    
    // Store as fallback in case redirect is blocked (e.g. mobile async context)
    setFallbackUrl(checkoutUrl);

    // Attempt redirect
    window.location.assign(checkoutUrl);

    // If still on page after 2s, the redirect was blocked — show manual link
    setTimeout(() => {
      setIsSubmitting(false);
    }, 2000);
  };

  const handleStartTrial = async () => {
    if (!agreedToTerms) {
      toast({ variant: "destructive", title: "Please agree to Terms of Service" });
      return;
    }

    setIsSubmitting(true);

    try {
      if (user) {
        // User already logged in — redirect to Stripe Checkout directly
        await redirectToStripeCheckout();
        return;
      }

      // Validate fields for new signup
      if (!fullName.trim()) {
        toast({ variant: "destructive", title: "Please enter your full name" });
        setIsSubmitting(false);
        return;
      }

      if (!email || !password) {
        toast({ variant: "destructive", title: "Please enter email and password" });
        setIsSubmitting(false);
        return;
      }

      if (password.length < 8) {
        toast({ variant: "destructive", title: "Password must be at least 8 characters" });
        setIsSubmitting(false);
        return;
      }

      if (!/[0-9]/.test(password)) {
        toast({ variant: "destructive", title: "Password must contain at least one number" });
        setIsSubmitting(false);
        return;
      }

      if (!/[^A-Za-z0-9]/.test(password)) {
        toast({ variant: "destructive", title: "Password must contain at least one special character" });
        setIsSubmitting(false);
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            full_name: fullName.trim(),
            trial_tier: selectedTier,
          },
        },
      });

      if (signUpError) {
        // If already registered, guide them to sign in instead
        if (signUpError.message?.toLowerCase().includes("already registered") || signUpError.message?.toLowerCase().includes("already exists")) {
          toast({
            variant: "destructive",
            title: "Account Already Exists",
            description: "An account with this email already exists. Please sign in instead.",
          });
          onOpenChange(false);
          navigate(`/auth?mode=signin`);
        } else {
          toast({ variant: "destructive", title: "Sign Up Failed", description: signUpError.message });
        }
        return;
      }

      if (!signUpData.user) {
        toast({ variant: "destructive", title: "Sign Up Failed", description: "No user created. Please try again." });
        return;
      }

      if (signUpData.session) {
        // Session exists (auto-confirm enabled) — redirect to Stripe Checkout
        await redirectToStripeCheckout();
      } else {
        // Email verification required
        toast({
          title: "Check Your Email",
          description: "We sent a verification link. After verifying, you'll be able to start your trial.",
        });
        onOpenChange(false);
        navigate(`/auth?mode=signin&trial_tier=${selectedTier}`);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Something went wrong. Please try again." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <div className="p-2 rounded-lg bg-cyan-500/10">
              <TierIcon className="h-5 w-5 text-cyan-600" />
            </div>
            Start Your {tier.display} Trial
          </DialogTitle>
          <DialogDescription>
            3 days free &bull; 500 property exports &bull; Cancel anytime
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Trial benefits */}
          <div className="bg-cyan-50 dark:bg-cyan-950/20 rounded-lg p-4 border border-cyan-200 dark:border-cyan-800">
            <p className="text-sm font-medium text-cyan-800 dark:text-cyan-300 mb-2">
              What you get with {tier.display}:
            </p>
            <ul className="space-y-1.5">
              {tier.features.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-400">
                  <Check className="h-3.5 w-3.5 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Payment info callout */}
          <div className="flex items-start gap-3 bg-muted/50 rounded-lg p-3 border">
            <CreditCard className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground leading-relaxed">
              <span className="font-semibold text-foreground">$0 due today.</span>{" "}
              You won't be charged until {trialEndDate}. Cancel anytime before then.
            </div>
          </div>

          {/* Only show form fields if not logged in */}
          {!user && (
            <div className="space-y-3">
              <Input
                type="text"
                placeholder="Full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={isSubmitting}
                autoComplete="name"
              />
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
                autoComplete="email"
              />
              <Input
                type="password"
                placeholder="Password (min 8 chars, 1 number, 1 special)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
              />
            </div>
          )}

          {/* Terms checkbox */}
          <div className="flex items-start gap-2">
            <Checkbox
              id="terms"
              checked={agreedToTerms}
              onCheckedChange={(checked) => setAgreedToTerms(checked === true)}
              disabled={isSubmitting}
            />
            <label htmlFor="terms" className="text-sm text-muted-foreground leading-tight cursor-pointer">
              I agree to the{" "}
              <Link to="/terms" target="_blank" className="text-cyan-600 hover:underline">
                Terms of Service
              </Link>
            </label>
          </div>

          {/* Submit button */}
          <Button
            onClick={handleStartTrial}
            disabled={isSubmitting || (!user && (!fullName || !email || !password)) || !agreedToTerms}
            className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {user ? "Redirecting to checkout..." : "Creating account..."}
              </>
            ) : (
              "Start Free Trial"
            )}
          </Button>

          {/* Fallback link if redirect was blocked (mobile browsers) */}
          {fallbackUrl && !isSubmitting && (
            <a
              href={fallbackUrl}
              className="flex items-center justify-center gap-2 text-sm text-cyan-600 hover:underline font-medium"
            >
              <ExternalLink className="h-4 w-4" />
              Tap here to open checkout
            </a>
          )}

          <p className="text-xs text-center text-muted-foreground">
            Your trial starts immediately. No charges for 3 days.
            <br />
            Then ${tier.price}/month. Cancel anytime.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
