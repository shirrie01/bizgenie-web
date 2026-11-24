// Real-browser QA of the launch-week plan panel on the flag-ON production build (BG-FOUNDER-E2E-FINAL-01).
// The API and the Supabase session are fully MOCKED in the browser (no network, no credentials, no provider): NOT a staging or hosted journey.
// Build with VITE_PREMIUM_STUDIO_ENABLED=true VITE_CONTENT_PLAN_API=true VITE_SUPABASE_URL=http://supabase.test VITE_SUPABASE_PUBLISHABLE_KEY=placeholder VITE_BIZGENIE_API_URL=http://api.test
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let AXE = null; try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally */ }
const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const CID = '22222222-2222-4222-8222-222222222222';
const PLAN = JSON.parse(fs.readFileSync(process.env.PLAN_FIXTURE || 'qa/fixtures/fonzo-plan.json', 'utf8')); // FIXTURE output of the API planner, not customer data
const token = JSON.stringify({ access_token: 'fake-local-test-token', refresh_token: 'x', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 't', project_id: 'p', brand_id: 'b' } } });
const brain = { brand_id: 'b', project_id: 'p', name: 'Fonzo', identity: { description: 'Fonzo is a UK sugar-free soft drinks brand sold in 330ml cans.' }, metadata: { version: 1, status: 'approved' } };
const onboarding = { contract_version: 'workspace-onboarding.v1', tenant_id: 't', project_id: 'p', brand_id: 'b', version: 3, status: 'completed', sector: { key: 'beverage', source: 'customer' }, industry_text: null, channels: { values: ['instagram'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-11-24T10:00:00.000Z', updated_at: '2026-11-24T10:00:00.000Z' };
const rec = { recommendation_id: '11111111-1111-4111-8111-111111111111', tenant_id: 't', project_id: 'p', brand_id: 'b', campaign_name: 'Fonzo launch week (FIXTURE)', summary: 'Generate stockist enquiries and build awareness. Information to confirm: enquiry destination.', explanation: 'Deterministic test fixture.', recommendation_kind: 'trade', not_enough_data_yet: true, evidence_summary: 'No history yet.', next_action: { code: 'create_campaign', label: 'Create campaign' },
  create_campaign_payload: { tenant_id: 't', project_id: 'p', brand_id: 'b', name: 'Fonzo launch week (FIXTURE)', goal: 'g', display_timezone: 'Europe/London' }, suggested_items: [{ name: 'Starter post', format: 'text', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', reason: 'r' }], generated_at: '2026-11-24T10:00:00.000Z' };
const camp = (version, names) => ({ campaign_id: CID, tenant_id: 't', project_id: 'p', brand_id: 'b', name: 'Fonzo launch week (FIXTURE)', goal: 'g', display_timezone: 'Europe/London', version, status: 'draft', counts: { draft: names.length, review: 0, approved: 0, scheduled: 0, published: 0 }, items: names.map((n, i) => ({ content_item_id: `c${i}`, name: n, format: 'text', variants: [{ variant_id: `v${i}`, platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow: 'draft' }] })) });

async function mock(page, calls) {
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [token]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const names = [];
  await page.route('http://api.test/**', async (route) => {
    const req = route.request(), u = new URL(req.url()), m = req.method(); calls.push(`${m} ${u.pathname}`);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) });
    if (m === 'OPTIONS') return json({});
    if (u.pathname === '/customer/workspace') return json({ status: 'ready', workspace: { tenant_id: 't', tenant_name: 'Fonzo Fixture Workspace', project_id: 'p', project_name: 'P', brand_id: 'b', brand_name: 'Fonzo', brand_status: 'approved', membership_role: 'owner' } });
    if (u.pathname.endsWith('/workspace/onboarding')) return json({ status: 'ready', onboarding: onboarding, brand_name_placeholder: false });
    if (u.pathname.endsWith('/brand-brain')) return json({ status: 'ready', brand_brain: brain });
    if (u.pathname === '/customer/campaigns' && m === 'GET') return json({ campaigns: [] });
    if (u.pathname.endsWith('/campaign-recommendations')) return json({ recommendation: rec });
    if (u.pathname === '/customer/campaigns' && m === 'POST') { names.length = 0; return json({ result: { campaign_id: CID, campaign_version: 1 }, campaign: camp(1, []) }); }
    if (u.pathname.endsWith('/content-plan')) return json({ plan: { ...PLAN, campaign_id: CID } });
    if (u.pathname.endsWith('/content-items')) { const b = JSON.parse(req.postData()); if (!names.includes(b.name)) names.push(b.name); return json({ campaign: camp(names.length + 1, names) }, 201); }
    if (u.pathname === `/customer/campaigns/${CID}` && m === 'GET') return json({ campaign: camp(names.length + 1, names) });
    return json({}, 404);
  });
}
async function scan(page, label) {
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('button, a[href], input, select, textarea, summary')].filter((e) => e.offsetParent !== null).map((e) => ({ t: (e.textContent || e.id || e.tagName).trim().slice(0, 24), r: e.getBoundingClientRect() })).filter((x) => x.r.width < 24 || x.r.height < 24).map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
    const offenders = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => e.tagName + '.' + String(e.className).slice(0, 40) + '@' + Math.round(e.getBoundingClientRect().right) + '/' + vw).slice(0, 8);
    return { overflow: document.documentElement.scrollWidth > vw + 1, offenders, small };
  });
  expect(m, `${label}: layout`).toEqual({ overflow: false, offenders: [], small: [] });
  if (AXE) { await page.addScriptTag({ content: AXE }); const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)); expect(v, `${label}: axe`).toEqual([]); }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-${label}.png`, fullPage: true }); }
}

test('launch-week plan: build, review, add as drafts; accessible, no overflow, nothing generated or priced', async ({ page }) => {
  const calls = [], errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await mock(page, calls);
  await page.goto('/');
  await page.getByRole('button', { name: /tell us your goal/i }).first().click();
  await page.getByLabel(/what do you want a campaign to achieve/i).fill('Generate stockist enquiries and build brand awareness for Fonzo');
  for (let i = 0; i < 3; i++) await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /get my recommendation/i }).click();
  await expect(page.getByRole('heading', { name: 'Fonzo launch week (FIXTURE)' })).toBeVisible();
  await page.getByRole('button', { name: /continue in campaign studio/i }).click();
  await page.getByRole('button', { name: /^create campaign$/i }).click();
  await expect(page.getByText(/saved to your workspace/i)).toBeVisible();
  const summary = page.getByText(/plan a launch week for this campaign/i);
  await expect(summary).toBeVisible();
  await summary.click();
  await page.getByLabel('First day of the week').fill('2026-12-07');
  await page.getByRole('button', { name: 'Build my plan' }).click();
  await expect(page.getByRole('table', { name: /seven-day plan/i })).toBeVisible();
  await expect(page.getByText(/5 × image, 3 × video/)).toBeVisible();
  await scan(page, 'plan-built');
  await page.getByRole('button', { name: /add 8 items to this campaign as drafts/i }).click();
  await expect(page.getByText(/8 items added as drafts/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'All plan items are in this campaign' })).toBeDisabled();
  await scan(page, 'plan-added');
  expect(calls.filter((c) => c === 'POST /customer/campaigns/' + CID + '/content-items').length).toBe(9); // 1 starter item + 8 plan items
  expect(calls.some((c) => /generation-quotes|\/confirm|\/schedule|\/approval|\/social/.test(c))).toBe(false);
  expect(errors).toEqual([]);
});
