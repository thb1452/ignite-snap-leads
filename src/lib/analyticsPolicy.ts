/** Collection policy for low-cardinality public acquisition measurement only.
 * No raw URL, title, search text, error text, contact, account, or property identifier
 * may become an analytics field through this module.
 */
const PUBLIC_ROUTE_TITLES: Readonly<Record<string, string>> = {
  '/': 'Snap Ignite',
  '/pricing': 'Plan pricing',
  '/about': 'About Snap Ignite',
  '/privacy': 'Privacy',
  '/privacy-policy': 'Privacy',
  '/terms': 'Terms',
  '/terms-and-conditions': 'Terms',
  '/blog': 'Blog',
  '/code-violation-leads': 'Code violation research',
  '/distressed-property-data': 'Property research data',
  '/code-enforcement-data': 'Code enforcement data',
  '/municipal-enforcement-data': 'Municipal enforcement data',
  '/real-estate-distress-signals': 'Enforcement signals',
  '/off-market-property-leads': 'Property research',
  '/how-investors-find-distressed-properties': 'Investor research workflow',
  '/code-violations': 'Market availability',
  '/live-feed': 'Record updates',
};

const CANONICAL_ORIGIN = 'https://snapignite.com';
const EVENT_ENUMS: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  hero_cta_click: { location: ['hero', 'navigation', 'footer'] },
  pricing_plan_selected: { plan: ['free', 'payg', 'starter', 'professional', 'enterprise', 'custom'] },
  checkout_started: { plan: ['payg', 'starter', 'professional', 'enterprise', 'bulk'] },
};

function routePath(input: unknown): string | null {
  if (typeof input !== 'string' || !input.startsWith('/') || input.startsWith('//') || input.includes('\\') || [...input].some(char => char.charCodeAt(0) < 32)) return null;
  const path = input.split(/[?#]/, 1)[0];
  return path === '/' ? '/' : path.replace(/\/+$/, '');
}

export function publicPageContext(input: unknown): Record<string, string> | null {
  const path = routePath(input);
  if (!path || !Object.prototype.hasOwnProperty.call(PUBLIC_ROUTE_TITLES, path)) return null;
  return {
    page_path: path,
    page_location: `${CANONICAL_ORIGIN}${path}`,
    page_title: PUBLIC_ROUTE_TITLES[path],
    // Referrers can contain auth codes, search text and customer record IDs.
    page_referrer: '',
  };
}

export function sanitizePublicEvent(event: string, inputPath: unknown, params: Record<string, unknown> = {}) {
  const context = publicPageContext(inputPath);
  if (!context) return null;
  if (event === 'page_view') return { name: event, params: context };
  if (!Object.prototype.hasOwnProperty.call(EVENT_ENUMS, event)) return null;
  const safe: Record<string, string> = { ...context };
  for (const [key, allowed] of Object.entries(EVENT_ENUMS[event])) {
    const value = params[key];
    if (typeof value === 'string' && allowed.includes(value)) safe[key] = value;
  }
  return { name: event, params: safe };
}

const PRIVATE_STATIC_ROUTES = new Set([
  '/auth', '/reset-password', '/checkout/success', '/owner/source-review', '/upload', '/app', '/leads', '/properties',
  '/lists', '/enrich', '/saved', '/settings', '/referrals', '/crm', '/crm/pipeline', '/crm/inbox', '/crm/sequences',
  '/jobs', '/va-dashboard', '/va-workspace', '/va-workspace/templates', '/admin-console', '/admin/import-counties',
  '/admin/assign-counties', '/admin/migration', '/audit-report', '/admin/monitoring', '/admin', '/admin/enrich-properties',
  '/how-snap-works', '/foia-login', '/foia/admin', '/foia/admin/assignments', '/foia/admin/import', '/foia/admin/intelligence',
  '/foia/admin/invite', '/foia/admin/press-accounts', '/foia/admin/rotation', '/foia/va', '/foia/va/history', '/foia/va/queue',
]);
const PRIVATE_DYNAMIC_ROUTES: readonly [RegExp, string][] = [
  [/^\/crm\/leads\/[^/]+$/, '/crm/leads/:id'],
  [/^\/lists\/[^/]+$/, '/lists/:id'],
  [/^\/jobs\/[^/]+$/, '/jobs/:id'],
  [/^\/upload-jobs\/[^/]+$/, '/upload-jobs/:id'],
  [/^\/va-workspace\/county\/[^/]+$/, '/va-workspace/county/:id'],
  [/^\/code-violations\/[^/]+$/, '/code-violations/:city'],
];

/** First-party audit paths contain a fixed route template, never record IDs. */
export function activityRouteTemplate(input: unknown): string | null {
  const path = routePath(input);
  if (!path) return null;
  if (Object.prototype.hasOwnProperty.call(PUBLIC_ROUTE_TITLES, path) || PRIVATE_STATIC_ROUTES.has(path)) return path;
  return PRIVATE_DYNAMIC_ROUTES.find(([pattern]) => pattern.test(path))?.[1] ?? null;
}

const ACTIVITY_ACTIONS = new Set([
  'page_view', 'login', 'signup', 'property_viewed', 'property_saved', 'property_unsaved', 'list_created', 'list_deleted',
  'export_csv', 'filter_used', 'upload_started', 'upload_completed', 'search',
]);

/** Retain only existing action names and route templates; raw metadata is never persisted. */
export function sanitizeActivity(action: unknown, inputPath: unknown) {
  const path = activityRouteTemplate(inputPath);
  if (typeof action !== 'string' || !ACTIVITY_ACTIONS.has(action) || !path) return null;
  return { action, metadata: {}, page_path: path };
}
