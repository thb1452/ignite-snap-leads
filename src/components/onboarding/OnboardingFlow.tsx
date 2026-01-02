import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, Target, TrendingUp, Zap, Shield, MapPin, Lightbulb, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const ONBOARDING_STEPS = [
  {
    title: "Welcome to Snap",
    icon: Target,
    content: (
      <div className="space-y-4">
        <p className="text-lg text-ink-700 font-medium">
          You've just unlocked the most powerful distressed property intelligence platform for real estate investors.
        </p>
        <div className="p-4 bg-brand/5 border border-brand/20 rounded-lg">
          <p className="text-sm text-ink-700">
            <strong className="text-brand">Snap is NOT a lead list.</strong> It's a distress signal analysis platform
            that converts municipal enforcement pressure into investor-ready opportunities.
          </p>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-ink-900">What makes Snap different:</h4>
          <ul className="space-y-2 text-sm text-ink-600">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Detects regulatory stress <strong>before</strong> market movement</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>AI-powered scoring identifies properties with <strong>high likelihood</strong> of motivated sellers</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Legally safe insights—no raw city language exposure</span>
            </li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    title: "Understanding SnapScore",
    icon: TrendingUp,
    content: (
      <div className="space-y-4">
        <p className="text-ink-700">
          Every property gets a <strong>SnapScore</strong> from 0-100—a probabilistic indicator that answers:
        </p>
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm font-medium text-amber-900">
            "Based on enforcement signals, what's the likelihood this property has a motivated seller?"
          </p>
        </div>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <Badge className="bg-score-red text-score-red-foreground mt-0.5">70-100</Badge>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-ink-900">Distressed</h4>
              <p className="text-xs text-ink-600">
                Severe signals, chronic neglect indicators, legal escalation. Higher likelihood of motivated seller.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-200 rounded-lg">
            <Badge className="bg-score-orange text-score-orange-foreground mt-0.5">40-69</Badge>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-ink-900">Value-Add</h4>
              <p className="text-xs text-ink-600">
                Moderate signals. Indicators suggest owner may be open to negotiation.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Badge className="bg-score-blue text-score-blue-foreground mt-0.5">0-39</Badge>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-ink-900">Watch</h4>
              <p className="text-xs text-ink-600">
                Minor issues. Monitor for escalation.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-ink-500 mt-4">
          Calculated from: time open, severity, repeat offenses, multi-department enforcement, legal escalation, and vacancy signals.
        </p>
      </div>
    ),
  },
  {
    title: "SnapInsight: What to Expect",
    icon: Lightbulb,
    content: (
      <div className="space-y-4">
        <p className="text-ink-700">
          Every property includes a <strong>SnapInsight</strong>—an AI-generated summary that explains
          <strong> why you should care</strong> as an investor.
        </p>

        <div className="grid gap-3">
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-2 mb-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
              <h4 className="font-semibold text-sm text-green-900">Example SnapInsight</h4>
            </div>
            <p className="text-sm text-green-800 italic">
              "Extended non-compliance period (180+ days) with structural indicators suggests owner capacity constraints
              and may indicate negotiation opportunity."
            </p>
            <p className="text-xs text-green-700 mt-2">
              ✓ Focuses on property condition and owner situation
            </p>
          </div>

          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <h4 className="font-semibold text-sm text-red-900 mb-2">What You'll NEVER See</h4>
            <p className="text-sm text-red-800 line-through">
              "Tenant complained about rats. City inspector found illegal occupancy."
            </p>
            <p className="text-xs text-red-700 mt-2">
              ✗ Raw city language—legal risk
            </p>
          </div>
        </div>

        <div className="p-3 bg-brand/5 border border-brand/20 rounded-lg">
          <p className="text-xs text-ink-700">
            <Shield className="h-3.5 w-3.5 inline mr-1 text-brand" />
            <strong>Legal Protection:</strong> Snap stores raw city notes internally but NEVER exposes them to users.
            Only AI-generated, legally safe summaries appear in the interface.
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "Your Workflow",
    icon: Zap,
    content: (
      <div className="space-y-4">
        <p className="text-ink-700">Here's how to use Snap effectively:</p>

        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              1
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Filter by SnapScore</h4>
              <p className="text-xs text-ink-600">
                Start with 70+ scores for distressed opportunities. Adjust filters by jurisdiction, violation type, and days open.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              2
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Read SnapInsights</h4>
              <p className="text-xs text-ink-600">
                Click any property to see detailed insights, violation history, and distress signals.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              3
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Skip Trace & Export</h4>
              <p className="text-xs text-ink-600">
                Run skip trace to find owner contact info. Export high-value lists for your calling campaigns.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              4
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Make Offers</h4>
              <p className="text-xs text-ink-600">
                Reach out to owners with confidence. You're contacting them BEFORE the market knows about their distress.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-brand/10 to-brand/5 border border-brand/20 rounded-lg mt-4">
          <p className="text-sm font-semibold text-brand mb-1">Pro Tip:</p>
          <p className="text-sm text-ink-700">
            Properties with SnapScore 70+ AND 180+ days open AND fire/structural violations have the highest
            conversion rates. Use the map view to identify geographic clusters.
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "Ready to Find Deals",
    icon: MapPin,
    content: (
      <div className="space-y-4">
        <p className="text-lg text-ink-700 font-medium">
          You're all set! Here's what to do next:
        </p>

        <div className="grid gap-3">
          <div className="p-4 border-2 border-brand rounded-lg bg-brand/5">
            <h4 className="font-semibold text-ink-900 mb-2">1. Explore Your Leads</h4>
            <p className="text-sm text-ink-600 mb-3">
              Browse distressed properties in your area. Sort by SnapScore to find the hottest opportunities.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = '/leads';
              }}
            >
              Go to Leads
            </Button>
          </div>

          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold text-ink-900 mb-2">2. Learn the System</h4>
            <p className="text-sm text-ink-600 mb-3">
              Read the full documentation to understand scoring methodology and legal positioning.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = '/how-snap-works';
              }}
            >
              How Snap Works
            </Button>
          </div>

          <div className="p-4 border rounded-lg">
            <h4 className="font-semibold text-ink-900 mb-2">3. Upload Your Data (Admins/VAs)</h4>
            <p className="text-sm text-ink-600 mb-3">
              If you have FOIA responses or city CSV files, upload them to expand your coverage.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={(e) => {
                e.stopPropagation();
                window.location.href = '/upload';
              }}
            >
              Upload Data
            </Button>
          </div>
        </div>

        <div className="p-4 bg-green-50 border border-green-200 rounded-lg mt-4">
          <p className="text-sm text-green-900 font-semibold mb-1">
            🎯 Your Competitive Edge
          </p>
          <p className="text-sm text-green-800">
            You now have access to distress signals that other investors won't see until properties hit
            foreclosure lists or MLS. Use this asymmetric information wisely.
          </p>
        </div>

        {/* Disclaimers */}
        <div className="mt-6 pt-4 border-t border-slate-200 space-y-2">
          <p className="text-xs text-ink-500">
            SnapInsights and SnapScore are probabilistic interpretations of public enforcement signals, not statements of fact or allegations about property owners.
          </p>
          <p className="text-xs text-ink-500">
            Snap is designed for real estate investment analysis and does not provide consumer credit, tenant screening, or eligibility determinations.
          </p>
        </div>
      </div>
    ),
  },
];

