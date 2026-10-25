// Real-browser multi-industry QA of the Premium Studio (BG-STUDIO-017-FE), flag-ON production build.
// The API and Supabase endpoints are fully MOCKED in the browser (no network, no credentials): this is NOT a deployed or
// staging journey. Build with VITE_PREMIUM_STUDIO_ENABLED=true and placeholder VITE_* values.
// For each of four businesses (vehicle leasing, professional services, aesthetics, drinks) it opens every workspace
// section and proves: the business's own name appears, no OTHER business's name or sector language appears, "Fonzo"
// appears only for the drinks business that is genuinely called Fonzo, there is no horizontal overflow, and no page error.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally; CI installs it */ }
async function axeViolations(page) {
  if (!AXE) return [];
  await page.addScriptTag({ content: AXE });
  return page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
}

const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };

const BUSINESSES = [
  { id: 'leasing', name: 'Northgate Vehicle Leasing', description: 'We lease cars and vans to small businesses.', sector: 'leasing', label: 'Vehicle leasing' },
  { id: 'prof', name: 'Ashdown & Pryce Chartered Accountants', description: 'Tax and advisory services for owner-managed businesses.', sector: 'neutral', shown: 'professional', label: 'Professional services' },
  { id: 'aesthetics', name: 'Clearskin Studio', description: 'A skincare and aesthetics clinic offering facials and consultations.', sector: 'aesthetics', label: 'Aesthetics clinic' },
  { id: 'drinks', name: 'Fonzo', description: 'Soft drinks for everyone.', sector: 'beverage', label: 'Soft drinks' },
];
const SECTOR_TERMS = {
  leasing: [/\blease\b/i, /\bleasing\b/i], aesthetics: [/\bclinic\b/i, /\bfacials?\b/i, /\bskincare\b/i],
  beverage: [/\bflavours?\b/i, /\bcans\b/i, /\bsoft drinks?\b/i], neutral: [], professional: [/\badvisory\b/i, /\bexpertise\b/i],
};

const workspace = (b) => ({ tenant_id: `t-${b.id}`, tenant_name: `${b.name} group`, project_id: `p-${b.id}`, project_name: `${b.name} campaigns`, brand_id: `b-${b.id}`, brand_name: b.name, brand_status: 'approved', membership_role: 'owner' });
const onboardingDoc = (b, w) => ({
  contract_version: 'workspace-onboarding.v1', tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id, version: 3, status: 'completed',
  sector: { key: b.sector, source: b.shown ? 'inferred' : 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {},
  completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z', updated_at: '2026-10-24T10:00:00.000Z',
});
const session = (w) => JSON.stringify({ access_token: `tok-${w.brand_id}`, refresh_token: 'refresh-x', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: w.tenant_id, project_id: w.project_id, brand_id: w.brand_id } } });

async function open(page, b) {
  const w = workspace(b); const errors = []; const calls = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [session(w)]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  await page.route('http://supabase.test/**', (route) => json(route, route.request().url().includes('/auth/v1/token') ? JSON.parse(session(w)) : {}, route.request().url().includes('/auth/v1/token') ? 200 : 404));
  await page.route('http://api.test/**', (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method(); calls.push(`${m} ${u.pathname}`);
    if (m === 'OPTIONS') return json(route, {});
    if (u.pathname === '/customer/workspace') return json(route, { status: 'ready', workspace: w });
    if (u.pathname === '/customer/workspace/brand-brain') return json(route, { status: 'ready', brand_brain: { brand_id: w.brand_id, project_id: w.project_id, name: b.name, identity: { description: b.description }, metadata: { version: 1, status: 'approved' } } });
    if (u.pathname === '/customer/workspace/onboarding') return json(route, { status: 'ready', onboarding: onboardingDoc(b, w), brand_name_placeholder: false });
    if (u.pathname === '/customer/campaigns') return json(route, { campaigns: [] });
    return json(route, { status: 'failed', error: { code: 'NOT_FOUND' } }, 404);
  });
  return { errors, calls, w };
}

for (const b of BUSINESSES) {
  test(`${b.id}: every workspace section shows only this business, in its own language, with no overflow`, async ({ page }) => {
    const { errors } = await open(page, b);
    await page.goto('/');
    await expect(page.getByRole('heading', { name: `Welcome back, ${b.name}.` })).toBeVisible();
    const nav = page.getByRole('navigation', { name: /workspace sections/i });
    const others = BUSINESSES.filter((o) => o.id !== b.id);
    for (const view of ['Overview', 'Set up', 'Campaign Studio', 'Calendar', 'Brand', 'Plan and billing', 'Workspaces']) {
      await nav.getByRole('button', { name: view, exact: true }).click();
      await page.waitForTimeout(250);
      const text = await page.locator('main').innerText();
      for (const o of others) {
        expect(text, `${b.id}/${view} must not mention ${o.name}`).not.toContain(o.name);
        expect(text, `${b.id}/${view} must not repeat ${o.id}'s description`).not.toContain(o.description);
        for (const re of SECTOR_TERMS[o.shown || o.sector]) {
          // another sector's vocabulary must not appear, unless it is this business's own words
          const own = `${b.name} ${b.description}`;
          if (!re.test(own)) expect(text, `${b.id}/${view} must not use ${o.sector} language ${re}`).not.toMatch(re);
        }
      }
      if (view === 'Overview' && b.shown) {
        // Professional services (DEC-023): own guidance, labelled as worked out from the customer's words and not saved as such.
        await expect(page.locator('.ps-chip')).toHaveText(b.label);
        expect(text).toMatch(/show your expertise/i);
        expect(text).toMatch(/inferred from what you typed/i);
      }
      if (b.name !== 'Fonzo') expect(text, `${b.id}/${view}`).not.toMatch(/fonzo|bubblo/i);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      expect(overflow, `${b.id}/${view}: horizontal overflow`).toBe(false);
      expect(await axeViolations(page), `${b.id}/${view}: axe`).toEqual([]);
      if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-${b.id}-${view.replace(/\W+/g, '_')}.png`, fullPage: true }); }
    }
    expect(errors).toEqual([]);
  });
}
