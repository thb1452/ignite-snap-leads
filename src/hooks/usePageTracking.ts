import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageView } from '@/lib/analytics';
import { logActivity } from '@/services/activityLogger';

/** Fires a GA4 page_view + audit log on every SPA route change. */
export function usePageTracking() {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname + location.search;
    trackPageView(path);
    logActivity({ action: 'page_view', pagePath: location.pathname });
  }, [location]);
}
