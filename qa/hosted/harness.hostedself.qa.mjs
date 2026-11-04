// Self-test: the harness is run against a local static server that EMULATES Cloudflare Pages (applies _headers, SPA fallback) with the Supabase and API origins MOCKED in the browser.
// Class: MOCKED. The report must say so, must refuse production, and must keep every write journey NOT RUN.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { runAcceptance } from './hosted-acceptance.mjs';

const DIST = path.resolve(process.env.PAGES_DIST || 'dist-hostedself');
const PORT = 4191; const ORIGIN = `http://127.0.0.1:${PORT}`;
const SETTINGS = { environment: 'staging', studio_hostname: 'staging-app.getbizgenie.com', pages_hostname_suffix: 'bizgenie-studio-staging.pages.dev', api_origin: 'http://api.test', supabase_ref: 'selftest', supabase_origin: 'http://supabase.test' };
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const rules = (() => { const out = []; let cur = null; for (const line of fs.readFileSync(path.join(DIST, '_headers'), 'utf8').split('\n')) { if (/^\S/.test(line)) { cur = { pattern: line.trim(), headers: {} }; out.push(cur); } else if (cur && line.trim()) { const i = line.indexOf(':'); cur.headers[line.slice(0, i).trim()] = line.slice(i + 1).trim(); } } return out; })();
const matches = (pattern, p) => (pattern.endsWith('/*') ? p.startsWith(pattern.slice(0, -1)) : pattern === p);
let server; let seen401Probe = false;
test.beforeAll(async () => {
  server = http.createServer((req, res) => {
    const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.join(DIST, p === '/' ? 'index.html' : p); let served = p === '/' ? '/index.html' : p;
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { file = path.join(DIST, 'index.html'); served = '/index.html'; }
    const headers = { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream' };
    for (const r of rules) if (matches(r.pattern, p) || matches(r.pattern, served)) Object.assign(headers, r.headers);
    res.writeHead(200, headers); fs.createReadStream(file).pipe(res);
  }).listen(PORT, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
});
test.afterAll(async () => { await new Promise((r) => server.close(r)); });

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
const appMeta = { tenant_id: 't1', project_id: 'p1', brand_id: 'b1' };
const jwt = `${b64({ alg: 'HS256' })}.${b64({ sub: 'u1', app_metadata: appMeta })}.sig12345678`;
const session = { access_token: jwt, refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, user: { id: 'u1', email: 'synthetic@example.test', app_metadata: appMeta, aud: 'authenticated' } };
const CORS = { 'access-control-allow-origin': ORIGIN, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,OPTIONS', vary: 'Origin' };
const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
const intercept = (opts = {}) => async (context) => {
  await context.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await context.route('http://supabase.test/**', (r) => { const u = new URL(r.request().url()); if (u.pathname.endsWith('/token')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) }); if (u.pathname.endsWith('/user')) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session.user) }); if (u.pathname.endsWith('/logout')) return r.fulfill({ status: 204, body: '' }); return r.fulfill({ status: 404, body: '{}' }); });
  await context.route('http://api.test/**', (r) => {
    const req = r.request(); const u = new URL(req.url());
    if (req.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: CORS, body: '' });
    if ((req.headers().authorization || '') === 'Bearer not-a-real-token') return json(r, { error: { code: 'AUTHENTICATION_REQUIRED', message: 'x' } }, opts.probeStatus || 401);
    if (opts.refuseReads) return json(r, { error: { code: 'AUTHENTICATION_REQUIRED', message: 'x' } }, 403);
    if (u.pathname === '/customer/workspace') return json(r, { status: 'ready', workspace: { tenant_id: 't1', tenant_name: 'T', project_id: 'p1', project_name: 'P', brand_id: 'b1', brand_name: 'B', brand_status: 'approved', membership_role: 'owner' } });
    if (u.pathname === '/customer/campaigns') return json(r, { campaigns: [] });
    return json(r, { error: { code: 'RESOURCE_NOT_AVAILABLE', message: 'x' } }, 404);
  });
};
const out = () => fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-self-'));
const IDENT = { HOSTED_TEST_EMAIL: 'synthetic@example.test', HOSTED_TEST_PASSWORD: 'correct horse 9', HOSTED_IDENTITY_APPROVED: 'yes' };
const byId = (rep) => Object.fromEntries(rep.results.map((r) => [r.id, r]));

test('a production host is refused before any browser is started', async () => {
  const rep = await runAcceptance({ target: 'https://getbizgenie.com', settings: SETTINGS, env: IDENT, outDir: out() });
  expect(rep.refused).toBe(true); expect(rep.results[0].status).toBe('FAIL');
});
test('without an approved identity the sign-in dependent checks are NOT RUN, writes are NOT RUN, and the class is MOCKED', async () => {
  const rep = await runAcceptance({ target: ORIGIN, settings: SETTINGS, env: {}, outDir: out(), selftest: true, intercept: intercept() });
  const r = byId(rep);
  expect(r.H01.status).toBe('PASS'); expect(r.H02.status).toBe('PASS'); expect(r.H03.status).toBe('PASS'); expect(r.H04.status).toBe('PASS');
  for (const id of ['H05', 'H06', 'H07', 'H08', 'W01', 'W02', 'W03', 'W04', 'W05', 'W06']) expect(r[id].status, id).toBe('NOT RUN');
  expect(rep.hostedReal).toBe(false); expect(rep.evidenceClass).toBe('MOCKED'); expect(rep.summary.verdict).toBe('INCOMPLETE');
});
test('with an approved synthetic identity: sign-in, scope, safe reads, approved origins and session recovery all pass; nothing is written', async () => {
  const dir = out(); const rep = await runAcceptance({ target: ORIGIN, settings: SETTINGS, env: IDENT, outDir: dir, selftest: true, intercept: intercept() });
  const r = byId(rep);
  for (const id of ['H01', 'H02', 'H03', 'H04', 'H05', 'H06', 'H07', 'H08']) expect(r[id].status, `${id}: ${r[id].detail}`).toBe('PASS');
  expect(rep.summary.fail).toBe(0); expect(rep.evidenceClass).toBe('MOCKED'); expect(rep.hostedReal).toBe(false);
  expect(fs.existsSync(path.join(dir, 'report.json'))).toBe(true); expect(fs.existsSync(path.join(dir, 'h05-signed-in.png'))).toBe(true);
  const text = fs.readFileSync(path.join(dir, 'report.json'), 'utf8'); expect(text).not.toContain(jwt); expect(text).not.toContain('correct horse');
});
test('a refused read after sign-in and an API that never answers the application are reported as FAIL', async () => {
  let rep = await runAcceptance({ target: ORIGIN, settings: SETTINGS, env: IDENT, outDir: out(), selftest: true, intercept: intercept({ refuseReads: true }) });
  expect(byId(rep).H06.status).toBe('FAIL'); expect(rep.summary.verdict).toBe('FAIL');
  rep = await runAcceptance({ target: ORIGIN, settings: SETTINGS, env: {}, outDir: out(), selftest: true, intercept: intercept({ probeStatus: 403 }) });
  expect(byId(rep).H04.status).toBe('FAIL');
});
