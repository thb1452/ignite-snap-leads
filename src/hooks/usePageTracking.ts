import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/analytics';
import { activityRouteTemplate } from '@/lib/analyticsPolicy';
import { logActivity } from '@/services/activityLogger';

/** Public GA acquisition events; existing first-party logs retain only fixed route templates. */
export function usePageTracking() {
  const { pathname } = useLocation();
  const lastPath = useRef<string | null>(null);
  useEffect(() => {
    if (lastPath.current === pathname) return; // Includes StrictMode effect replays.
    lastPath.current = pathname;
    trackPageView(pathname);
    const template = activityRouteTemplate(pathname);
    if (template) void logActivity({ action: 'page_view', pagePath: template });
  }, [pathname]);
}
