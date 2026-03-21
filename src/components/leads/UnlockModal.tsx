import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Unlock, CreditCard, Coins, Sparkles, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCreditBalance } from "@/hooks/useCredits";
import { useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";

interface UnlockModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  property: {
    id: string;
    address: string;
    city: string;
    state: string;
    snap_score: number | null;
    snap_insight: string | null;
  } | null;
  freeUnlocksRemaining: number;
  onUnlocked?: () => void;
}

export function UnlockModal({
  open,
  onOpenChange,
  property,
  freeUnlocksRemaining,
  onUnlocked,
}: UnlockModalProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isCheckingOut, setIsCheckingOut] = useState(false);
  const { toast } = useToast();
  const { data: creditBalance = 0 } = useCreditBalance();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  if (!property) return null;

  const canUseFreeUnlock = freeUnlocksRemaining > 0;
  const canUseCredit = creditBalance >= 1;

  const handleUnlockWithCredits = async () => {
    if (!user) return;
    setIsUnlocking(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-unlock`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ property_id: property.id }),
        }
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        if (res.status === 402) {
          toast({
            variant: "destructive",
            title: "Insufficient balance",
            description: "Purchase credits or subscribe to unlock properties.",
          });
        } else {
          throw new Error(data.error || "Unlock failed");
        }
        return;
      }

      toast({
        title: "Property unlocked! 🔓",
        description:
          data.source === "free_credit"
            ? `Free unlock used. ${data.free_remaining} remaining.`
            : `1 credit used. ${data.credits_remaining} credits remaining.`,
      });

      // Invalidate relevant queries
      queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
      queryClient.invalidateQueries({ queryKey: ["credits"] });
      queryClient.invalidateQueries({ queryKey: ["user", "credits"] });

      onUnlocked?.();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Unlock failed",
        description: err.message,
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleBuyUnlock = async () => {
    if (!user) return;
    setIsCheckingOut(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            checkout_type: "single_unlock",
            property_id: property.id,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");

      if (data.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: err.message,
      });
    } finally {
      setIsCheckingOut(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "bg-muted";
    if (score >= 75) return "bg-red-500";
    if (score >= 50) return "bg-orange-500";
    if (score >= 25) return "bg-yellow-500";
    return "bg-blue-500";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            Unlock Property
          </DialogTitle>
          <DialogDescription>
            Get full address, owner contacts, and export access.
          </DialogDescription>
        </DialogHeader>

        {/* Property Summary */}
        <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-foreground truncate">
              {property.city}, {property.state}
            </p>
            <Badge
              className={`${getScoreColor(property.snap_score)} text-white text-xs font-bold`}
            >
              🔥 {property.snap_score ?? 0}
            </Badge>
          </div>
          {property.snap_insight && (
            <p className="text-xs text-muted-foreground line-clamp-2">
              {property.snap_insight}
            </p>
          )}
        </div>

        {/* Unlock Options */}
        <div className="space-y-3">
          {/* Free unlock */}
          {canUseFreeUnlock && (
            <Button
              onClick={handleUnlockWithCredits}
              disabled={isUnlocking}
              className="w-full gap-2 bg-emerald-600 hover:bg-emerald-700"
              size="lg"
            >
              {isUnlocking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Use Free Unlock ({freeUnlocksRemaining} left)
            </Button>
          )}

          {/* Credit unlock */}
          {canUseCredit && !canUseFreeUnlock && (
            <Button
              onClick={handleUnlockWithCredits}
              disabled={isUnlocking}
              className="w-full gap-2"
              size="lg"
            >
              {isUnlocking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Coins className="h-4 w-4" />
              )}
              Use 1 Credit ({creditBalance} available)
            </Button>
          )}

          {/* Buy single unlock */}
          <Button
            variant={canUseFreeUnlock || canUseCredit ? "outline" : "default"}
            onClick={handleBuyUnlock}
            disabled={isCheckingOut}
            className="w-full gap-2"
            size="lg"
          >
            {isCheckingOut ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CreditCard className="h-4 w-4" />
            )}
            Buy Unlock — $0.97
          </Button>

          {/* Subscribe CTA */}
          {!canUseFreeUnlock && !canUseCredit && (
            <p className="text-xs text-center text-muted-foreground">
              Or{" "}
              <a href="/pricing" className="text-primary hover:underline font-medium">
                subscribe for monthly unlocks
              </a>
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
