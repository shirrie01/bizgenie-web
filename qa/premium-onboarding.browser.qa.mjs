// Real-browser QA of the six-panel onboarding (BG-WEB-ONBOARDING-MOCKUP, Issue #85). The API and the Supabase session are fully MOCKED in the browser (no network, no credentials):
// this is NOT a staging journey and NOT customer acceptance. It checks that the six panels work, nothing overflows, nothing is unlabelled, and screenshots (EVIDENCE_DIR) can be reviewed.
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally; CI installs it */ }
const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const token = () => JSON.stringify({ access_token: 'fake-local-test-token', refresh_token: 'x', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 't', project_id: 'p', brand_id: 'b' } } });
const brain = () => ({ brand_id: 'b', project_id: 'p', name: 'Harbour Partners', identity: { description: '' }, voice: { tone: 'Calm and plain-spoken' }, commercial: { differentiators: ['Independent', 'Fixed-fee advice'] }, visual: { colours: ['Navy', 'Sand'] }, metadata: { version: 1, status: 'draft' } });
const onboarding = (over = {}) => ({ contract_version: 'workspace-onboarding.v1', tenant_id: 't', project_id: 'p', brand_id: 'b', version: 0, status: 'not_started', sector: { key: null, source: null }, industry_text: null, channels: { values: [], source: null }, draft: {}, current_step: null, completed_at: null, updated_at: null, ...over });

async function setup(page) {
  const log = { puts: [], calls: [], errors: [], doc: onboarding() };
  page.on('pageerror', (e) => log.errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [token()]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('http://api.test/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method(); log.calls.push(`${m} ${u.pathname}`);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) });
    if (m === 'OPTIONS') return json({});
    if (u.pathname === '/customer/workspace') return json({ status: 'ready', workspace: { tenant_id: 't', tenant_name: 'T', project_id: 'p', project_name: 'P', brand_id: 'b', brand_name: 'Harbour Partners', brand_status: 'approved', membership_role: 'owner' } });
    if (u.pathname.endsWith('/workspace/brand-brain')) return json({ status: 'ready', brand_brain: brain() });
    if (u.pathname.endsWith('/workspace/onboarding')) {
      if (m === 'GET') return json({ status: 'ready', onboarding: log.doc, brand_name_placeholder: false });
      const b = JSON.parse(req.postData()); log.puts.push(b);
      log.doc = { ...log.doc, version: log.doc.version + 1, status: 'in_progress', current_step: Number.isInteger(b.current_step) ? b.current_step : log.doc.current_step, channels: Array.isArray(b.channels) ? { values: b.channels, source: 'customer' } : log.doc.channels, sector: typeof b.sector_key === 'string' ? { key: b.sector_key, source: b.sector_source || 'customer' } : log.doc.sector, draft: { ...log.doc.draft, ...(b.draft || {}) } };
      return json({ status: 'saved', replayed: false, onboarding: log.doc, brand_name_placeholder: false });
    }
    if (u.pathname === '/customer/campaigns' && m === 'GET') return json({ campaigns: [] });
    return json({}, 404);
  });
  return log;
}

