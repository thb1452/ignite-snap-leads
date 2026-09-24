import { publicPageContext, sanitizePublicEvent } from './analyticsPolicy.ts';

const MEASUREMENT_ID = 'G-W5JGFESNT0';
/** Must stay unset/false until stream enhanced measurement and privacy/consent controls are verified. */
const ENABLED = import.meta.env?.VITE_ENABLE_PUBLIC_ANALYTICS === 'true';
let initialized = false;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
    'ga-disable-G-W5JGFESNT0'?: boolean;
  }
}

function allowPublicCollection(path: string) {
  if (typeof window === 'undefined') return false;
  const context = publicPageContext(path);
  window['ga-disable-G-W5JGFESNT0'] = !ENABLED || !context;
  if (!ENABLED || !context) return false;
  if (!initialized) {
    // Do not inject or contact Google at all with the default closed release gate.
    window.dataLayer = window.dataLayer || [];
    // Match Google's documented gtag command queue format.
    // eslint-disable-next-line prefer-rest-params
    window.gtag = function () { window.dataLayer?.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
      ...context,
    });
    const tag = document.createElement('script');
    tag.async = true;
    tag.src = `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(tag);
    initialized = true;
  }
  return true;
}

/** No document.title, query string, hash, or external referrer is collected. */
export function trackPageView(path: string) {
  if (!allowPublicCollection(path)) return;
  const event = sanitizePublicEvent('page_view', path);
  if (event) window.gtag?.('event', event.name, event.params);
}

/** Only fixed public events with enum values are admitted; other fields are dropped. */
export function trackEvent(eventName: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (!allowPublicCollection(path)) return;
  const event = sanitizePublicEvent(eventName, path, params);
  if (event) window.gtag?.('event', event.name, event.params);
}

// A checkout intent is not a paid invoice. Client-side revenue/success tracking is excluded.
export const analytics = {
  paymentStarted: (plan?: string) => trackEvent('checkout_started', { plan }),
};
