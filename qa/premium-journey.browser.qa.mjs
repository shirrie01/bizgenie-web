// Real-browser journey QA of the Premium Studio (BG-STUDIO-018-FE), flag-ON production build, fully MOCKED API and Supabase.
// NOT a deployed or staging journey. Two workspaces in two industries: sign in, choose one, see its campaigns and workspace-wide
// calendar, reload and resume, then switch workspace while the first workspace's calendar response is still in flight and prove that
// nothing from the first workspace ever appears in the second.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally; CI installs it */ }
const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

const WS = {
  a: { tenant_id: 't1', tenant_name: 'Group', project_id: 'pa', project_name: 'A', brand_id: 'ba', brand_name: 'Northgate Vehicle Leasing', brand_status: 'approved', membership_role: 'owner' },
  b: { tenant_id: 't1', tenant_name: 'Group', project_id: 'pb', project_name: 'B', brand_id: 'bb', brand_name: 'Brookside Aesthetics', brand_status: 'approved', membership_role: 'owner' },
};
const when = (days) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + days); d.setUTCHours(10, 0, 0, 0); return d.toISOString(); };
const DATA = {
  ba: { desc: 'We lease cars and vans to small businesses.', sector: 'leasing', camp: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: 'Northgate spring leasing', content: 'Lease offer post', platform: 'instagram', label: 'Instagram', at: when(2) } },
  bb: { desc: 'An aesthetics clinic offering facials and consultations.', sector: 'aesthetics', camp: { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', name: 'Brookside glow campaign', content: 'Consultation reminder', platform: 'email', label: 'Email', at: when(3) } },
};
const doc = (w) => ({ contract_version: 'workspace-onboarding.v1', tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id, version: 3, status: 'completed', sector: { key: DATA[w.brand_id].sector, source: 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z', updated_at: '2026-10-24T10:00:00.000Z' });
const sessionJson = (w) => JSON.stringify({ access_token: w ? `tok-${w.brand_id}` : 'tok-identity', refresh_token: 'refresh-x', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: w ? { tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id } : {} } });

async function setup(page, { calendarDelayMs = {} } = {}) {
  const log = { selected: null, errors: [], leakedAfterSwitch: [], puts: [], stored: {} };
  page.on('pageerror', (e) => log.errors.push(e.message));
  await page.addInitScript(([t]) => { if (!localStorage.getItem('sb-supabase-auth-token')) localStorage.setItem('sb-supabase-auth-token', t); }, [sessionJson(null)]);
  await page.route(/fonts\./, (r) => r.abort());
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  await page.route('http://supabase.test/**', (route) => (route.request().method() === 'OPTIONS' ? json(route, {}) : route.request().url().includes('/auth/v1/token') ? json(route, JSON.parse(sessionJson(log.selected))) : json(route, {}, 404)));
  await page.route('http://api.test/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const token = (req.headers().authorization || '').replace('Bearer ', ''); const brand = token.startsWith('tok-') ? token.slice(4) : null; const d = brand && DATA[brand];
    if (m === 'OPTIONS') return json(route, {});
    if (u.pathname === '/customer/workspace' && m === 'GET') return json(route, { status: 'selection_required', workspace: null, workspaces: [WS.a, WS.b] });
    if (u.pathname === '/customer/workspace/select') { const b = JSON.parse(req.postData()); const w = [WS.a, WS.b].find((x) => x.project_id === b.project_id); log.selected = w; return json(route, { status: 'ready', workspace: w, requires_session_refresh: true }); }
    if (!d) return json(route, { status: 'failed', error: { code: 'WORKSPACE_NOT_AUTHORIZED' } }, 403);
    const w = brand === 'ba' ? WS.a : WS.b; const c = d.camp;
    if (u.pathname.endsWith('/workspace/brand-brain') && m === 'PUT') { const b = JSON.parse(req.postData()); log.puts.push(b); log.stored[brand] = { ...b, brand_id: w.brand_id, project_id: w.project_id, metadata: { version: 2, status: 'approved' } }; return json(route, { status: 'ready', brand_brain: log.stored[brand] }); }
    if (u.pathname.endsWith('/workspace/brand-brain')) return json(route, { status: 'ready', brand_brain: log.stored[brand] || { brand_id: w.brand_id, project_id: w.project_id, name: w.brand_name, identity: { description: d.desc }, metadata: { version: 1, status: 'approved' } } });
    if (u.pathname.endsWith('/workspace/onboarding')) return json(route, { status: 'ready', onboarding: doc(w), brand_name_placeholder: false });
    if (u.pathname === '/customer/campaigns') return json(route, { campaigns: [{ campaign_id: c.id, name: c.name, status: 'active', archived_at: null, updated_at: '2026-10-20T09:00:00.000Z' }] });
    if (u.pathname === `/customer/campaigns/${c.id}`) return json(route, { campaign: { campaign_id: c.id, tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id, name: c.name, goal: 'g', display_timezone: 'Europe/London', version: 2, items: [{ content_item_id: 'i1', name: c.content, format: 'text', variants: [{ variant_id: 'v1', platform: c.platform, placement: 'feed', destination_label: c.label, workflow: 'scheduled' }] }] } });
    if (u.pathname === `/customer/campaigns/${c.id}/calendar`) { if (calendarDelayMs[brand]) await new Promise((r) => setTimeout(r, calendarDelayMs[brand])); return json(route, { entries: [{ campaign_id: c.id, content_item_id: 'i1', variant_id: 'v1', workflow: 'scheduled', occurrence_at: c.at }] }); }
    return json(route, {}, 404);
  });
  return log;
}
const nav = (page) => page.getByRole('navigation', { name: /workspace sections/i });
async function checks(page, label) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${label}: overflow`).toBe(false);
  if (AXE) { await page.addScriptTag({ content: AXE }); const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)); expect(v, `${label}: axe`).toEqual([]); }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-${label}.png`, fullPage: true }); }
}

