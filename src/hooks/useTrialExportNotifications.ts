import { useCallback } from "react";
import { useToast } from "@/hooks/use-toast";

/**
 * Shows milestone-based toast notifications during trial exports.
 * Called after each successful export with the updated usage count.
 */
export function useTrialExportNotifications() {
  const { toast } = useToast();

  const showExportNotification = useCallback(
    (newUsedCount: number, limit: number) => {
      const remaining = limit - newUsedCount;

      // First export
      if (newUsedCount === 1) {
        toast({
          title: "First Export!",
          description: `You just used 1 of ${limit} trial exports. ${remaining} remaining.`,
        });
        return;
      }

      // At limit (25 used)
      if (remaining <= 0) {
        toast({
          variant: "destructive",
          title: "Trial Exports Used",
          description: "Upgrade now to keep exporting.",
          duration: 8000,
        });
        return;
      }

      // Only 2 remaining
      if (remaining <= 2) {
        toast({
          variant: "destructive",
          title: `Only ${remaining} export${remaining !== 1 ? 's' : ''} remaining`,
          description: "Upgrade for unlimited monthly exports.",
          duration: 6000,
        });
        return;
      }

      // 10 remaining
      if (remaining <= 10 && remaining > 2) {
        toast({
          title: `${remaining} trial exports remaining`,
          description: "Upgrade to continue exporting after your trial.",
          duration: 5000,
        });
        return;
      }
    },
    [toast]
  );

  return { showExportNotification };
}