export function OnboardingFlow({ open, onOpenChange, onComplete }: OnboardingFlowProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();

  const handleNext = () => {
    if (currentStep < ONBOARDING_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    onComplete?.();
    onOpenChange(false);
    // Store onboarding completion in localStorage
    localStorage.setItem('snap_onboarding_completed', 'true');
  };

  const handleSkip = () => {
    handleComplete();
  };

  const step = ONBOARDING_STEPS[currentStep];
  const Icon = step.icon;
  const isFirstStep = currentStep === 0;
  const isLastStep = currentStep === ONBOARDING_STEPS.length - 1;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-brand/10 flex items-center justify-center">
                <Icon className="h-5 w-5 text-brand" />
              </div>
              <DialogTitle className="text-xl">{step.title}</DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-400">
                {currentStep + 1} / {ONBOARDING_STEPS.length}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-brand"
              initial={{ width: 0 }}
              animate={{ width: `${((currentStep + 1) / ONBOARDING_STEPS.length) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
        </DialogHeader>

        {/* Content with Animation */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="py-4"
          >
            {step.content}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <div>
            {!isFirstStep && (
              <Button variant="ghost" onClick={handlePrevious} className="gap-1">
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isLastStep && (
              <Button variant="ghost" onClick={handleSkip} className="text-ink-500">
                Skip
              </Button>
            )}
            <Button onClick={handleNext} className="gap-1">
              {isLastStep ? (
                <>
                  Get Started
                  <CheckCircle2 className="h-4 w-4" />
                </>
              ) : (
                <>
                  Next
                  <ChevronRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
