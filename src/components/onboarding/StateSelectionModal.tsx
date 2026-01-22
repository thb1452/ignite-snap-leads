import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Loader2, ArrowRight, Sparkles } from "lucide-react";
import { useUserAllowedStates, US_STATES } from "@/hooks/useUserAllowedStates";
import { cn } from "@/lib/utils";

interface StateSelectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

// Popular states for quick selection
const POPULAR_STATES = ["TX", "CA", "FL", "AZ", "GA", "NC", "TN", "OH", "PA", "NY"];

export function StateSelectionModal({
  open,
  onOpenChange,
  onComplete,
}: StateSelectionModalProps) {
  const {
    maxStates,
    isUnlimited,
    isSaving,
    updateStates,
  } = useUserAllowedStates();

  const [selectedStates, setSelectedStates] = useState<string[]>([]);

  const handleToggleState = (stateCode: string) => {
    setSelectedStates((prev) => {
      if (prev.includes(stateCode)) {
        return prev.filter((s) => s !== stateCode);
      }
      
      // Check limit (unless unlimited)
      if (!isUnlimited && prev.length >= maxStates) {
        return prev;
      }
      
      return [...prev, stateCode];
    });
  };

  const handleContinue = async () => {
    if (selectedStates.length === 0) return;
    
    const success = await updateStates(selectedStates);
    if (success) {
      onComplete();
    }
  };

  const remainingSlots = isUnlimited ? Infinity : maxStates - selectedStates.length;
  const atLimit = !isUnlimited && remainingSlots <= 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <MapPin className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-xl">
              Select Your States
            </DialogTitle>
          </div>
          <DialogDescription className="text-base">
            Choose the states where you want to find property leads. 
            {!isUnlimited && (
              <span className="block mt-1">
                Your plan allows up to <strong>{maxStates} states</strong>.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Selection counter */}
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-muted-foreground">
              {selectedStates.length > 0 ? (
                <>Selected: {selectedStates.join(", ")}</>
              ) : (
                "No states selected yet"
              )}
            </span>
            <Badge variant={atLimit ? "destructive" : "secondary"}>
              {selectedStates.length} / {isUnlimited ? "∞" : maxStates}
            </Badge>
          </div>

          {/* Popular states quick select */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Sparkles className="h-4 w-4" />
              Popular States
            </div>
            <div className="flex flex-wrap gap-2">
              {POPULAR_STATES.map((code) => {
                const isSelected = selectedStates.includes(code);
                const isDisabled = !isSelected && atLimit;
                
                return (
                  <Button
                    key={code}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    disabled={isDisabled}
                    onClick={() => handleToggleState(code)}
                    className="h-8"
                  >
                    {code}
                  </Button>
                );
              })}
            </div>
          </div>

          {/* All states grid */}
          <ScrollArea className="h-[280px] rounded-md border p-3">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {US_STATES.map((state) => {
                const isSelected = selectedStates.includes(state.code);
                const isDisabled = !isSelected && atLimit;

                return (
                  <div
                    key={state.code}
                    className={cn(
                      "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all",
                      isSelected && "bg-primary text-primary-foreground border-primary",
                      isDisabled && "opacity-40 cursor-not-allowed",
                      !isSelected && !isDisabled && "hover:bg-muted hover:border-muted-foreground/30"
                    )}
                    onClick={() => !isDisabled && handleToggleState(state.code)}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={isDisabled}
                      className={cn(
                        "pointer-events-none",
                        isSelected && "border-primary-foreground data-[state=checked]:bg-primary-foreground data-[state=checked]:text-primary"
                      )}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm font-medium">{state.code}</span>
                      <span className={cn(
                        "text-xs truncate",
                        isSelected ? "text-primary-foreground/80" : "text-muted-foreground"
                      )}>
                        {state.name}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => setSelectedStates([])}
            disabled={selectedStates.length === 0}
          >
            Clear All
          </Button>
          <Button
            onClick={handleContinue}
            disabled={selectedStates.length === 0 || isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
