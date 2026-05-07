import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, BarChart3, Lock, Zap, CheckCircle2, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { PAYG_PRICE_DISPLAY } from "@/lib/pricing";

interface OnboardingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const ONBOARDING_STEPS = [
  {
    title: "Start with a market to monitor",
    icon: MapPin,
    content: (
      <div className="space-y-4">
        <p className="text-lg text-ink-700 font-medium">
          Enforcement intelligence for monitoring municipal pressure — not another disposable lead list.
        </p>
        <div className="p-4 bg-brand/5 border border-brand/20 rounded-lg">
          <p className="text-sm text-ink-700">
            Choose a city or market, then use Snap to monitor active code violations, water shutoffs, repeat notices, and city enforcement across{" "}
            <strong className="text-brand">3,800+ cities</strong>. Every property gets a{" "}
            <strong className="text-brand">2-sentence Investor Brief</strong> that explains the visible pressure signals before you unlock.
          </p>
        </div>
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Lock className="h-4 w-4 text-ink-400" />
            <span className="text-xs font-semibold text-ink-500 uppercase tracking-wide">
              Example Property Card
            </span>
          </div>
          <p className="text-sm text-ink-300 italic select-none">
            ███ Oak Street, Austin TX
          </p>
          <p className="text-xs text-ink-600 mt-2">
            "Active water shutoff notice filed. City enforcement escalated to structural review — pressure signal changed this cycle."
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-score-red text-score-red-foreground text-xs">SnapScore 94</Badge>
            <Lock className="h-3 w-3 text-ink-400" />
            <span className="text-xs text-ink-400">Address locked</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Browse free. Unlock when the signal is strong.",
    icon: Lock,
    content: (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <h4 className="font-semibold text-sm text-ink-900 mb-2">Free</h4>
            <ul className="space-y-1.5 text-xs text-ink-600">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                AI Investor Brief preview
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                SnapScore (0–100)
              </li>
              <li className="flex items-start gap-1.5">
                <Lock className="h-3.5 w-3.5 text-ink-400 mt-0.5 flex-shrink-0" />
                <span className="text-ink-400">Street name + city/state only</span>
              </li>
            </ul>
          </div>
          <div className="p-3 bg-brand/5 border border-brand/30 rounded-lg">
            <h4 className="font-semibold text-sm text-brand mb-2">Unlocked ({PAYG_PRICE_DISPLAY})</h4>
            <ul className="space-y-1.5 text-xs text-ink-600">
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                Full property address
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                Contact-ready details when available
              </li>
              <li className="flex items-start gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                Export to CSV
              </li>
            </ul>
          </div>
        </div>
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>No monthly fee required.</strong> Pay {PAYG_PRICE_DISPLAY} per credit for selective unlocks, or subscribe when monitoring becomes a weekly workflow.
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "Understand the signal",
    icon: BarChart3,
    content: (
      <div className="space-y-4">
        <p className="text-ink-700">
          Every property includes a 2-sentence plain-English{" "}
          <strong>Investor Brief</strong> and a <strong>SnapScore</strong> from 0–100 based on visible enforcement signals.
        </p>

        <div className="space-y-2">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <Badge className="bg-score-red text-score-red-foreground mt-0.5 flex-shrink-0">
              70–100
            </Badge>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">HIGH PRESSURE</h4>
              <p className="text-xs text-ink-600">Strong visible signal — review before outreach.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <Badge className="bg-score-yellow text-score-yellow-foreground mt-0.5 flex-shrink-0">
              40–69
            </Badge>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">ACTIVE SIGNAL</h4>
              <p className="text-xs text-ink-600">Worth monitoring and comparing against your market.</p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Badge className="bg-score-blue text-score-blue-foreground mt-0.5 flex-shrink-0">
              0–39
            </Badge>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">WATCH</h4>
              <p className="text-xs text-ink-600">Emerging or lower-priority signal to revisit later.</p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <Badge className="bg-score-red text-score-red-foreground text-xs">SnapScore 100</Badge>
            <span className="font-bold text-xs text-red-700">HIGH PRESSURE</span>
          </div>
          <p className="text-xs text-green-800 italic">
            "Active water shutoff notice filed. City enforcement escalated — review the
            visible pressure before outreach."
          </p>
        </div>
      </div>
    ),
  },
  {
    title: "Pay as you go, or subscribe for weekly monitoring",
    icon: Zap,
    content: (
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              $
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Pay‑as‑you‑go</h4>
              <p className="text-xs text-ink-600">{PAYG_PRICE_DISPLAY} per credit for selective unlocks. No commitment.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              S
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Starter — $49/mo</h4>
              <p className="text-xs text-ink-600">750 credits/month for recurring market checks.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-brand/5 border border-brand/30 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/20 text-brand font-bold flex items-center justify-center text-sm">
              P
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Pro — $99/mo</h4>
              <p className="text-xs text-ink-600">1,500 credits/month + pressure filters for weekly monitoring.</p>
            </div>
          </div>

          <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              E
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Elite — $199/mo</h4>
              <p className="text-xs text-ink-600">3,000 credits/month + water shutoff data for multi-market monitoring.</p>
            </div>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-200">
          <p className="text-xs text-ink-500">
            Investor Briefs and SnapScore interpret public/property pressure signals; they do
            not claim that an owner wants to sell.
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
    // Navigate to properties dashboard
    navigate('/leads');
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
                "Get Started"
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
