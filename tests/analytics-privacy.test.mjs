import test from 'node:test';
import assert from 'node:assert/strict';
import { publicPageContext, sanitizePublicEvent, activityRouteTemplate, sanitizeActivity } from '../src/lib/analyticsPolicy.ts';

const sensitive = 'user@example.com';

test('public page contexts replace URL, title and referrer with constants, stripping query and hash', () => {
  const context = publicPageContext(`/pricing?email=${sensitive}&session_id=cs_secret#access_token=secret`);
  assert.deepEqual(context, { page_path: '/pricing', page_location: 'https://snapignite.com/pricing', page_title: 'Plan pricing', page_referrer: '' });
  assert.equal(publicPageContext('/pricing/').page_path, '/pricing');
  assert.equal(JSON.stringify(context).includes(sensitive), false);
});

test('private, unknown, protocol-relative, external and encoded paths never become public events', () => {
  for (const path of ['/auth?code=secret', '/crm/leads/customer-123', '/properties', '/settings', '/checkout/success?session_id=secret', '/code-violations/springfield', '/anything/user@example.com', '//evil.example/pricing', 'https://snapignite.com/pricing', '/%70ricing', '/pricing/../auth', '/pricing\\auth', '/pricing\u0000', null]) {
    assert.equal(publicPageContext(path), null, String(path));
    assert.equal(sanitizePublicEvent('hero_cta_click', path, { location: 'hero' }), null, String(path));
  }
});

test('custom events admit only declared enums and cannot override safe context with sensitive fields', () => {
  const event = sanitizePublicEvent('hero_cta_click', '/', {
    location: 'hero', email: sensitive, query: '123 Private Lane', reason: 'provider error with token', property_id: 'secret-id',
    page_location: `https://snapignite.com/auth?email=${sensitive}`, page_referrer: 'https://mail.example/private', page_title: sensitive,
  });
  assert.deepEqual(event, { name: 'hero_cta_click', params: {
    page_path: '/', page_location: 'https://snapignite.com/', page_title: 'Snap Ignite', page_referrer: '', location: 'hero',
  } });
  assert.equal(sanitizePublicEvent('pricing_plan_selected', '/pricing', { plan: sensitive }).params.plan, undefined);
  assert.equal(sanitizePublicEvent('pricing_plan_selected', '/pricing', { plan: 'professional' }).params.plan, 'professional');
  assert.equal(sanitizePublicEvent('page_view', '/pricing', { page_title: sensitive }).params.page_title, 'Plan pricing');
});

test('payment success, arbitrary events and product identifiers cannot enter public acquisition analytics', () => {
  for (const event of ['payment_success', 'purchase', 'signup_failed', 'property_search', 'property_viewed', 'filter_used', 'snap_score_clicked', 'anything', '__proto__', 'constructor']) {
    assert.equal(sanitizePublicEvent(event, '/pricing', { property_id: 'secret', transaction_id: 'invoice', value: 99 }), null, event);
  }
  assert.equal(sanitizePublicEvent('checkout_started', '/auth?plan=starter', { plan: 'starter' }), null);
});

test('first-party audit records contain templates and no raw metadata or customer identifier', () => {
  const path = '/crm/leads/customer-private-uuid?phone=5551112222#token=secret';
  assert.equal(activityRouteTemplate(path), '/crm/leads/:id');
  assert.deepEqual(sanitizeActivity('page_view', path), { action: 'page_view', page_path: '/crm/leads/:id', metadata: {} });
  assert.equal(activityRouteTemplate('/lists/private-list-id'), '/lists/:id');
  assert.equal(activityRouteTemplate('/jobs/private-job-id'), '/jobs/:id');
  assert.equal(activityRouteTemplate('/va-workspace/county/private-id'), '/va-workspace/county/:id');
  assert.equal(activityRouteTemplate('/unknown/private-id'), null);
  assert.equal(sanitizeActivity('raw-error-in-action', path), null);
  assert.equal(sanitizeActivity('page_view', 'https://evil.example/auth'), null);
  assert.equal(activityRouteTemplate(activityRouteTemplate(path)), '/crm/leads/:id');
});

test('default-off runtime neither loads a provider script nor calls an existing tracker', async () => {
  const savedWindow = globalThis.window;
  const savedDocument = globalThis.document;
  let eventCount = 0;
  let scriptCount = 0;
  globalThis.window = { location: { pathname: '/' }, gtag: () => { eventCount += 1; } };
  globalThis.document = { createElement: () => { scriptCount += 1; throw new Error('Provider must not load'); } };
  try {
    const { trackPageView, trackEvent } = await import('../src/lib/analytics.ts');
    trackPageView('/pricing?email=private@example.com');
    trackEvent('hero_cta_click', { location: 'hero' });
    assert.equal(scriptCount, 0);
    assert.equal(eventCount, 0);
    assert.equal(globalThis.window['ga-disable-G-W5JGFESNT0'], true);
  } finally {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  }
});

test('first-party error diagnostics never retain messages, stacks, metadata, raw URLs or user agents', async () => {
  const { sanitizeErrorDiagnostic } = await import('../src/lib/errorTelemetryPolicy.ts');
  const payload = {
    event: 'render_error', errorName: 'TypeError', severity: 'fatal',
    error_message: 'Cannot fetch user@example.com', error_stack: 'token=secret at /crm/leads/private-id',
    component_stack: 'Account name: Private Customer', url: 'https://snapignite.com/auth?code=secret#access_token=secret',
    user_agent: 'custom identifier', metadata: { phone: '5551112222', address: '123 Private Lane' },
  };
  assert.deepEqual(sanitizeErrorDiagnostic(payload, '/crm/leads/private-id?email=user@example.com'), {
    error_message: 'render_error:type_error', error_stack: null, component_stack: null,
    url: '/crm/leads/:id', user_agent: null, severity: 'fatal',
    metadata: { event: 'render_error', error_class: 'type_error' },
  });
  for (const injected of ['user@example.com', '__proto__', 'constructor', '', 'TypeError: secret']) {
    const safe = sanitizeErrorDiagnostic({ event: injected, errorName: injected, severity: injected }, '/unknown/private-id');
    assert.equal(safe.error_message, 'client_error:unknown_error');
    assert.equal(safe.url, null);
    assert.equal(safe.severity, 'error');
  }
});

test('discarded error fields are not inspected or coerced while standard classes remain useful', async () => {
  const { sanitizeErrorDiagnostic } = await import('../src/lib/errorTelemetryPolicy.ts');
  const payload = { event: 'unhandled_rejection', errorName: 'RangeError', severity: 'warning' };
  for (const field of ['error_message', 'error_stack', 'component_stack', 'url', 'user_agent', 'metadata']) {
    Object.defineProperty(payload, field, { get: () => { throw new Error('Raw field must not be read'); } });
  }
  const safe = sanitizeErrorDiagnostic(payload, '/properties?search=Private%20Lane');
  assert.equal(safe.error_message, 'unhandled_rejection:range_error');
  assert.equal(safe.url, '/properties');
  assert.equal(safe.severity, 'warning');
  assert.equal(sanitizeErrorDiagnostic({ errorName: { toString: () => { throw new Error('No coercion'); } } }, '/').error_message, 'client_error:unknown_error');
});