async function scan(page, label) {
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('.ps-onboarding button, .ps-onboarding a[href], .ps-onboarding input, .ps-onboarding select, .ps-onboarding textarea')].filter((e) => e.offsetParent !== null).map((e) => ({ t: (e.textContent || e.id || e.tagName).trim().slice(0, 24), r: e.getBoundingClientRect() })).filter((x) => x.r.height < 24 || x.r.width < 24).map((x) => x.t);
    const offenders = [...document.querySelectorAll('.ps-onboarding *')].filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => e.tagName + '.' + e.className).slice(0, 5);
    return { overflow: document.documentElement.scrollWidth > vw + 1, offenders, small };
  });
  expect(m, `${label}: layout`).toEqual({ overflow: false, offenders: [], small: [] });
  if (AXE) {
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    expect(v, `${label}: axe`).toEqual([]);
  }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/onboarding-${W}-${label}.png`, fullPage: true }); }
}
const count = (page) => page.locator('.ps-panel-count');

test('the six panels work end to end with saved progress, and every panel is accessible and fits the viewport', async ({ page }) => {
  const log = await setup(page);
  await page.goto('/');
  // A workspace with a brand but no saved setup resumes at "What you do" (part 2 of the business panel).
  await expect(page.getByRole('heading', { name: /what does your business do/i })).toBeVisible();
  await expect(count(page)).toHaveText('Step 2 of 6: Your business (part 2 of 2)');
  await expect(page.getByRole('list', { name: 'Setup progress' }).getByRole('listitem')).toHaveCount(6);
  await scan(page, '2-business');
  // Welcome (panel 1): reachable by going back; promises, no stock photography.
  await page.getByRole('button', { name: /^back$/i }).click(); await page.getByRole('button', { name: /^back$/i }).click();
  await expect(page.getByRole('heading', { name: /set up your workspace/i })).toBeVisible();
  await expect(page.getByRole('list', { name: /what bizgenie promises/i })).toContainText(/never publishes, schedules or connects/i);
  expect(await page.locator('.ps-onboarding img').count()).toBe(0);
  await expect(count(page)).toHaveText('Step 1 of 6: Welcome');
  await scan(page, '1-welcome');
  // Business -> goals.
  await page.getByRole('button', { name: /^continue$/i }).click(); await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByLabel(/describe what the business does/i).fill('Independent business advisers for small firms.');
  await page.getByLabel(/what should a customer do next/i).fill('Book a call');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('heading', { name: /who do you serve/i })).toBeVisible();
  await expect(count(page)).toHaveText('Step 3 of 6: Your goals');
  await page.getByLabel(/who are your customers/i).fill('Owner-managed firms');
  const obj = page.getByRole('button', { name: /get more customers/i });
  await obj.click(); await expect(obj).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByLabel(/what do you want a campaign to achieve/i)).toHaveValue('Get more customers for my business');
  await scan(page, '3-goals');
  // Brand setup comes before Channels: real stored values, logo honestly unavailable, no upload control.
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('heading', { name: /set up your brand/i })).toBeVisible();
  await expect(count(page)).toHaveText('Step 4 of 6: Brand setup');
  const cards = page.getByRole('group', { name: /brand setup/i });
  await expect(cards).toContainText('Calm and plain-spoken'); await expect(cards).toContainText('Independent, Fixed-fee advice'); await expect(cards).toContainText('Navy, Sand'); await expect(cards).toContainText(/logo upload isn't available in this version yet/i);
  expect(await cards.locator('input[type="file"]').count()).toBe(0);
  await scan(page, '4-brand');
  // Channels: planning only; nothing connectable in this build.
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('heading', { name: /where would you like to reach customers/i })).toBeVisible();
  await expect(count(page)).toHaveText('Step 5 of 6: Channels');
  await page.getByRole('button', { name: /^Instagram/ }).click(); await page.getByRole('button', { name: /^Email/ }).click();
  expect(await page.getByRole('button', { name: /connect/i }).count()).toBe(0);
  await expect(page.getByText(/connecting isn't available in this version yet/i).first()).toBeVisible();
  await scan(page, '5-channels');
  // Save progress: the stored position is the stage INDEX (channels = 4), unchanged by the new order.
  await page.getByRole('button', { name: /^save progress$/i }).click();
  await expect(page.getByTestId('ps-save-state')).toContainText(/Setup progress saved \(version 1\)/);
  expect(log.puts.at(-1).current_step).toBe(4);
  expect([...log.puts.at(-1).channels].sort()).toEqual(['email', 'instagram']);
  // Review: a summary and the promise; nothing is generated.
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('heading', { name: /review your campaign proposal/i })).toBeVisible();
  await expect(count(page)).toHaveText('Step 6 of 6: Review proposal');
  const summary = page.getByRole('region', { name: /what bizgenie will plan from/i });
  await expect(summary).toContainText('Get more customers'); await expect(summary).toContainText('Instagram, Email');
  await expect(page.getByRole('list', { name: /what happens next/i })).toContainText(/nothing is generated, scheduled or published until you approve it and separately authorise it/i);
  await scan(page, '6-review');
  expect(log.calls.filter((c) => /generation|quotes|social|checkout|stripe/i.test(c))).toEqual([]); // no generation, social or billing request was made
  expect(log.errors).toEqual([]);
});

test('a saved position still resumes the same stage: step index 4 reopens Channels', async ({ page }) => {
  const log = await setup(page);
  log.doc = onboarding({ version: 2, status: 'in_progress', current_step: 4, sector: { key: 'professional_services', source: 'customer' }, channels: { values: ['email'], source: 'customer' } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /where would you like to reach customers/i })).toBeVisible();
  await expect(count(page)).toHaveText('Step 5 of 6: Channels');
  await expect(page.getByRole('button', { name: /^Email/ })).toHaveAttribute('aria-pressed', 'true');
});
