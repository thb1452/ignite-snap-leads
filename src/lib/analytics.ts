/**
 * GA4 Analytics utility — thin wrapper around gtag.
 * Measurement ID: G-W5JGFESNT0
 */

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

function gtag(...args: unknown[]) {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag(...args);
  }
}

/** Send a page_view for SPA route changes */
export function trackPageView(path: string, title?: string) {
  gtag('event', 'page_view', {
    page_path: path,
    page_title: title || document.title,
  });
}

/** Fire a custom GA4 event */
export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>
) {
  gtag('event', eventName, params);
}

// ── Pre-defined event helpers ──────────────────────────────

// Core funnel
export const analytics = {
  signupPageView: () => trackEvent('signup_page_view'),
  signupStarted: () => trackEvent('signup_started'),
  signupSubmitted: () => trackEvent('signup_submitted'),
  signupSuccess: () => trackEvent('signup_success'),
  signupFailed: (reason?: string) => trackEvent('signup_failed', { reason }),
  loginSuccess: () => trackEvent('login_success'),
  paymentStarted: (plan?: string) => trackEvent('payment_started', { plan }),
  paymentSuccess: (plan?: string) => trackEvent('payment_success', { plan }),
  paymentFailed: (reason?: string) => trackEvent('payment_failed', { reason }),

  // Product usage
  propertySearch: (query?: string) => trackEvent('property_search', { query }),
  filterUsed: (filterName: string, value?: string) =>
    trackEvent('filter_used', { filter_name: filterName, filter_value: value }),
  propertyViewed: (propertyId: string) =>
    trackEvent('property_viewed', { property_id: propertyId }),
  snapScoreClicked: (propertyId: string, score?: number) =>
    trackEvent('snap_score_clicked', { property_id: propertyId, score }),
};
