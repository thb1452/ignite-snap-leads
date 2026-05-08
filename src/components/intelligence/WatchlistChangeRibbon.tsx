import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useWatchlistChangeCount,
  useMarkMyWatchlistEventsSeen,
} from "@/hooks/useWatchlistChangeCount";
import { useUserRole } from "@/hooks/useUserRole";

const SESSION_DISMISS_KEY = "watchlist-ribbon-dismissed";

/**
 * Admin-only ribbon that surfaces unseen watchlist intelligence events
 * for the current user. Reads the RLS-scoped table directly — no backend
 * changes, no broadcast queries.
 *
 * Behavior:
 *   - Renders only when (isAdmin && count > 0 && not session-dismissed)
 *   - Click "View" marks all unread events as seen (fire-and-forget RPC),
 *     then navigates to /saved. The mark-seen call is non-blocking — if
 *     the RPC fails or the migration isn't applied, navigation still
 *     happens cleanly.
 *   - Dismiss is session-only (sessionStorage); does NOT mark events seen
 *     server-side. Dismiss = "I don't want to see this right now."
 *     View = "I'm acting on this; advance my state."
 *
 * P1.6c admin-preview surface. Once the UX is validated here, the same
 * component can drop the isAdmin gate to ship to all users.
 */
export function WatchlistChangeRibbon() {
  const navigate = useNavigate();
  const { isAdmin } = useUserRole();
  const { data: count = 0, isLoading } = useWatchlistChangeCount();
  const markSeen = useMarkMyWatchlistEventsSeen();

  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(SESSION_DISMISS_KEY) === "1";
  });

  if (!isAdmin || isLoading || count === 0 || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    try {
      window.sessionStorage.setItem(SESSION_DISMISS_KEY, "1");
    } catch {
      /* sessionStorage unavailable; in-memory dismiss still works */
    }
    setDismissed(true);
  };

  const handleView = () => {
    // Fire-and-forget: don't block navigation on the mark-seen RPC.
    // Errors are swallowed inside markSeen — partial rollback (SQL only)
    // is safe; the click still navigates to /saved.
    void markSeen();
    navigate("/saved");
  };

  const label = count === 1 ? "change" : "changes";

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-6 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30"
    >
      <Bell className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="flex-1 text-sm">
        <span className="font-semibold text-amber-900 dark:text-amber-100">
          {count.toLocaleString()} {label}
        </span>
        <span className="text-amber-800/80 dark:text-amber-200/80">
          {" "}in your watchlist this week
        </span>
        <span className="ml-2 rounded-full bg-amber-200/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
          Admin preview
        </span>
      </div>
      <Button
        size="sm"
        variant="outline"
        onClick={handleView}
        className="border-amber-300 bg-white hover:bg-amber-100 dark:border-amber-800 dark:bg-transparent"
      >
        View <ArrowRight className="ml-1 h-3.5 w-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        onClick={handleDismiss}
        aria-label="Dismiss for this session"
        className="h-8 w-8 text-amber-700 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