test('returning customer: choose a workspace, see its campaign in the all-campaigns calendar, reload and resume the same workspace', async ({ page }) => {
  const log = await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Use Northgate Vehicle Leasing' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  await expect(page.getByText('Northgate spring leasing').first()).toBeVisible();
  await nav(page).getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /calendar · all campaigns/i })).toBeVisible();
  await expect(page.getByText(/read 1 of 1 campaign for/i)).toBeVisible();
  await expect(page.getByText('Lease offer post').first()).toBeVisible();
  await expect(page.getByText(/does not publish for you/i)).toBeVisible();
  await checks(page, 'journey-calendar');
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  await expect(page.getByText('Northgate spring leasing').first()).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/Brookside/);
  expect(log.errors).toEqual([]);
});

test('switching workspace while the first workspace\'s calendar is still loading never shows the first workspace in the second', async ({ page }) => {
  const log = await setup(page, { calendarDelayMs: { ba: 2500 } });
  await page.goto('/');
  await page.getByRole('button', { name: 'Use Northgate Vehicle Leasing' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByText(/loading your campaigns' calendars/i)).toBeVisible();
  await nav(page).getByRole('button', { name: 'Workspaces', exact: true }).click();
  await page.getByRole('button', { name: 'Use Brookside Aesthetics' }).click();
  const confirm = page.getByRole('button', { name: /discard|switch anyway|continue/i });
  if (await confirm.count()) await confirm.first().click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Brookside Aesthetics.' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByText('Consultation reminder').first()).toBeVisible();
  await page.waitForTimeout(3200); // A's delayed answer has now arrived
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/Northgate|Lease offer post|spring leasing/);
  await expect(page.getByText('Brookside glow campaign').first()).toBeVisible();
  await checks(page, 'journey-switched');
  expect(log.errors).toEqual([]);
});

test('Brand tab: voice and strategy sends only what changed, keeps the owner-confirmed identity, and is accessible', async ({ page }) => {
  const log = await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Use Northgate Vehicle Leasing' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  await nav(page).getByRole('button', { name: 'Brand', exact: true }).click();
  await expect(page.getByRole('heading', { name: /voice, positioning and strategy/i })).toBeVisible();
  await expect(page.getByText(/none of this is a measured result or an insight learned from your performance/i)).toBeVisible();
  await page.getByText('Voice and language').click();
  await page.getByLabel('Tone of voice').fill('Warm and plain-spoken');
  await page.getByLabel('Words and phrases to avoid').fill('cheap\nfree');
  await checks(page, 'brand-strategy');
  await page.getByRole('button', { name: /save voice and strategy/i }).click();
  await expect(page.getByText(/only the details you changed here were sent/i)).toBeVisible();
  expect(log.puts).toHaveLength(1);
  expect(log.puts[0].name).toBe('Northgate Vehicle Leasing');
  expect(log.puts[0].identity.description).toBe('We lease cars and vans to small businesses.');
  expect(log.puts[0].voice).toEqual({ tone: 'Warm and plain-spoken', prohibited_terms: ['cheap', 'free'] });
  await page.reload();
  await nav(page).getByRole('button', { name: 'Brand', exact: true }).click();
  await page.getByText(/Voice and language/).click();
  await expect(page.getByLabel('Tone of voice')).toHaveValue('Warm and plain-spoken');
  expect(log.errors).toEqual([]);
});

test('calendar: operable with the keyboard alone (view, navigation, filters, refresh), with visible focus and no focus loss', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Use Northgate Vehicle Leasing' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  const calTab = nav(page).getByRole('button', { name: 'Calendar', exact: true });
  await calTab.focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /calendar · all campaigns/i })).toBeVisible();
  const week = page.getByRole('button', { name: 'Week', exact: true });
  await week.focus(); await page.keyboard.press('Enter');
  await expect(week).toHaveAttribute('aria-pressed', 'true');
  await expect(week).toBeFocused(); // activating a control does not move focus away
  const title = page.getByRole('heading', { level: 3 }).filter({ hasText: /^Week of/ });
  const before = await title.textContent();
  const next = page.getByRole('button', { name: /next week/i });
  await next.focus(); await page.keyboard.press('Enter');
  expect(await title.textContent()).not.toBe(before);
  await expect(next).toBeFocused();
  await page.getByRole('button', { name: /^day$/i }).focus(); await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: /^day$/i })).toHaveAttribute('aria-pressed', 'true');
  const status = page.getByLabel('Status');
  await status.focus(); await page.keyboard.press('ArrowDown');
  await expect(status).toBeFocused();
  const outline = await week.evaluate((el) => { el.focus(); const s = getComputedStyle(el); return { style: s.outlineStyle, width: parseFloat(s.outlineWidth), shadow: s.boxShadow }; });
  expect(outline.style !== 'none' && outline.width > 0 || outline.shadow !== 'none').toBe(true); // a visible focus indicator
  const refresh = page.getByRole('button', { name: /^refresh$/i });
  await refresh.focus(); await page.keyboard.press('Enter');
  await expect(page.getByText(/read 1 of 1 campaign for/i)).toBeVisible();
});
