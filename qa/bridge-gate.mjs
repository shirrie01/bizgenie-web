// A faithful stand-in for the trusted staging bridge's gatekeeping (Codex API PR #229, src/studio-bridge/service.js), built from the vendored extract
// qa/contracts/BG_STUDIO_BRIDGE.extract.json. EVIDENCE CLASS: MOCKED. It lets the Studio's requests be judged by the bridge's own rules in a real browser:
// exact-origin CORS, the three allowed request headers, the route allowlist, the write gates and the tenant-scope rule. It is not the bridge.
import fs from 'node:fs';
const X = JSON.parse(fs.readFileSync(new URL('./contracts/BG_STUDIO_BRIDGE.extract.json', import.meta.url), 'utf8'));
const ROUTES = X.routes.map((r) => ({ methods: new Set(r.methods), path: new RegExp('^' + r.path.replaceAll('{U}', X.uuid_pattern) + '$') }));
const IDENTITY = new RegExp(X.identity_routes);
const PRIVATE_HEADERS = ['x-serverless-authorization', 'x-admin-key', 'x-api-key', 'proxy-authorization'];

export const bridgeAllows = (method, path) => ROUTES.some((r) => r.methods.has(method) && r.path.test(path));

// -> null (let the request through to the mocked API) or { status, headers, body }
export function bridgeGate({ method, url, headers, postData }, { origin, scope, writes = false, confirmations = false, socialWrites = false, stripeCheckout = false }) {
  const u = new URL(url); const path = u.pathname; const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const cors = { 'access-control-allow-origin': origin, 'access-control-expose-headers': 'Content-Length,Content-Range,Accept-Ranges', 'cache-control': 'private, no-store', vary: 'Authorization, Origin' };
  const fail = (status, code) => ({ status, headers: cors, body: { error: { code, message: 'Studio API request is unavailable' } } });
  if (h.origin && h.origin !== origin) return fail(403, 'ORIGIN_FORBIDDEN');
  if (PRIVATE_HEADERS.some((k) => h[k] !== undefined)) return fail(400, 'SERVER_HEADERS_FORBIDDEN');
  const m = method === 'OPTIONS' ? h['access-control-request-method'] : method;
  if ((!/^\/customer\//.test(path) && path !== '/billing/stripe/checkout') || !bridgeAllows(m, path)) return fail(404, 'RESOURCE_NOT_AVAILABLE');
  if (method === 'OPTIONS') {
    const asked = (h['access-control-request-headers'] || '').toLowerCase().split(',').map((x) => x.trim()).filter(Boolean);
    if (asked.some((x) => !X.cors.allowed_request_headers.includes(x))) return fail(403, 'HEADERS_FORBIDDEN');
    return { status: 204, headers: { ...cors, 'access-control-allow-headers': X.cors.allowed_request_headers.join(','), 'access-control-allow-methods': m }, body: null };
  }
  if (!['GET', 'HEAD'].includes(method) && !writes) return fail(403, 'STAGING_WRITES_DISABLED');
  if (path === '/billing/stripe/checkout' && !stripeCheckout) return fail(403, 'STRIPE_CHECKOUT_DISABLED');
  if (/\/generation-quotes\/[^/]+\/confirm$/.test(path) && !confirmations) return fail(403, 'GENERATION_CONFIRMATION_DISABLED');
  if (/\/social\//.test(path) && !['GET', 'HEAD'].includes(method) && !socialWrites) return fail(403, 'SOCIAL_WRITES_DISABLED');
  const bearer = /^Bearer ([^\s]+)$/.exec(h.authorization || '');
  if (!bearer) return fail(401, 'AUTHENTICATION_REQUIRED');
  if (path === '/billing/stripe/checkout') { // after the bearer check: the bridge validates the strict body before it asks for IAM
    let b = null; try { b = postData ? JSON.parse(postData) : null; } catch { /* invalid */ }
    const idOk = (v) => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(v);
    if (!b || typeof b !== 'object' || Array.isArray(b) || Object.keys(b).sort().join() !== 'plan_code,request_id,tenant_id' || !['standard', 'pro'].includes(b.plan_code) || !idOk(b.request_id) || !idOk(b.tenant_id)) return fail(400, 'STRIPE_BILLING_VALIDATION_ERROR');
  }
  if (!IDENTITY.test(path)) {
    let body = null; try { body = postData ? JSON.parse(postData) : null; } catch { /* not JSON */ }
    for (const key of ['tenant_id', 'project_id', 'brand_id']) {
      const values = [u.searchParams.get(key) ?? undefined, body && typeof body === 'object' ? body[key] : undefined].filter((v) => v !== undefined);
      if (values.some((v) => typeof v !== 'string' || !scope || v !== scope[key])) return fail(404, 'RESOURCE_NOT_AVAILABLE');
    }
  }
  return { pass: true, cors };
}
