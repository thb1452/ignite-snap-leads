import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronLeft, Target, BarChart3, Lightbulb, Zap, CheckCircle2 } from "lucide-react";
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
          You've just unlocked municipal enforcement pressure intelligence.
        </p>
        <div className="p-4 bg-brand/5 border border-brand/20 rounded-lg">
          <p className="text-sm text-ink-700">
            <strong className="text-brand">Snap is NOT a lead list.</strong> It's an enforcement tracking platform
            that monitors where cities are applying code enforcement actions.
          </p>
        </div>
        <div className="space-y-2">
          <h4 className="font-semibold text-ink-900">What makes Snap different:</h4>
          <ul className="space-y-2 text-sm text-ink-600">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>Tracks enforcement pressure <strong>before</strong> market movement</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>AI-powered SnapScore identifies properties under <strong>highest pressure</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
              <span>900+ counties across all 50 states</span>
            </li>
          </ul>
        </div>
      </div>
    ),
  },
  {
    title: "Understanding SnapScore",
    icon: BarChart3,
    content: (
      <div className="space-y-4">
        <p className="text-ink-700">
          Every property gets a <strong>SnapScore</strong> from 0-100—a measure of enforcement intensity:
        </p>

        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
            <Badge className="bg-score-red text-score-red-foreground mt-0.5">75-100</Badge>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-ink-900">Critical Intensity</h4>
              <p className="text-xs text-ink-600">
                High-priority citations, extended duration, escalated enforcement.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <Badge className="bg-score-yellow text-score-yellow-foreground mt-0.5">25-74</Badge>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-ink-900">Moderate/High Intensity</h4>
              <p className="text-xs text-ink-600">
                Active enforcement cases with municipal attention.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Badge className="bg-score-blue text-score-blue-foreground mt-0.5">0-24</Badge>
            <div className="flex-1">
              <h4 className="font-semibold text-sm text-ink-900">Low Intensity</h4>
              <p className="text-xs text-ink-600">
                Minor citations or recently resolved cases.
              </p>
            </div>
          </div>
        </div>

        <p className="text-xs text-ink-500 mt-4">
          Calculated from: enforcement duration, municipal priority, repeat activity, agency involvement.
        </p>
      </div>
    ),
  },
  {
    title: "SnapInsight",
    icon: Lightbulb,
    content: (
      <div className="space-y-4">
        <p className="text-ink-700">
          Every property includes a <strong>SnapInsight</strong>—an AI-generated enforcement activity summary.
        </p>

        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-start gap-2 mb-2">
            <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5" />
            <h4 className="font-semibold text-sm text-green-900">Example SnapInsight</h4>
          </div>
          <p className="text-sm text-green-800 italic">
            "Active enforcement exceeds 180-day threshold. Multiple municipal agencies involved. Structural safety citation issued."
          </p>
        </div>

        <ul className="space-y-2 text-sm text-ink-600">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            <span>Summarizes enforcement activity based on municipal records</span>
          </li>
        </ul>
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
              <h4 className="font-semibold text-sm text-ink-900">Browse Properties</h4>
              <p className="text-xs text-ink-600">
                View properties under enforcement pressure across 900+ counties.
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
                Click any property to see AI-generated enforcement analysis.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              3
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Filter & Sort</h4>
              <p className="text-xs text-ink-600">
                <span className="text-ink-400">(Professional+ only)</span> Use SnapScore and advanced filters to identify highest-pressure properties.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand/10 text-brand font-bold flex items-center justify-center text-sm">
              4
            </div>
            <div>
              <h4 className="font-semibold text-sm text-ink-900">Export Data</h4>
              <p className="text-xs text-ink-600">
                Build lists and export property data for your analysis.
              </p>
            </div>
          </div>
        </div>

        <div className="p-4 bg-gradient-to-r from-brand/10 to-brand/5 border border-brand/20 rounded-lg mt-4">
          <p className="text-sm font-semibold text-brand mb-1">💡 Pro Tip:</p>
          <p className="text-sm text-ink-700">
            Properties with SnapScore 70+ AND 180+ days open indicate highest enforcement pressure.
          </p>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <p className="text-xs text-ink-500">
            SnapInsights and SnapScore are probabilistic interpretations of public enforcement signals.
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
    // Navigate to properties dashboard
    navigate('/properties');
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
