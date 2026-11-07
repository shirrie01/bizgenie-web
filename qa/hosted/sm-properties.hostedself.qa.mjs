// Self-test of the SM Properties acceptance script. EVIDENCE CLASS: MOCKED. The Studio build is served by a static emulator of Cloudflare Pages; the API is a bridge-faithful stand-in
// (the route table, exact-origin CORS, write gate and tenant-scope rule of Codex's API PR #229, vendored); Supabase is a stand-in. This proves the script's logic. It is never hosted acceptance.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { runSmProperties } from './sm-properties-acceptance.mjs';
import { bridgeGate } from '../bridge-gate.mjs';

const DIST = path.resolve(process.env.PAGES_DIST || 'dist-hostedself');
const PORT = 4192; const ORIGIN = `http://127.0.0.1:${PORT}`;
const SETTINGS = { environment: 'staging', studio_hostname: 'staging-app.getbizgenie.com', pages_hostname_suffix: 'bizgenie-studio-staging.pages.dev', api_origin: 'http://api.test', approved_api_origins: ['http://api.test'], supabase_ref: 'selftest', supabase_origin: 'http://supabase.test' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
let server;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname); let file = path.join(DIST, p === '/' ? 'index.html' : p);
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' }); fs.createReadStream(file).pipe(res);
  }).listen(PORT, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
});
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const IDS = { tenant_id: '11111111-1111-4111-8111-111111111111', project_id: '22222222-2222-4222-8222-222222222222', brand_id: '33333333-3333-4333-8333-333333333333' };
const sessionFor = (scoped) => { const app_metadata = scoped ? IDS : {}; return { access_token: `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', app_metadata })}.sig12345678`, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: 'u1', email: 'synthetic@example.test', app_metadata, aud: 'authenticated' } }; };
const ONB = { contract_version: 'workspace-onboarding.v1', ...IDS, version: 0, status: 'not_started', sector: { key: null, source: null }, industry_text: null, channels: { values: [], source: null }, current_step: null, draft: {}, completeness: { sector: false, channels: false, ready_to_complete: false, missing: [] }, completed_at: null, updated_at: null };
const WS = { ...IDS, tenant_name: 'T', project_name: 'P', brand_name: 'SM Properties', brand_status: 'approved', membership_role: 'owner' };

function world({ exists = false, writes = true } = {}) {
  const w = { exists, scoped: exists, bootstraps: 0, refusals: [] };
  w.intercept = async (context) => {
    await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await context.route('http://supabase.test/**', (r) => { const u = new URL(r.request().url()); if (u.pathname.endsWith('/token') || u.pathname.endsWith('/user')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u.pathname.endsWith('/user') ? sessionFor(w.scoped).user : sessionFor(w.scoped)) }); if (u.pathname.endsWith('/logout')) return r.fulfill({ status: 204, body: '' }); return r.fulfill({ status: 404, body: '{}' }); });
    await context.route('http://api.test/**', async (r) => {
      const req = r.request(); const u = new URL(req.url()); const m = req.method(); const hdrs = await req.allHeaders();
      const v = bridgeGate({ method: m, url: req.url(), headers: hdrs, postData: req.postData() }, { origin: ORIGIN, scope: w.scoped ? IDS : null, writes });
      const json = (body, status = 200) => r.fulfill({ status, contentType: 'application/json', headers: v.cors || v.headers, body: JSON.stringify(body) });
      if (v.status) { if (m !== 'OPTIONS') w.refusals.push(`${m} ${u.pathname} ${v.body.error.code}`); return r.fulfill({ status: v.status, contentType: 'application/json', headers: v.headers, body: v.body ? JSON.stringify(v.body) : '' }); }
      if (u.pathname === '/customer/workspace' && m === 'GET') return json(w.exists ? { status: 'ready', workspace: WS } : { status: 'missing_workspace', workspace: null });
      if (u.pathname === '/customer/workspace/bootstrap' && m === 'POST') { w.bootstraps += 1; w.exists = true; w.scoped = true; return json({ status: 'ready', workspace: WS, requires_session_refresh: true }, 201); }
      if (u.pathname === '/customer/workspace/onboarding') return json({ status: 'ready', onboarding: ONB, brand_name_placeholder: true });
      if (u.pathname === '/customer/workspace/brand-brain') return json({ status: 'ready', brand_brain: { brand_id: IDS.brand_id, project_id: IDS.project_id, name: 'SM Properties', metadata: { version: 1, status: 'draft' } } });
      if (u.pathname === '/customer/campaigns') return json({ campaigns: [] });
      return json({ error: { code: 'RESOURCE_NOT_AVAILABLE', message: 'x' } }, 404);
    });
  };
  return w;
}
const out = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sm-self-'));
const IDENT = { HOSTED_TEST_EMAIL: 'synthetic@example.test', HOSTED_TEST_PASSWORD: 'correct horse 9', HOSTED_IDENTITY_APPROVED: 'yes' };
const by = (rep) => Object.fromEntries(rep.results.map((r) => [r.id, r]));

