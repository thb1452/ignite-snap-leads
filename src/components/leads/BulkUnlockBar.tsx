import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Unlock, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { useCreditBalance } from "@/hooks/useCredits";
import { useFreeUnlocks } from "@/hooks/useFreeUnlocks";
import { useQueryClient } from "@tanstack/react-query";
import { useFeatureAccess } from "@/hooks/useFeatureAccess";

interface BulkUnlockBarProps {
  selectedIds: string[];
  unlockedSet: Set<string>;
  onUnlocked: () => void;
  onGetCredits?: (lockedCount: number) => void;
}

const CONCURRENCY = 5; // parallel unlock requests

export function BulkUnlockBar({ selectedIds, unlockedSet, onUnlocked, onGetCredits }: BulkUnlockBarProps) {
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: creditBalance = 0 } = useCreditBalance();
  const { freeUnlocksRemaining } = useFreeUnlocks();
  const queryClient = useQueryClient();
  const { isElitePlan } = useFeatureAccess();

  const addToOptimisticSet = (ids: string[]) => {
    if (!user?.id || ids.length === 0) return;
    queryClient.setQueryData(["optimistic-unlocked", user.id], (old: unknown) => {
      const next = old instanceof Set ? new Set(old) : new Set<string>();
      for (const id of ids) next.add(id);
      return next;
    });
    queryClient.setQueryData(["confirmed-unlocked-local", user.id], (old: unknown) => {
      const next = old instanceof Set ? new Set(old) : new Set<string>();
      for (const id of ids) next.add(id);
      return next;
    });
  };

  // For large selections where unlockedSet only has partial data,
  // only count known unlocks — assume the rest are locked
  const knownUnlocked = selectedIds.filter((id) => unlockedSet.has(id)).length;
  const estimatedLocked = selectedIds.length - knownUnlocked;

  // Elite users never see this bar — all properties are auto-unlocked
  if (isElitePlan || selectedIds.length === 0 || estimatedLocked === 0) return null;

  const canUnlockWithBalance = freeUnlocksRemaining + creditBalance >= estimatedLocked;

  const handleUnlockAll = async () => {
    if (!user) return;
    setIsUnlocking(true);

    const lockedIds = selectedIds.filter((id) => !unlockedSet.has(id));
    setProgress({ done: 0, total: lockedIds.length });

    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error("Not authenticated");

      let successCount = 0;
      let failCount = 0;
      let hitPaywall = false;
      const successfulIds: string[] = [];

      // Process in concurrent batches for speed
      for (let i = 0; i < lockedIds.length; i += CONCURRENCY) {
        if (hitPaywall) break;

        const batch = lockedIds.slice(i, i + CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map(async (propertyId) => {
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
            return { ok: res.ok, status: res.status, data, propertyId };
          })
        );

        for (const result of results) {
          if (result.status === "fulfilled") {
            const { ok, status, data, propertyId } = result.value;
            if (ok && data.success) {
              successCount++;
              successfulIds.push(propertyId);
            } else if (status === 402) {
              hitPaywall = true;
            } else {
              failCount++;
            }
          } else {
            failCount++;
          }
        }

        // Optimistically unblur each batch as it finishes so the user sees instant feedback
        if (successfulIds.length > 0) {
          addToOptimisticSet(successfulIds.slice(i, i + CONCURRENCY));
        }

        setProgress({ done: Math.min(i + CONCURRENCY, lockedIds.length), total: lockedIds.length });
      }

      if (hitPaywall && successCount < lockedIds.length) {
        toast({
          variant: "destructive",
          title: "Insufficient balance",
          description: `Unlocked ${successCount} of ${lockedIds.length}. Purchase more credits to continue.`,
        });
      }

      if (successCount > 0) {
        // Update optimistic set with all successful IDs immediately so blur clears without waiting for refetch
        addToOptimisticSet(successfulIds);

        toast({
          title: `${successCount} properties unlocked! 🔓`,
          description: failCount > 0
            ? `${failCount} failed. Check your credit balance.`
            : "Full addresses and contacts are now available.",
        });

        queryClient.refetchQueries({ queryKey: ["unlocked-properties"] });
        queryClient.invalidateQueries({ queryKey: ["credits"] });
        queryClient.invalidateQueries({ queryKey: ["subscription-usage"] });
        queryClient.invalidateQueries({ queryKey: ["free-unlocks"] });
        queryClient.invalidateQueries({ queryKey: ["subscription"] });
        queryClient.invalidateQueries({ queryKey: ["trial-status"] });
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
      setProgress({ done: 0, total: 0 });
    }
  };

  const progressPercent = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 bg-background border rounded-xl shadow-2xl px-5 py-3 flex flex-col gap-2 max-w-lg w-[90vw]">
      <div className="flex items-center gap-4">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {selectedIds.length.toLocaleString()} selected · <span className="text-muted-foreground">{estimatedLocked.toLocaleString()} locked</span>
          </p>
          {knownUnlocked > 0 && (
            <p className="text-xs text-muted-foreground">{knownUnlocked.toLocaleString()} already unlocked</p>
          )}
          {!canUnlockWithBalance && !isUnlocking && (
            <p className="text-xs text-orange-600">Not enough credits — purchase more to unlock</p>
          )}
        </div>

        <Button
          disabled={isUnlocking}
          size="sm"
          className="gap-2 shrink-0"
          onClick={canUnlockWithBalance ? handleUnlockAll : () => onGetCredits?.(estimatedLocked)}
        >
          {isUnlocking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Unlock className="h-4 w-4" />
          )}
          {canUnlockWithBalance
            ? `Unlock ${estimatedLocked.toLocaleString()} leads`
            : `Get credits to unlock ${estimatedLocked.toLocaleString()}`}
        </Button>
      </div>

      {/* Progress bar during bulk unlock */}
      {isUnlocking && progress.total > 0 && (
        <div className="space-y-1">
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">
            Unlocking… {progress.done.toLocaleString()} / {progress.total.toLocaleString()} ({progressPercent}%)
          </p>
        </div>
      )}
    </div>
  );
}
