// Real-browser QA of billing presentation and the campaign calendar in the Premium Studio (BG-STUDIO-017-FE, DEC-023).
// The API and Supabase are fully MOCKED (no network, no credentials): this is NOT a deployed or staging journey, and the
// plan, credit and date values below are TEST VALUES chosen so a hard-coded number would be caught; they are not pricing.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally; CI installs it */ }
const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const CID = '22222222-2222-4222-8222-222222222222';
const w = { tenant_id: 't1', tenant_name: 'Northgate Group', project_id: 'p1', project_name: 'Northgate campaigns', brand_id: 'b1', brand_name: 'Northgate Vehicle Leasing', brand_status: 'approved', membership_role: 'owner' };
const sess = JSON.stringify({ access_token: 'tok-b1', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 't1', project_id: 'p1', brand_id: 'b1' } } });
const onboarding = { contract_version: 'workspace-onboarding.v1', tenant_id: 't1', project_id: 'p1', brand_id: 'b1', version: 3, status: 'completed', sector: { key: 'leasing', source: 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z', updated_at: '2026-10-24T10:00:00.000Z' };
const campaign = { campaign_id: CID, tenant_id: 't1', project_id: 'p1', brand_id: 'b1', name: 'Northgate spring leasing', goal: 'More enquiries', display_timezone: 'Europe/London', version: 1, items: [] };

async function open(page, { subscription, calendar = [], calendarStatus = 200 }) {
  const log = { calls: [], errors: [] };
  page.on('pageerror', (e) => log.errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [sess]);
  await page.route(/fonts\./, (r) => r.abort());
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  await page.route('http://supabase.test/**', (route) => json(route, JSON.parse(sess)));
  await page.route('http://api.test/**', (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method(); log.calls.push(`${m} ${u.pathname}`);
    if (m === 'OPTIONS') return json(route, {});
    if (u.pathname === '/customer/workspace') return json(route, { status: 'ready', workspace: w });
    if (u.pathname === '/customer/workspace/brand-brain') return json(route, { status: 'ready', brand_brain: { brand_id: 'b1', project_id: 'p1', name: w.brand_name, identity: { description: 'We lease cars and vans to small businesses.' }, metadata: { version: 1, status: 'approved' } } });
    if (u.pathname === '/customer/workspace/onboarding') return json(route, { status: 'ready', onboarding, brand_name_placeholder: false });
    if (u.pathname === '/customer/campaigns') return json(route, { campaigns: [{ campaign_id: CID, name: campaign.name, status: 'active', archived_at: null, updated_at: '2026-10-20T09:00:00.000Z' }] });
    if (u.pathname === `/customer/campaigns/${CID}`) return json(route, { campaign });
    if (u.pathname === `/customer/campaigns/${CID}/calendar`) { log.calendarQuery = Object.fromEntries(u.searchParams); return calendarStatus === 200 ? json(route, { entries: calendar }) : json(route, { status: 'failed' }, calendarStatus); }
    if (u.pathname === '/customer/billing/subscription') return json(route, subscription);
    return json(route, { status: 'failed', error: { code: 'NOT_FOUND' } }, 404);
  });
  return log;
}
async function checks(page, label) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow, `${label}: horizontal overflow`).toBe(false);
  if (AXE) {
    await page.addScriptTag({ content: AXE });
    const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`));
    expect(v, `${label}: axe`).toEqual([]);
  }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-${label}.png`, fullPage: true }); }
}
const nav = (page) => page.getByRole('navigation', { name: /workspace sections/i });

test('billing: an active entitlement shows the API plan, credits and period, no price, and no payment claim', async ({ page }) => {
  const log = await open(page, { subscription: { status: 'ready', subscription: { plan_code: 'standard', entitlement_status: 'active', included_monthly_credit_grant: 125, reference_period_start: '2026-10-01T00:00:00.000Z', reference_period_end: '2026-11-01T00:00:00.000Z' }, available_credits: 90 } });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' }).waitFor();
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await expect(page.getByText('Standard plan · Active')).toBeVisible();
  await expect(page.locator('main')).toContainText('125');
  await expect(page.locator('main')).toContainText('90');
  await expect(page.locator('main')).toContainText('1 October 2026 to 1 November 2026');
  await expect(page.getByText(/not a payment receipt/i)).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\b60\b/);
  expect(text).not.toMatch(/[£$€]\s?\d|\d\s?(per|a|\/)\s?(month|year)/i);
  expect(text).not.toMatch(/payment (was )?(confirmed|successful|received)|you have paid/i);
  await expect(page.getByRole('button', { name: /secure checkout/i })).toHaveCount(0);
  await checks(page, 'billing-active');
  expect(log.errors).toEqual([]);
});

test('billing: not subscribed offers checkout, says Stripe shows the price, and invents no price or credits', async ({ page }) => {
  await open(page, { subscription: { status: 'not_subscribed', subscription: null, available_credits: null } });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' }).waitFor();
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await expect(page.getByRole('button', { name: /continue to secure checkout/i })).toBeVisible();
  await expect(page.getByText(/shows the price and billing terms before you pay/i)).toBeVisible();
  const text = await page.locator('main').innerText();
  expect(text).not.toMatch(/\b\d+\s+credits\b|[£$€]\s?\d/i);
  await checks(page, 'billing-not-subscribed');
});

test('calendar: loads by itself for the open campaign, states the window and the campaign-only scope', async ({ page }) => {
  const log = await open(page, { subscription: { status: 'not_subscribed', subscription: null }, calendar: [{ campaign_id: CID, content_item_id: 'c1', variant_id: 'v1', workflow: 'scheduled', occurrence_at: '2026-11-02T10:00:00.000Z' }] });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' }).waitFor();
  await nav(page).getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByText(/showing activity from .* to .* \(the last 30 days and the next 90 days\)/i)).toBeVisible();
  await expect(page.getByText(/Northgate spring leasing/, { exact: false }).first()).toBeVisible();
  await expect(page.getByText(/a calendar across all your campaigns is not available yet/i)).toBeVisible();
  await expect(page.getByText('Scheduled', { exact: true })).toBeVisible();
  expect(log.calls.filter((c) => c.endsWith('/calendar'))).toHaveLength(1); // exactly one automatic request, no loop
  expect(Math.round((new Date(log.calendarQuery.to) - new Date(log.calendarQuery.from)) / 86400000)).toBe(120);
  await checks(page, 'calendar-auto');
});

test('calendar: a failed load shows the error once, with Try again, and does not loop', async ({ page }) => {
  const log = await open(page, { subscription: { status: 'not_subscribed', subscription: null }, calendarStatus: 503 });
  await page.goto('/');
  await page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' }).waitFor();
  await nav(page).getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: /calendar activity could not be loaded yet/i })).toBeVisible();
  await page.waitForTimeout(800);
  expect(log.calls.filter((c) => c.endsWith('/calendar'))).toHaveLength(1);
  await expect(page.getByRole('button', { name: /^try again$/i })).toBeVisible();
  await checks(page, 'calendar-error');
});
