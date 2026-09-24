import {open, lstat, realpath, rename} from 'node:fs/promises';
import {constants} from 'node:fs';
import {dirname, resolve, relative, isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jwt = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
export class HarnessError extends Error {
  constructor(code, {uncertain = false} = {}) { super(code); this.name = 'HarnessError'; this.code = code; this.uncertain = uncertain; }
}
export function requireCheck(condition, code) { if (!condition) throw new HarnessError(code); }
export function isUuid(value) { return typeof value === 'string' && uuid.test(value); }
const plain = value => value && typeof value === 'object' && !Array.isArray(value);
function apiKey(value, kind, ref) {
  if (typeof value !== 'string') return false;
  if (new RegExp(`^sb_${kind === 'admin' ? 'secret' : 'publishable'}_[A-Za-z0-9_-]{16,}$`).test(value)) return true;
  if (!jwt.test(value)) return false;
  try { const claims = JSON.parse(Buffer.from(value.split('.')[1], 'base64url')); return claims.ref === ref && claims.role === (kind === 'admin' ? 'service_role' : 'anon'); } catch { return false; }
}
export function validateConfig(value) {
  requireCheck(plain(value), 'CONFIG_OBJECT_REQUIRED');
  requireCheck(value.version === 1 && value.kind === 'snap_hosted_http_acceptance', 'CONFIG_KIND_INVALID');
  requireCheck(typeof value.project_ref === 'string' && /^[a-z]{20}$/.test(value.project_ref), 'PROJECT_REFERENCE_INVALID');
  requireCheck(value.api_url === `https://${value.project_ref}.supabase.co`, 'EXACT_PROJECT_ORIGIN_REQUIRED');
  requireCheck(apiKey(value.public_key, 'public', value.project_ref) && apiKey(value.admin_key, 'admin', value.project_ref) && value.public_key !== value.admin_key, 'API_KEYS_INVALID');
  requireCheck(isUuid(value.fixture_nonce) && isUuid(value.run_id), 'FIXTURE_IDENTITY_REQUIRED');
  requireCheck(typeof value.expected_commit === 'string' && /^[0-9a-f]{40}$/.test(value.expected_commit), 'REVIEWED_COMMIT_REQUIRED');
  if (value.function_commits !== undefined) {
    const names = ['create-checkout-session','send-sms-threaded','test-pipeline'];
    requireCheck(plain(value.function_commits) && JSON.stringify(Object.keys(value.function_commits).sort()) === JSON.stringify(names)
      && Object.values(value.function_commits).every(commit => typeof commit === 'string' && /^[0-9a-f]{40}$/.test(commit)), 'FUNCTION_COMMIT_MANIFEST_INVALID');
  }
  requireCheck(plain(value.operator_approval) && value.operator_approval.scope === 'isolated_synthetic_http' && value.operator_approval.max_cost_usd === 0 && value.operator_approval.confirmed_new_blank_project === true, 'ISOLATED_ZERO_COST_APPROVAL_REQUIRED');
  requireCheck(['configuration_closed', 'database_hold'].includes(value.checkout_expectation), 'CHECKOUT_EXPECTATION_REQUIRED');
  requireCheck(typeof value.receipt_file === 'string' && isAbsolute(value.receipt_file), 'PRIVATE_RECEIPT_PATH_REQUIRED');
  if (value.internal_worker_secret !== undefined) requireCheck(typeof value.internal_worker_secret === 'string' && /^[A-Za-z0-9_-]{32,}$/.test(value.internal_worker_secret) && value.internal_worker_secret !== value.public_key, 'INTERNAL_SECRET_INVALID');
  if (value.legacy_service_key !== undefined) requireCheck(jwt.test(value.legacy_service_key) && apiKey(value.legacy_service_key, 'admin', value.project_ref), 'LEGACY_SERVICE_KEY_INVALID');
  // No defaults, inferred production values, credentials in URLs or extra config.
  const fields = new Set(['version','kind','project_ref','api_url','public_key','admin_key','fixture_nonce','run_id','expected_commit','function_commits','operator_approval','checkout_expectation','receipt_file','internal_worker_secret','legacy_service_key']);
  requireCheck(Object.keys(value).every(key => fields.has(key)), 'UNKNOWN_CONFIG_FIELD');
  return Object.freeze({...value});
}
function outsideRepository(path, repo) { const rel = relative(repo, path); return rel.startsWith('..' + '/') || rel === '..' || isAbsolute(rel); }
async function privateParent(path, repo) {
  requireCheck(isAbsolute(path) && outsideRepository(path, repo), 'OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  const parent = await realpath(dirname(path));
  requireCheck(outsideRepository(parent, repo), 'OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  const stat = await lstat(parent);
  requireCheck(stat.isDirectory() && (stat.mode & 0o077) === 0, 'OUTPUT_DIRECTORY_MUST_BE_PRIVATE');
  return resolve(parent, path.split('/').at(-1));
}
export async function loadConfig(path, {repo = repository} = {}) {
  requireCheck(typeof path === 'string' && isAbsolute(path) && outsideRepository(path, repo), 'PRIVATE_CONFIG_FILE_REQUIRED');
  const stat = await lstat(path);
  requireCheck(stat.isFile() && !stat.isSymbolicLink() && (stat.mode & 0o077) === 0 && stat.size < 16384, 'CONFIG_FILE_MUST_BE_PRIVATE');
  const canonical = await realpath(path);
  requireCheck(outsideRepository(canonical, repo), 'CONFIG_MUST_BE_OUTSIDE_REPOSITORY');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  let parsed;
  try { const checked = await handle.stat(); requireCheck(checked.ino === stat.ino && checked.dev === stat.dev && (checked.mode & 0o077) === 0, 'CONFIG_CHANGED'); parsed = JSON.parse(await handle.readFile('utf8')); }
  catch (error) { if (error instanceof HarnessError) throw error; throw new HarnessError('CONFIG_PARSE_FAILED'); }
  finally { await handle.close(); }
  const config = validateConfig(parsed);
  requireCheck(await privateParent(config.receipt_file, repo) === config.receipt_file, 'CANONICAL_RECEIPT_PATH_REQUIRED');
  return config;
}
export async function reserveReceipt(config) {
  validateConfig(config);
  requireCheck(await privateParent(config.receipt_file, repository) === config.receipt_file, 'CANONICAL_RECEIPT_PATH_REQUIRED');
  // Persistent exclusive lock prevents silent reruns after timeout or interruption.
  const lock = await open(config.receipt_file + '.lock', 'wx', 0o600);
  await lock.writeFile('Synthetic HTTP acceptance run reserved; inspect receipt before any new run.\n');
  await lock.close();
  const file = await open(config.receipt_file, 'wx', 0o600); await file.close();
  return async receipt => {
    const temp = config.receipt_file + '.next';
    const output = await open(temp, 'wx', 0o600);
    try { await output.writeFile(JSON.stringify(receipt, null, 2) + '\n'); } finally { await output.close(); }
    await rename(temp, config.receipt_file);
  };
}
export function success(response) { requireCheck(response.ok, `HTTP_UNEXPECTED_${response.status}`); return response.data; }
export function denied(response) { requireCheck([401,403].includes(response.status), 'AUTHORIZATION_DENIAL_REQUIRED'); }
export function one(data) { const row = Array.isArray(data) ? data[0] : data; requireCheck(isUuid(row?.id), 'DATABASE_ROW_REQUIRED'); return row; }
export function userAuthDenialLayer(response) {
  if (response.status !== 401) return null;
  if (response.data?.error === 'Unauthorized' && response.data?.code === undefined) return 'handler';
  if (response.data?.error !== undefined) return null;
  if (response.data?.code === 401 && ['Missing authorization header','Invalid JWT'].includes(response.data?.message)) return 'gateway';
  const codes = ['UNAUTHORIZED_NO_AUTH_HEADER','UNAUTHORIZED_INVALID_JWT_FORMAT','UNAUTHORIZED_LEGACY_JWT','UNAUTHORIZED_ASYMMETRIC_JWT'];
  return codes.includes(response.data?.code) && response.gatewayErrorCode === response.data.code ? 'gateway' : null;
}

export function createRuntime(config, {fetchImpl = fetch, onOperation = async () => {}} = {}) {
  const c = validateConfig(config);
  let boundaryVerified = false;
  let operationSequence = 0;
  const users = new Set(), properties = new Set();
  const allowedTables = new Set(['snap_hosted_fixture','profiles','user_roles','pipeline_stages','properties','unlocked_properties','leads','crm_contacts','lead_activities']);
  const allowedRpcs = new Set(['has_role','fn_customer_workspace_ready_v1','fn_crm_add_property_v1','fn_crm_record_outcome_v1','fn_provision_customer_workspace_v1','fn_apply_billing_event_v1','fn_billing_checkout_enabled_v1']);
  async function request(path, {token, admin = false, legacyService = false, method = 'GET', body, headers = {}} = {}) {
    requireCheck(typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !/[\\#\s]/.test(path) && !/%(?:2e|2f|5c)/i.test(path) && !path.includes('..'), 'RELATIVE_API_PATH_REQUIRED');
    const target = new URL(path, c.api_url);
    requireCheck(target.origin === c.api_url && !target.username && !target.password, 'CROSS_ORIGIN_FORBIDDEN');
    const parts = target.pathname.split('/');
    const auth = ['/auth/v1/admin/users','/auth/v1/user','/auth/v1/token','/auth/v1/logout'].includes(target.pathname) || /^\/auth\/v1\/admin\/users\/[0-9a-f-]+$/.test(target.pathname);
    const rest = parts[1] === 'rest' && parts[2] === 'v1' && ((parts.length === 4 && allowedTables.has(parts[3])) || (parts.length === 5 && parts[3] === 'rpc' && allowedRpcs.has(parts[4])));
    const func = ['/functions/v1/test-pipeline','/functions/v1/create-checkout-session','/functions/v1/send-sms-threaded'].includes(target.pathname);
    requireCheck(auth || rest || func, 'ENDPOINT_NOT_IN_ACCEPTANCE_SCOPE');
    requireCheck(['GET','POST','PATCH','PUT'].includes(method), 'METHOD_NOT_IN_ACCEPTANCE_SCOPE');
    requireCheck(boundaryVerified || (method === 'GET' && admin && target.pathname === '/rest/v1/snap_hosted_fixture'), 'STAGING_MARKER_REQUIRED_BEFORE_REQUESTS');
    requireCheck(!(admin && token) && !(legacyService && token), 'MIXED_AUTH_MODES_FORBIDDEN');
    requireCheck(!token || jwt.test(token), 'USER_TOKEN_MUST_BE_JWT');
    requireCheck(!legacyService || c.legacy_service_key, 'LEGACY_SERVICE_KEY_REQUIRED');
    requireCheck(!legacyService || (!admin && method === 'POST' && target.pathname === '/functions/v1/test-pipeline'), 'LEGACY_SERVICE_RETIRED_ENDPOINT_ONLY');
    requireCheck(!token || (token !== c.admin_key && token !== c.legacy_service_key), 'ADMIN_KEY_CANNOT_BE_USER_TOKEN');
    const extra = Object.keys(headers);
    requireCheck(extra.every(key => ['Prefer','x-internal-secret'].includes(key)), 'HEADER_OVERRIDE_FORBIDDEN');
    if (headers['x-internal-secret']) requireCheck(target.pathname === '/functions/v1/test-pipeline' && headers['x-internal-secret'] === c.internal_worker_secret, 'INTERNAL_SECRET_SCOPE_INVALID');
    if (target.pathname === '/auth/v1/admin/users') {
      requireCheck(admin && method === 'POST' && body?.email_confirm === true && typeof body?.email === 'string' && new RegExp(`^synthetic-(alpha|bravo)-${c.run_id}@example\\.invalid$`).test(body.email) && body?.user_metadata?.hosted_http_run === c.run_id, 'SYNTHETIC_ADMIN_CREATE_ONLY');
    }
    if (target.pathname.startsWith('/auth/v1/admin/users/')) requireCheck(admin && users.has(parts.at(-1)) && (method === 'GET' || (method === 'PUT' && JSON.stringify(body) === '{"ban_duration":"1h"}')), 'SYNTHETIC_ADMIN_USER_ONLY');
    if (admin && method !== 'GET' && rest) {
      requireCheck(method === 'POST' && ['/rest/v1/properties','/rest/v1/unlocked_properties'].includes(target.pathname), 'ADMIN_REST_WRITE_OUT_OF_SCOPE');
      for (const item of Array.isArray(body) ? body : [body]) {
        if (target.pathname === '/rest/v1/properties') requireCheck(isUuid(item?.id) && item?.address?.startsWith(`Synthetic hosted ${c.run_id} `), 'SYNTHETIC_PROPERTY_REQUIRED');
        else requireCheck(users.has(item?.user_id) && properties.has(item?.property_id), 'SYNTHETIC_UNLOCK_REQUIRED');
      }
    }
    if (admin && target.pathname === '/rest/v1/rpc/fn_billing_checkout_enabled_v1') requireCheck(method === 'GET', 'BILLING_CHECK_IS_READ_ONLY');
    const key = legacyService ? c.legacy_service_key : admin ? c.admin_key : c.public_key;
    const authHeaders = jwt.test(key) ? {Authorization: `Bearer ${key}`} : {};
    if (token) authHeaders.Authorization = `Bearer ${token}`;
    if (token === '') delete authHeaders.Authorization;
    // Persist bounded reconciliation metadata before contacting the target. Never
    // include URL origin, queries, credentials, notes, timestamps from commands,
    // or a request/response body in this journal.
    const operation = {
      sequence: ++operationSequence, method,
      route: target.pathname.replace(/\/auth\/v1\/admin\/users\/[0-9a-f-]+$/, '/auth/v1/admin/users/:synthetic-user'),
      ...(isUuid(body?.p_request_id) ? {request_id:body.p_request_id} : {}),
      ...(isUuid(body?.p_lead_id) ? {synthetic_lead_id:body.p_lead_id} : {}),
      ...(isUuid(body?.p_property_id) ? {synthetic_property_id:body.p_property_id} : {}),
      ...(target.pathname.startsWith('/auth/v1/admin/users/') && users.has(parts.at(-1)) ? {synthetic_user_id:parts.at(-1)} : {}),
    };
    const checkpoint = async details => {
      try { await onOperation({...operation,...details}); }
      catch { throw new HarnessError('OPERATION_JOURNAL_WRITE_FAILED', {uncertain:details.phase !== 'INTENT'}); }
    };
    await checkpoint({phase:'INTENT',recorded_at:new Date().toISOString()});
    let response;
    try {
      response = await fetchImpl(target.href, {method, headers: {apikey: key, ...authHeaders, 'Content-Type': 'application/json', ...headers}, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(20000)});
      const raw = await response.text();
      let data;
      try { data = raw ? JSON.parse(raw) : null; }
      catch {
        if (response.ok && method !== 'GET') throw new HarnessError('WRITE_RESPONSE_UNCERTAIN', {uncertain:true});
        data = null;
      }
      // Only successful acknowledged synthetic writes join the mutation allowlist.
      if (response.ok && target.pathname === '/auth/v1/admin/users' && method === 'POST') {
        const user = data?.user ?? data;
        if (!isUuid(user?.id)) throw new HarnessError('CREATED_USER_RESPONSE_UNCERTAIN', {uncertain:true});
        users.add(user.id);
      }
      if (response.ok && admin && target.pathname === '/rest/v1/properties' && method === 'POST') for (const item of Array.isArray(body) ? body : [body]) properties.add(item.id);
      if (response.ok && method === 'POST' && ['/rest/v1/rpc/fn_crm_add_property_v1','/rest/v1/rpc/fn_crm_record_outcome_v1'].includes(target.pathname)) {
        const row = Array.isArray(data) ? data[0] : data;
        if (!isUuid(row?.id)) throw new HarnessError('CRM_WRITE_RESPONSE_UNCERTAIN', {uncertain:true});
      }
      const returned = Array.isArray(data) ? data[0] : data?.user ?? data;
      await checkpoint({phase:'ACKNOWLEDGED',recorded_at:new Date().toISOString(),http_status:response.status,
        ...(response.ok && method !== 'GET' && isUuid(returned?.id) ? {synthetic_result_id:returned.id} : {}),
      });
      return {status: response.status, ok: response.ok, data, gatewayErrorCode: response.headers.get('sb-error-code')};
    } catch (error) {
      // Never echo fetch errors, URL, headers, bodies or tokens; never retry a write.
      const failure = error instanceof HarnessError ? error : new HarnessError(method === 'GET' ? 'HTTP_READ_FAILED' : 'HTTP_WRITE_OUTCOME_UNCERTAIN', {uncertain: method !== 'GET'});
      if (failure.code !== 'OPERATION_JOURNAL_WRITE_FAILED') await checkpoint({phase:failure.uncertain?'UNCERTAIN':'FAILED',recorded_at:new Date().toISOString(),code:failure.code});
      throw failure;
    }
  }
  return {
    request,
    async verifyBoundary() {
      const result = success(await request('/rest/v1/snap_hosted_fixture?select=kind,schema_version,fixture_nonce,state', {admin: true}));
      requireCheck(Array.isArray(result) && result.length === 1 && result[0].kind === 'snap_hosted_synthetic' && result[0].schema_version === 1 && result[0].fixture_nonce === c.fixture_nonce && result[0].state === 'ready', 'STAGING_MARKER_MISMATCH');
      boundaryVerified = true;
    },
  };
}
