// Real-browser QA of Premium Studio workspace selection (BG-STUDIO-011-FE), flag-ON production build.
// The API and the Supabase session/refresh endpoints are fully MOCKED in the browser (no network, no credentials):
// this is NOT a deployed or staging journey. Build with VITE_PREMIUM_STUDIO_ENABLED=true and placeholder VITE_* values.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally; CI installs it */ }
const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);

const WS = {
  a: { tenant_id: 't1', tenant_name: 'Northgate Group', project_id: 'pa', project_name: 'Northgate campaigns', brand_id: 'ba', brand_name: 'Northgate Vehicle Leasing', brand_status: 'approved', membership_role: 'owner' },
  b: { tenant_id: 't1', tenant_name: 'Northgate Group', project_id: 'pb', project_name: 'Brookside campaigns', brand_id: 'bb', brand_name: 'Brookside Aesthetics', brand_status: 'approved', membership_role: 'owner' },
  c: { tenant_id: 't1', tenant_name: 'Northgate Group', project_id: 'pc', project_name: 'Harbour campaigns', brand_id: 'bc', brand_name: 'Harbour Partners', brand_status: 'draft', membership_role: 'owner' },
};
const doc = (w, over = {}) => ({ contract_version: 'workspace-onboarding.v1', tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id, version: 3, status: 'completed', sector: { key: 'leasing', source: 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z', updated_at: '2026-10-24T10:00:00.000Z', ...over });
const sessionJson = (w) => JSON.stringify({ access_token: w ? `tok-${w.brand_id}` : 'tok-identity', refresh_token: 'refresh-x', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: w ? { tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id } : {} } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

async function setup(page, { start = null, list = [WS.a, WS.b], aBrainDelay = 0, selectStatus = 200 } = {}) {
  const log = { calls: [], errors: [], selected: start, selects: [], refreshes: 0, puts: [], list, data: {
    ba: { brain: { brand_id: 'ba', project_id: 'pa', name: 'Northgate Vehicle Leasing', identity: { description: 'We lease cars and vans to small businesses.' }, metadata: { version: 1, status: 'approved' } }, onboarding: doc(WS.a), campaigns: [{ campaign_id: '11111111-1111-4111-8111-111111111111', name: 'Northgate spring leasing', status: 'active', archived_at: null, updated_at: '2026-10-20T10:00:00.000Z' }] },
    bb: { brain: { brand_id: 'bb', project_id: 'pb', name: 'Brookside Aesthetics', identity: { description: 'An aesthetics clinic in Leeds.' }, metadata: { version: 1, status: 'approved' } }, onboarding: doc(WS.b, { sector: { key: 'aesthetics', source: 'customer' }, channels: { values: ['instagram'], source: 'customer' } }), campaigns: [] },
  } };
  page.on('pageerror', (e) => log.errors.push(e.message));
  await page.addInitScript(([t]) => { if (!localStorage.getItem('sb-supabase-auth-token')) localStorage.setItem('sb-supabase-auth-token', t); }, [sessionJson(start)]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  // Supabase refresh: returns a session whose app_metadata carries the workspace the API last confirmed.
  await page.route('http://supabase.test/**', async (route) => {
    if (route.request().method() === 'OPTIONS') return json(route, {});
    if (route.request().url().includes('/auth/v1/token')) { log.refreshes += 1; return json(route, JSON.parse(sessionJson(log.selected))); }
    return json(route, {}, 404);
  });
  await page.route('http://api.test/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const token = (req.headers().authorization || '').replace('Bearer ', '');
    const brand = token.startsWith('tok-') ? token.slice(4) : null;
    const d = brand && log.data[brand];
    log.calls.push(`${m} ${u.pathname} ${token}`);
    if (m === 'OPTIONS') return json(route, {});
    if (u.pathname === '/customer/workspace' && m === 'GET') return json(route, log.list.length > 1 ? { status: 'selection_required', workspace: null, workspaces: log.list } : log.list.length === 1 ? { status: 'ready', workspace: log.list[0] } : { status: 'missing_workspace', workspace: null });
    if (u.pathname === '/customer/workspace/select') {
      const b = JSON.parse(req.postData()); log.selects.push(b);
      const w = log.list.find((x) => x.tenant_id === b.tenant_id && x.project_id === b.project_id && x.brand_id === b.brand_id && x.brand_status === 'approved');
      if (selectStatus !== 200 || !w) return json(route, { status: 'failed', error: { code: 'WORKSPACE_VALIDATION_ERROR' } }, 400);
      log.selected = w; return json(route, { status: 'ready', workspace: w, requires_session_refresh: true });
    }
    if (!d) return json(route, { status: 'failed', error: { code: 'WORKSPACE_NOT_AUTHORIZED' } }, 403);
    if (u.pathname.endsWith('/workspace/brand-brain') && m === 'GET') { if (brand === 'ba' && aBrainDelay) await new Promise((r) => setTimeout(r, aBrainDelay)); return json(route, { status: 'ready', brand_brain: d.brain }); }
    if (u.pathname.endsWith('/workspace/onboarding') && m === 'GET') return json(route, { status: 'ready', onboarding: d.onboarding, brand_name_placeholder: false });
    if (u.pathname.endsWith('/workspace/onboarding') && m === 'PUT') {
      const b = JSON.parse(req.postData()); log.puts.push({ brand, ...b });
      if (b.expected_version !== d.onboarding.version) return json(route, { error: { code: 'VERSION_CONFLICT', details: { current_version: d.onboarding.version } } }, 409);
      const n = { ...d.onboarding, draft: { ...d.onboarding.draft }, version: d.onboarding.version + 1 };
      for (const [k, v] of Object.entries(b.draft || {})) { if (v === null) delete n.draft[k]; else n.draft[k] = v; }
      if (b.current_step !== undefined) n.current_step = b.current_step;
      d.onboarding = n; return json(route, { status: 'saved', replayed: false, onboarding: n, brand_name_placeholder: false });
    }
    if (u.pathname === '/customer/campaigns' && m === 'GET') return json(route, { campaigns: d.campaigns });
    return json(route, {}, 404);
  });
  return log;
}

async function scan(page, label) {
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('button, a[href], input, select, textarea, summary')].filter((e) => e.offsetParent !== null).map((e) => ({ t: (e.textContent || e.id || e.tagName).trim().slice(0, 24), r: e.getBoundingClientRect() })).filter((x) => x.r.width < 24 || x.r.height < 24).map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
    const offenders = [...document.querySelectorAll('.ps-shell *, .ps-shell')].filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => e.tagName + '.' + e.className).slice(0, 5);
    return { overflow: document.documentElement.scrollWidth > vw + 1, offenders, small };
  });
  expect(m, `${label}: layout`).toEqual({ overflow: false, offenders: [], small: [] });
  if (AXE) {
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    expect(v, `${label}: axe`).toEqual([]);
  }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-${label}.png`, fullPage: true }); }
}
const nav = (page) => page.getByRole('navigation', { name: /workspace sections/i });

test('two authorised workspaces: the customer must choose, nothing is picked for them, and only the chosen one loads', async ({ page }) => {
  const log = await setup(page); // signed in, no workspace selected yet
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /choose a workspace/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Northgate Vehicle Leasing', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Brookside Aesthetics', level: 3 })).toBeVisible();
  await expect(page.getByRole('heading', { name: /welcome back/i })).toHaveCount(0);
  expect(log.selects).toEqual([]);
  expect(log.calls.some((c) => /brand-brain|workspace\/onboarding|customer\/campaigns/.test(c))).toBe(false);
  await scan(page, 'chooser-required');
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  expect(log.selects).toEqual([{ tenant_id: 't1', project_id: 'pb', brand_id: 'bb' }]);
  expect(log.refreshes).toBeGreaterThanOrEqual(1); // the session was refreshed after selection
  await expect(page.locator('main')).not.toContainText('Northgate');
  expect(log.calls.filter((c) => /brand-brain|workspace\/onboarding/.test(c)).every((c) => c.endsWith('tok-bb'))).toBe(true);
  await scan(page, 'workspace-after-select');
  // The chosen workspace survives a reload because the refreshed session carries it.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  expect(log.errors).toEqual([]);
});

test('switching from a workspace: marks the current one, clears the old one, and loads the other', async ({ page }) => {
  const log = await setup(page, { start: WS.a });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  await expect(page.getByText('Northgate spring leasing')).toBeVisible();
  await scan(page, 'workspace-a');
  await nav(page).getByRole('button', { name: 'Workspaces' }).click();
  await expect(page.getByRole('heading', { name: /switch workspace/i })).toBeFocused();
  await expect(page.getByText('Current workspace')).toBeVisible();
  await expect(page.getByRole('button', { name: /northgate vehicle leasing is your current workspace/i })).toBeDisabled();
  await scan(page, 'chooser-switch');
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Northgate|spring leasing/);
  await expect(page.getByText('Aesthetics clinic', { exact: true }).first()).toBeVisible();
  await scan(page, 'workspace-b');
  expect(log.errors).toEqual([]);
});

test('revoked access: an unavailable workspace is refused safely and the list is refreshed', async ({ page }) => {
  const log = await setup(page, { selectStatus: 400 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /not available to your account any more/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /welcome back/i })).toHaveCount(0);
  expect(log.refreshes).toBe(0);
  await scan(page, 'chooser-revoked');
});

test('a workspace that is not yet approved is shown, disabled and explained', async ({ page }) => {
  await setup(page, { list: [WS.a, WS.b, WS.c] });
  await page.goto('/');
  const row = page.locator('li', { hasText: 'Harbour Partners' });
  await expect(row.getByRole('button')).toBeDisabled();
  await expect(row).toContainText(/not ready yet/i);
  await scan(page, 'chooser-unapproved');
});

test('stale responses from the workspace being left never appear in the new one', async ({ page }) => {
  const log = await setup(page, { start: WS.a, aBrainDelay: 2500 });
  await page.goto('/');
  await nav(page).getByRole('button', { name: 'Workspaces' }).click();
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  await page.waitForTimeout(3000); // A's slow Brand Brain answer arrives now
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Northgate');
  expect(log.errors).toEqual([]);
});

test('save and resume across switching: each workspace keeps its own saved progress', async ({ page }) => {
  const log = await setup(page, { start: WS.a });
  log.data.ba.onboarding = doc(WS.a, { version: 2, status: 'in_progress', completed_at: null, current_step: 3, channels: { values: [], source: null } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /who do you serve/i })).toBeVisible();
  await page.getByLabel(/what do you want a campaign to achieve/i).fill('Fill the Northgate diary');
  await page.getByRole('button', { name: /^save progress$/i }).click();
  await expect(page.getByText(/setup progress saved\. you can leave/i)).toBeVisible();
  await nav(page).getByRole('button', { name: 'Workspaces' }).click();
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Workspaces' }).click();
  await page.getByRole('button', { name: 'Use Northgate Vehicle Leasing' }).click();
  await expect(page.getByRole('heading', { name: /who do you serve/i })).toBeVisible();
  await expect(page.getByLabel(/what do you want a campaign to achieve/i)).toHaveValue('Fill the Northgate diary');
  expect(log.puts.map((p) => p.brand)).toEqual(['ba']); // B was never written to
  await scan(page, 'resume-after-switch');
});

test('unsaved answers: switching needs an explicit decision, and the dialog is accessible', async ({ page }) => {
  const log = await setup(page, { start: WS.a });
  log.data.ba.onboarding = doc(WS.a, { version: 2, status: 'in_progress', completed_at: null, current_step: 3, channels: { values: [], source: null } });
  await page.goto('/');
  await page.getByLabel(/what do you want a campaign to achieve/i).fill('Typed but not saved');
  await nav(page).getByRole('button', { name: 'Workspaces' }).click();
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).click();
  await expect(page.getByRole('alertdialog')).toContainText(/discard unsaved answers/i);
  expect(log.selects).toEqual([]);
  await scan(page, 'chooser-discard-confirm');
  await page.getByRole('button', { name: /stay here/i }).click();
  await expect(page.getByRole('alertdialog')).toHaveCount(0);
});

test('keyboard: the chooser is operable without a mouse', async ({ page }) => {
  const log = await setup(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /choose a workspace/i })).toBeFocused();
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  expect(log.selects).toHaveLength(1);
});
