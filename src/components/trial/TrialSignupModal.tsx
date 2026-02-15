import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useTrialStatus } from "@/hooks/useTrialStatus";
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
import { Check, Loader2, Zap, TrendingUp, Building2 } from "lucide-react";
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
    price: 119,
    icon: Zap,
    features: [
      "Code violation data",
      "Basic filters (location, category, search)",
      "SnapScore ranking",
    ],
  },
  professional: {
    display: "Pro",
    price: 249,
    icon: TrendingUp,
    features: [
      "All Starter features",
      "Pressure Level™ filtering",
      "Priority support",
    ],
  },
  enterprise: {
    display: "Elite",
    price: 499,
    icon: Building2,
    features: [
      "All Pro features",
      "Water shutoff data",
    ],
  },
};

interface TrialSignupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedTier: string;
}

export function TrialSignupModal({ open, onOpenChange, selectedTier }: TrialSignupModalProps) {
  const { user } = useAuth();
  const { startTrial } = useTrialStatus();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const tier = TIER_CONFIG[selectedTier] || TIER_CONFIG.starter;
  const TierIcon = tier.icon;

  const handleStartTrial = async () => {
    if (!agreedToTerms) {
      toast({ variant: "destructive", title: "Please agree to Terms of Service" });
      return;
    }

    setIsSubmitting(true);

    try {
      if (user) {
        // User already logged in — start trial directly
        const result = await startTrial(selectedTier);
        if (!result.success) {
          if (result.error === 'already_had_trial') {
            toast({ variant: "destructive", title: "Trial Already Used", description: "You've already started a trial. View your dashboard to continue." });
          } else if (result.error === 'already_has_subscription') {
            toast({ variant: "destructive", title: "Active Subscription", description: "You already have an active subscription." });
          } else {
            toast({ variant: "destructive", title: "Error", description: result.error || "Failed to start trial" });
          }
          return;
        }

        toast({ title: "🎉 Trial Started!", description: `Your 7-day ${tier.display} trial is active. You have 50 property exports.` });
        onOpenChange(false);
        navigate("/leads");
        return;
      }

      // Sign up new user
      if (!email || !password) {
        toast({ variant: "destructive", title: "Please enter email and password" });
        return;
      }

      if (password.length < 6) {
        toast({ variant: "destructive", title: "Password must be at least 6 characters" });
        return;
      }

      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: window.location.origin,
          data: {
            trial_tier: selectedTier,
          },
        },
      });

      if (signUpError) {
        toast({ variant: "destructive", title: "Sign Up Failed", description: signUpError.message });
        return;
      }

      if (!signUpData.user) {
        toast({ variant: "destructive", title: "Sign Up Failed", description: "No user created" });
        return;
      }

      // Wait for session to be established
      // The trial will be started after email verification or auto-confirm
      if (signUpData.session) {
        // Session exists (auto-confirm enabled) — start trial
        const result = await startTrial(selectedTier);
        if (result.success) {
          toast({ title: "🎉 Trial Started!", description: `Your 7-day ${tier.display} trial is active. You have 50 property exports.` });
          onOpenChange(false);
          navigate("/leads");
        } else {
          toast({ variant: "destructive", title: "Trial Error", description: result.error || "Failed to start trial" });
        }
      } else {
        // Email verification required
        toast({
          title: "Check Your Email",
          description: "We sent a verification link. After verifying, your trial will begin automatically.",
        });
        onOpenChange(false);
        navigate(`/auth?mode=signin&trial_tier=${selectedTier}`);
      }
    } catch (err: any) {
      toast({ variant: "destructive", title: "Error", description: err.message || "Something went wrong" });
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
            7 days free • 50 property exports • No credit card required
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
              <li className="flex items-center gap-2 text-sm text-cyan-700 dark:text-cyan-400">
                <Check className="h-3.5 w-3.5 shrink-0" />
                50 total property exports
              </li>
            </ul>
          </div>

          {/* Only show form fields if not logged in */}
          {!user && (
            <div className="space-y-3">
              <Input
                type="email"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isSubmitting}
              />
              <Input
                type="password"
                placeholder="Password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isSubmitting}
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
            disabled={isSubmitting || (!user && (!email || !password)) || !agreedToTerms}
            className="w-full bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-700 hover:to-teal-700 text-white"
            size="lg"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Starting Trial...
              </>
            ) : (
              "Start Free Trial"
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            Your trial starts immediately. No charges for 7 days.
            <br />
            Then ${tier.price}/month if you upgrade.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
