import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronRight, ChevronLeft, BarChart3, CheckCircle2, MapPin } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";

interface OnboardingFlowProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const ONBOARDING_STEPS = [
  {
    title: "Welcome to Snap Ignite",
    icon: MapPin,
    content: <div className="space-y-4"><p>Snap brings municipal enforcement research and your private follow-up workflow together.</p><p className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-950">Customer record access, unlocks, exports, and new purchases are paused while we verify the relaunch. No customer market is currently approved.</p><p>Creating your account is free. It does not start a paid trial. Free unlocks are also paused.</p></div>,
  },
  {
    title: "Read the source before acting",
    icon: BarChart3,
    content: <div className="space-y-4"><p>Check the issuing agency, property match, event date, report date, and case status. Recently importing a record does not make it a new enforcement action.</p><p>Scores and AI summaries are research aids. A violation does not establish the current property condition, an owner's finances, or willingness to sell.</p></div>,
  },
  {
    title: "Keep your next action clear",
    icon: CheckCircle2,
    content: <div className="space-y-4"><p>Use your private pipeline to organize property research and follow-up when customer access is available. Do not rely on an empty property search as proof that a city has no enforcement activity.</p><p>For a coverage question, include the city and state in an email to <a className="underline" href="mailto:hello@snapignite.com">hello@snapignite.com</a>. No market alert is automatically created by this tutorial.</p></div>,
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
                "Open Dashboard"
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
