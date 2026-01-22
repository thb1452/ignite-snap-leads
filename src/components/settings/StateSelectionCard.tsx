import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MapPin, Save, Loader2, Crown, Check } from "lucide-react";
import { useUserAllowedStates, US_STATES } from "@/hooks/useUserAllowedStates";
import { cn } from "@/lib/utils";

export function StateSelectionCard() {
  const {
    allowedStates,
    maxStates,
    isUnlimited,
    isLoading,
    isSaving,
    updateStates,
  } = useUserAllowedStates();

  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync with server data
  useEffect(() => {
    if (allowedStates.length > 0) {
      setSelectedStates(allowedStates);
    }
  }, [allowedStates]);

  // Track changes
  useEffect(() => {
    const changed = 
      selectedStates.length !== allowedStates.length ||
      selectedStates.some((s) => !allowedStates.includes(s));
    setHasChanges(changed);
  }, [selectedStates, allowedStates]);

  const handleToggleState = (stateCode: string) => {
    setSelectedStates((prev) => {
      if (prev.includes(stateCode)) {
        return prev.filter((s) => s !== stateCode);
      }
      
      // Check limit (unless unlimited)
      if (!isUnlimited && prev.length >= maxStates) {
        return prev; // At limit
      }
      
      return [...prev, stateCode];
    });
  };

  const handleSave = async () => {
    await updateStates(selectedStates);
  };

  const remainingSlots = isUnlimited ? Infinity : maxStates - selectedStates.length;
  const atLimit = !isUnlimited && remainingSlots <= 0;

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-primary" />
            <CardTitle>State Coverage</CardTitle>
          </div>
          {isUnlimited ? (
            <Badge variant="secondary" className="gap-1">
              <Crown className="h-3 w-3" />
              Unlimited
            </Badge>
          ) : (
            <Badge variant={atLimit ? "destructive" : "secondary"}>
              {selectedStates.length} / {maxStates} states
            </Badge>
          )}
        </div>
        <CardDescription>
          Select the states where you want to see property leads.
          {!isUnlimited && (
            <span className="block mt-1 text-xs">
              Your plan allows up to {maxStates} states. Upgrade for more coverage.
            </span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ScrollArea className="h-[400px] rounded-md border p-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {US_STATES.map((state) => {
              const isSelected = selectedStates.includes(state.code);
              const isDisabled = !isSelected && atLimit;

              return (
                <div
                  key={state.code}
                  className={cn(
                    "flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors",
                    isSelected && "bg-primary/10 border-primary",
                    isDisabled && "opacity-50 cursor-not-allowed",
                    !isSelected && !isDisabled && "hover:bg-muted"
                  )}
                  onClick={() => !isDisabled && handleToggleState(state.code)}
                >
                  <Checkbox
                    checked={isSelected}
                    disabled={isDisabled}
                    onCheckedChange={() => handleToggleState(state.code)}
                    className="pointer-events-none"
                  />
                  <span className="text-sm font-medium">{state.code}</span>
                  <span className="text-xs text-muted-foreground truncate">
                    {state.name}
                  </span>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Selected summary */}
        {selectedStates.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-2">
            <span className="text-sm text-muted-foreground mr-2">Selected:</span>
            {selectedStates.map((code) => (
              <Badge key={code} variant="outline" className="text-xs">
                {code}
              </Badge>
            ))}
          </div>
        )}

        {/* Save button */}
        <div className="flex justify-end pt-4 border-t">
          <Button
            onClick={handleSave}
            disabled={!hasChanges || isSaving}
            className="gap-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save States
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
