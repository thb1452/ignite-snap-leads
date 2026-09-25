import { activityRouteTemplate } from './analyticsPolicy.ts';

export interface ErrorDiagnosticInput {
  event?: unknown;
  errorName?: unknown;
  severity?: unknown;
}

const EVENTS = new Set(['unhandled_error', 'unhandled_rejection', 'render_error']);
const ERROR_CLASSES: Readonly<Record<string, string>> = {
  Error: 'error', TypeError: 'type_error', RangeError: 'range_error', ReferenceError: 'reference_error',
  SyntaxError: 'syntax_error', URIError: 'uri_error', EvalError: 'eval_error', AggregateError: 'aggregate_error',
  DOMException: 'dom_exception',
};

/** Error text, stacks, user-agent strings, caller URLs and arbitrary metadata are never read. */
export function sanitizeErrorDiagnostic(input: ErrorDiagnosticInput, currentPath: unknown) {
  const event = typeof input.event === 'string' && EVENTS.has(input.event) ? input.event : 'client_error';
  const errorClass = typeof input.errorName === 'string' && Object.prototype.hasOwnProperty.call(ERROR_CLASSES, input.errorName)
    ? ERROR_CLASSES[input.errorName]
    : 'unknown_error';
  const severity = input.severity === 'warning' || input.severity === 'fatal' ? input.severity : 'error';
  return {
    error_message: `${event}:${errorClass}`,
    error_stack: null,
    component_stack: null,
    url: activityRouteTemplate(currentPath),
    user_agent: null,
    severity,
    metadata: { event, error_class: errorClass },
  };
}
