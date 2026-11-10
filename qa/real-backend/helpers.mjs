// Real-browser acceptance of the integrated premium journey against the REAL local backend harness (bizgenie-api #220 routers on disposable PostgreSQL, real HTTP, real CORS).
// ONLY the workspace/bootstrap endpoints and the sign-in provider are stubbed (the harness does not compose the customer-workspace service); every other request - media, creative
// jobs, quotes, campaigns, social, calendar, insights - reaches the real backend. The platform sign-in pages are stubbed as redirects (no real OAuth). Nothing here is staging.
import { expect } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let AXE = null; try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally */ }
export const IDS = JSON.parse(fs.readFileSync(process.env.RB_IDS || '/tmp/claude-0/rb-ids.json', 'utf8'));
export const EVIDENCE = process.env.EVIDENCE_DIR || ''; const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
export const API = IDS.base; export const APP = 'http://127.0.0.1:4182';
export const sess = (token) => JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 'tenant_a', project_id: 'project_a', brand_id: 'brand_a' } } });
export const ws = (role) => ({ tenant_id: 'tenant_a', tenant_name: 'Northgate Group', project_id: 'project_a', project_name: 'Northgate campaigns', brand_id: 'brand_a', brand_name: 'Northgate Vehicle Leasing', brand_status: 'approved', membership_role: role });
export const onboarding = { contract_version: 'workspace-onboarding.v1', tenant_id: 'tenant_a', project_id: 'project_a', brand_id: 'brand_a', version: 3, status: 'completed', sector: { key: 'leasing', source: 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z' };
export const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=', 'base64');

export async function open(page, { token = 'ok', role = 'owner' } = {}) {
  const seen = { real: [], bad: [], errors: [], oauth: [] };
  page.on('pageerror', (e) => seen.errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [sess(token)]);
  await page.route(/fonts\./, (r) => r.abort());
  await page.route('http://supabase.test/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: sess(token) }));
  // sign-in provider stubs: the authorize page redirects to the registered redirect URI, which redirects back into the app with the state it was given (a real callback shape)
  // The sign-in page stub plays platform + registered redirect in one hop (the browser would be sent to the registered redirect URI, which sends the visitor back to the app with code and state).
  await page.route('https://www.facebook.com/**', (route) => { const u = new URL(route.request().url()); seen.oauth.push(u.href); if (u.searchParams.get('redirect_uri') !== 'https://app.example.test/connections') return route.fulfill({ status: 400, body: 'unregistered redirect' }); return route.fulfill({ status: 302, headers: { location: `${APP}/?code=synthetic_authorization_code&state=${encodeURIComponent(u.searchParams.get('state'))}` }, body: '' }); });
  const cors = { 'access-control-allow-origin': APP, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', vary: 'Origin' };
  await page.route(`${API}/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fallback();
    if (p === '/customer/workspace') return json({ status: 'ready', workspace: ws(role) });
    if (p === '/customer/workspace/brand-brain') return json({ status: 'ready', brand_brain: { brand_id: 'brand_a', project_id: 'project_a', name: 'Northgate Vehicle Leasing', identity: { description: 'We lease cars and vans to small businesses.' }, metadata: { version: 1, status: 'approved' } } });
    if (p === '/customer/workspace/onboarding') return json({ status: 'ready', onboarding, brand_name_placeholder: false });
    if (p.startsWith('/customer/billing/') || p.startsWith('/billing/')) return json({ status: 'unavailable', error: { code: 'BILLING_NOT_COMPOSED_IN_HARNESS' } }, 503); // billing is out of scope of this harness
    seen.real.push(`${req.method()} ${p}`); return route.fallback();
  });
  page.on('response', async (r) => { if (r.url().startsWith(API) && r.status() >= 400 && r.request().method() !== 'OPTIONS') seen.bad.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${await r.text().catch(() => '')} REQ ${r.request().postData() || ''}`); });
  return seen;
}
export const nav = (page) => page.getByRole('navigation', { name: /workspace sections/i });
export const welcome = (page) => page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' }).waitFor();
export async function checks(page, label) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${label}: horizontal overflow`).toBe(false);
  if (AXE) { await page.addScriptTag({ content: AXE }); const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`)); expect(v, `${label}: axe`).toEqual([]); }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-rb-${label}.png`, fullPage: true }); }
}

