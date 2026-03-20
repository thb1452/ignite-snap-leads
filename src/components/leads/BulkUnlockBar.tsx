import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Lock, Unlock, CreditCard, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCreditBalance } from "@/hooks/useCredits";
import { useFreeUnlocks } from "@/hooks/useFreeUnlocks";
import { useQueryClient } from "@tanstack/react-query";

interface BulkUnlockBarProps {
  selectedIds: string[];
  unlockedSet: Set<string>;
  onUnlocked: () => void;
}

export function BulkUnlockBar({ selectedIds, unlockedSet, onUnlocked }: BulkUnlockBarProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: creditBalance = 0 } = useCreditBalance();
  const { freeUnlocksRemaining } = useFreeUnlocks();
  const queryClient = useQueryClient();

  const lockedIds = selectedIds.filter((id) => !unlockedSet.has(id));
  const unlockedCount = selectedIds.length - lockedIds.length;

  if (selectedIds.length === 0 || lockedIds.length === 0) return null;

  const totalCost = lockedIds.length * 5;
  const canUnlockWithBalance = freeUnlocksRemaining + creditBalance >= lockedIds.length;

  const handleUnlockAll = async () => {
    if (!user) return;
    setIsUnlocking(true);

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      let successCount = 0;
      let failCount = 0;

      // Unlock each property sequentially via edge function
      for (const propertyId of lockedIds) {
        try {
          const res = await fetch(
            `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/handle-unlock`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ property_id: propertyId }),
            }
          );

          const data = await res.json();
          if (res.ok && data.success) {
            successCount++;
          } else if (res.status === 402) {
            // Out of credits/free unlocks — redirect to buy credits
            toast({
              variant: "destructive",
              title: "Insufficient balance",
              description: `Unlocked ${successCount} of ${lockedIds.length}. Purchase more credits to continue.`,
            });
            break;
          } else {
            failCount++;
          }
        } catch {
          failCount++;
        }
      }

      if (successCount > 0) {
        toast({
          title: `${successCount} properties unlocked! 🔓`,
          description: failCount > 0
            ? `${failCount} failed. Check your credit balance.`
            : "Full addresses and contacts are now available.",
        });

        queryClient.invalidateQueries({ queryKey: ["unlocked-properties"] });
        queryClient.invalidateQueries({ queryKey: ["credits"] });
        queryClient.invalidateQueries({ queryKey: ["free-unlocks"] });
        onUnlocked();
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Bulk unlock failed",
        description: err.message,
      });
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleBuyCredits = async () => {
    if (!user) return;

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      // Find most cost-effective pack
      const packs = [
        { id: "pack_500", credits: 500, amount: 5000 },
        { id: "pack_1200", credits: 1200, amount: 10000 },
        { id: "pack_3000", credits: 3000, amount: 22500 },
      ];
      const needed = lockedIds.length;
      const bestPack = packs.find((p) => p.credits >= needed) || packs[packs.length - 1];

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-checkout-session`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            checkout_type: "credit_pack",
            pack_id: bestPack.id,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      if (data.url) window.location.href = data.url;
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Checkout failed",
        description: err.message,
      });
    }
  };

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-xl shadow-2xl px-5 py-3 flex items-center gap-4 max-w-lg">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">
          {selectedIds.length} selected · <span className="text-muted-foreground">{lockedIds.length} locked</span>
        </p>
        {unlockedCount > 0 && (
          <p className="text-xs text-muted-foreground">{unlockedCount} already unlocked</p>
        )}
      </div>

      {canUnlockWithBalance ? (
        <Button
          onClick={handleUnlockAll}
          disabled={isUnlocking}
          size="sm"
          className="gap-2 shrink-0"
        >
          {isUnlocking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Unlock className="h-4 w-4" />
          )}
          Unlock {lockedIds.length} leads
        </Button>
      ) : (
        <Button
          onClick={handleBuyCredits}
          size="sm"
          className="gap-2 shrink-0"
        >
          <CreditCard className="h-4 w-4" />
          Buy credits (${totalCost})
        </Button>
      )}
    </div>
  );
}