test('refuses production and refuses to start without an approved identity', async () => {
  expect((await runSmProperties({ target: 'https://getbizgenie.com', settings: SETTINGS, env: IDENT, outDir: out() })).refused).toBe(true);
  expect((await runSmProperties({ target: ORIGIN, settings: SETTINGS, env: {}, outDir: out(), selftest: true })).refused).toBe(true);
});
test('writes not approved: a new account is signed in and checked, but nothing is created and the write steps are NOT RUN', async () => {
  const w = world({ exists: false }); const rep = await runSmProperties({ target: ORIGIN, settings: SETTINGS, env: IDENT, outDir: out(), selftest: true, intercept: w.intercept });
  const r = by(rep);
  for (const id of ['A1', 'A2', 'A3', 'A9', 'A10']) expect(r[id].status, `${id}: ${r[id].detail}`).toBe('PASS');
  for (const id of ['A4', 'A5', 'A6']) expect(r[id].status, id).toBe('NOT RUN');
  expect(w.bootstraps).toBe(0); expect(rep.evidenceClass).toBe('MOCKED'); expect(rep.hostedReal).toBe(false); expect(rep.writeApproved).toBe(false);
});
test('writes approved: the workspace is created exactly once, Step 2 reaches Step 3, the entered name is kept, a reload creates nothing more, and another tenant is refused', async () => {
  const w = world({ exists: false, writes: true }); const rep = await runSmProperties({ target: ORIGIN, settings: SETTINGS, env: { ...IDENT, HOSTED_ALLOW_WORKSPACE_WRITE: 'create-sm-properties-once' }, outDir: out(), selftest: true, intercept: w.intercept });
  const r = by(rep);
  for (const id of ['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10', 'A11']) expect(r[id].status, `${id}: ${r[id].detail}`).toBe('PASS');
  expect(w.bootstraps).toBe(1); expect(rep.evidenceClass).toBe('MOCKED'); expect(rep.hostedReal).toBe(false);
});
test('an existing workspace is the resume path: nothing is created even when writes are approved', async () => {
  const w = world({ exists: true }); const rep = await runSmProperties({ target: ORIGIN, settings: SETTINGS, env: { ...IDENT, HOSTED_ALLOW_WORKSPACE_WRITE: 'create-sm-properties-once' }, outDir: out(), selftest: true, intercept: w.intercept });
  const r = by(rep); expect(r.A3.status).toBe('PASS'); expect(r.A4.status).toBe('NOT RUN'); expect(r.A4.detail).toMatch(/already exists/); expect(w.bootstraps).toBe(0);
  for (const id of ['A7', 'A8', 'A9', 'A10']) expect(r[id].status, `${id}: ${r[id].detail}`).toBe('PASS');
});
test('a read-only test environment is reported as a failure of the create step, not hidden', async () => {
  const w = world({ exists: false, writes: false }); const rep = await runSmProperties({ target: ORIGIN, settings: SETTINGS, env: { ...IDENT, HOSTED_ALLOW_WORKSPACE_WRITE: 'create-sm-properties-once' }, outDir: out(), selftest: true, intercept: w.intercept });
  const r = by(rep); expect(r.A4.status).toBe('FAIL'); expect(r.A5.status).toBe('FAIL'); expect(r.A6.status).toBe('NOT RUN'); expect(rep.summary.verdict).toBe('FAIL'); expect(w.refusals.some((x) => x.includes('STAGING_WRITES_DISABLED'))).toBe(true);
});
