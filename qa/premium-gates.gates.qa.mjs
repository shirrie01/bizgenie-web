// Real-browser QA of the BG-STUDIO-019-FE capabilities with their build gates ON (plan catalogue, subscription management, credit quotes,
// customer media). Built with VITE_PLAN_CATALOGUE_API, VITE_BILLING_MANAGEMENT_API, VITE_GENERATION_QUOTE_API and VITE_CUSTOMER_MEDIA_API
// set to "true" on port 4181. The API and Supabase are fully MOCKED; every price, credit, term and file below is a TEST VALUE. This is NOT a
// deployed or staging journey, and it proves the screens, not the proposed backend contracts, which are BLOCKED until the backend ships them.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally; CI installs it */ }
const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
const CID = '33333333-3333-4333-8333-333333333333';
const mkWs = (role) => ({ tenant_id: 't1', tenant_name: 'Northgate Group', project_id: 'p1', project_name: 'Northgate campaigns', brand_id: 'b1', brand_name: 'Northgate Vehicle Leasing', brand_status: 'approved', membership_role: role });
const sess = JSON.stringify({ access_token: 'tok-b1', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 't1', project_id: 'p1', brand_id: 'b1' } } });
const onboarding = { contract_version: 'workspace-onboarding.v1', tenant_id: 't1', project_id: 'p1', brand_id: 'b1', version: 3, status: 'completed', sector: { key: 'leasing', source: 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z', updated_at: '2026-10-24T10:00:00.000Z' };
const plans = { catalogue_version: 'fx-1', effective_from: '2026-01-01T00:00:00Z', currency: 'GBP', vat: { treatment: 'exclusive', text: 'TEST VAT STATEMENT' }, terms: { version: 'fx-t1', effective_from: '2026-01-01T00:00:00Z', url: 'https://example.test/terms' }, support: { email: 'help@example.test', hours: 'TEST HOURS' },
  plans: [
    { plan_code: 'alpha', name: 'Alpha', tier: 1, price: { amount_minor: 1111, currency: 'GBP', interval: 'month' }, included_credits: 11, additional_usage: { text: 'TEST ADDITIONAL A' }, renewal: { text: 'TEST RENEWAL A' }, cancellation: { text: 'TEST CANCELLATION A' }, refund: { text: 'TEST REFUND A' }, trial: { days: 7 } },
    { plan_code: 'beta', name: 'Beta', tier: 2, price: { amount_minor: 2222, currency: 'GBP', interval: 'month' }, included_credits: 22, additional_usage: { text: 'TEST ADDITIONAL B' }, renewal: { text: 'TEST RENEWAL B' }, cancellation: { text: 'TEST CANCELLATION B' }, refund: { text: 'TEST REFUND B' } },
  ] };
const caps = { kinds: ['image', 'video', 'hybrid'], platforms: [{ key: 'instagram', label: 'Instagram', aspect_ratios: ['1:1', '9:16'] }], max_assets: 2, max_asset_bytes: 2097152, content_types: ['image/png'], max_brief_chars: 300 };
const soon = () => new Date(Date.now() + 10 * 60000).toISOString();

async function open(page, { role = 'owner', subscription = { status: 'not_subscribed', subscription: null, available_credits: null }, jobs = [] } = {}) {
  const log = { calls: [], bodies: {}, errors: [], jobStatus: 'ready_for_review', name: 'Northgate spring leasing', archived: false, version: 3 };
  page.on('pageerror', (e) => log.errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [sess]);
  await page.route(/fonts\./, (r) => r.abort());
  await page.route('https://checkout.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe-hosted checkout (test)</title>' }));
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  await page.route('http://supabase.test/**', (route) => json(route, JSON.parse(sess)));
  const campaign = (workflow) => ({ campaign_id: CID, tenant_id: 't1', project_id: 'p1', brand_id: 'b1', name: log.name, goal: 'More enquiries', display_timezone: 'Europe/London', version: log.version, archived_at: log.archived ? '2026-10-26T09:00:00.000Z' : null, items: [{ content_item_id: 'i1', name: 'Lease offer post', format: 'text', variants: [{ variant_id: 'v1', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow, current_revision_id: 'rev-1', current_content: { title: 'Lease offer', body: 'Body copy' } }] }], schedules: [] });
  await page.route('http://api.test/**', (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method(); const key = `${m} ${u.pathname}`; log.calls.push(key);
    if (m !== 'GET' && m !== 'OPTIONS') { try { log.bodies[key] = JSON.parse(req.postData()); } catch { /* none */ } }
    if (m === 'OPTIONS') return json(route, {});
    const p = u.pathname;
    if (p === '/customer/workspace') return json(route, { status: 'ready', workspace: mkWs(role) });
    if (p === '/customer/workspace/brand-brain') return json(route, { status: 'ready', brand_brain: { brand_id: 'b1', project_id: 'p1', name: 'Northgate Vehicle Leasing', identity: { description: 'We lease cars and vans to small businesses.' }, metadata: { version: 1, status: 'approved' } } });
    if (p === '/customer/workspace/onboarding') return json(route, { status: 'ready', onboarding, brand_name_placeholder: false });
    if (p === '/customer/campaigns') return json(route, { campaigns: [{ campaign_id: CID, name: log.name, status: log.archived ? 'archived' : 'active', archived_at: log.archived ? '2026-10-26T09:00:00.000Z' : null, updated_at: '2026-10-20T09:00:00.000Z' }] });
    if (p === `/customer/campaigns/${CID}` && m === 'PATCH') { log.name = log.bodies[key].name; log.version += 1; return json(route, { campaign: campaign('draft') }); }
    if (p === `/customer/campaigns/${CID}/archive`) { log.archived = true; log.version += 1; return json(route, { campaign: campaign('draft') }); }
    if (p === `/customer/campaigns/${CID}`) return json(route, { campaign: campaign('draft') });
    if (p === `/customer/campaigns/${CID}/calendar`) return json(route, { entries: [] });
    if (p === `/customer/campaigns/${CID}/variants/v1/generate`) return json(route, { campaign: campaign('review') });
    if (p === '/customer/billing/subscription') return json(route, subscription);
    if (p === '/billing/plans') return json(route, plans);
    if (p === '/billing/stripe/checkout') return json(route, { url: 'https://checkout.example.test/s', checkout_session_id: 'cs_test' });
    if (p === '/billing/subscription/cancel') return json(route, { status: 'requested', cancellation_effective_at: '2026-12-01T00:00:00Z' });
    if (p === '/customer/billing/invoices') return json(route, { invoices: [{ invoice_id: 'in1', number: 'TEST-0001', issued_at: '2026-10-01T00:00:00Z', amount_minor: 1111, currency: 'GBP', status: 'paid', hosted_invoice_url: 'https://example.test/invoice/1', receipt_url: null }] });
    if (p === '/customer/generation-quotes') return json(route, { quote_id: 'q1', execution_class: m === 'POST' ? (log.bodies[key].execution_class) : 'text.standard', credits: 4, kind: 'fixed', max_credits: 4, available_credits: 40, sufficient: true, expires_at: soon(), policy_version: 'fx' }, 201);
    if (p === '/customer/creative-capabilities') return json(route, caps);
    if (p === '/customer/assets') return json(route, { assets: [] });
    if (p === `/customer/campaigns/${CID}/variants/v1/creative-jobs`) return json(route, { job_id: 'job1', status: 'queued' }, 202);
    if (p === '/customer/creative-jobs/job1') return json(route, { job_id: 'job1', kind: 'image', status: log.jobStatus, credits_charged: 4, outputs: [{ output_id: 'o1', kind: 'image', url: 'https://cdn.example.test/a.png', width: 8, height: 8, provenance: { origin: 'ai_generated' } }] });
    if (p === '/customer/creative-jobs/job1/approval') { log.jobStatus = 'approved'; return json(route, { job_id: 'job1', status: 'approved' }); }
    return json(route, { status: 'failed', error: { code: 'NOT_FOUND' } }, 404);
  });
  await page.route('https://cdn.example.test/**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') }));
  return log;
}
async function checks(page, label) {
  if (process.env.DEBUG_OVERFLOW) console.log(label, JSON.stringify(await page.evaluate(() => { const vw = document.documentElement.clientWidth; return [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > vw + 1 && !e.closest('.ps-plans-scroll')).slice(0, 8).map((e) => `${e.tagName}.${e.className}:${Math.round(e.getBoundingClientRect().right)}`); })));
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${label}: horizontal overflow`).toBe(false);
  if (AXE) { await page.addScriptTag({ content: AXE }); const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`)); expect(v, `${label}: axe`).toEqual([]); }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-gates-${label}.png`, fullPage: true }); }
}
const nav = (page) => page.getByRole('navigation', { name: /workspace sections/i });
const welcome = (page) => page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' }).waitFor();

test('plans: the owner sees server prices, VAT, terms and support, and a chosen plan starts Stripe-hosted checkout with that plan code', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plans and prices' })).toBeVisible();
  await expect(page.getByText('£11.11')).toBeVisible(); await expect(page.getByText('£22.22')).toBeVisible();
  await expect(page.getByText('TEST VAT STATEMENT')).toBeVisible(); await expect(page.getByText('TEST REFUND B')).toBeVisible();
  await expect(page.getByRole('link', { name: 'help@example.test' }).first()).toBeVisible();
  await expect(page.getByText(/7-day trial/)).toBeVisible();
  await expect(page.getByRole('button', { name: /continue to secure checkout/i })).toHaveCount(0);
  await checks(page, 'plans-owner');
  await page.getByRole('button', { name: 'Choose Beta' }).click();
  await expect(page).toHaveURL(/checkout\.example\.test/);
  expect(log.bodies['POST /billing/stripe/checkout']).toMatchObject({ plan_code: 'beta', tenant_id: 't1' });
  expect(log.errors).toEqual([]);
});

test('plans: a member sees the same prices but cannot choose or manage', async ({ page }) => {
  await open(page, { role: 'member' });
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await expect(page.getByText('£11.11')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Alpha' })).toBeDisabled();
  await expect(page.getByText(/only the workspace owner can change the plan/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel subscription' })).toHaveCount(0);
  await checks(page, 'plans-member');
});

test('manage: cancelling is only ever "requested", with the terms shown first and invoices listed from Stripe status', async ({ page }) => {
  const log = await open(page, { subscription: { status: 'ready', subscription: { plan_code: 'alpha', entitlement_status: 'active', included_monthly_credit_grant: 11, reference_period_start: '2026-10-01T00:00:00.000Z', reference_period_end: '2026-11-01T00:00:00.000Z' }, available_credits: 9 } });
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  await expect(page.getByText('TEST CANCELLATION A').first()).toBeVisible();
  await checks(page, 'manage-cancel');
  await page.getByRole('button', { name: 'Request cancellation' }).click();
  await expect(page.getByText(/cancellation request was received/i)).toBeVisible();
  await expect(page.getByText(/1 December 2026/)).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/has been cancelled|is cancelled/i);
  expect(log.bodies['POST /billing/subscription/cancel']).toMatchObject({ tenant_id: 't1' });
  expect(typeof log.bodies['POST /billing/subscription/cancel'].request_id).toBe('string');
  await page.getByRole('button', { name: 'Show invoices' }).click();
  await expect(page.getByText('TEST-0001')).toBeVisible(); await expect(page.getByText(/status reported by Stripe: paid/)).toBeVisible();
  await checks(page, 'manage-invoices');
});

async function toStudio(page) {
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
}

test('credit cost: the quote is shown and confirmed before generation, and generation carries the quote', async ({ page }) => {
  const log = await open(page);
  await toStudio(page);
  await page.getByRole('button', { name: 'Check the credit cost' }).first().click();
  await expect(page.getByRole('group', { name: 'Credit cost' })).toContainText('4 credits');
  expect(log.calls.some((c) => c.endsWith('/generate'))).toBe(false);
  await checks(page, 'quote');
  await page.getByRole('button', { name: /Use 4 credits and generate/ }).click();
  await expect(page.getByText(/review/i).first()).toBeVisible();
  await expect.poll(() => log.bodies[`POST /customer/campaigns/${CID}/variants/v1/generate`]).toMatchObject({ quote_id: 'q1', max_credits: 4 });
});

test('creative: options come from the server, cost is confirmed first, result carries its origin, approval is a second step and is not publication', async ({ page }) => {
  const log = await open(page);
  await toStudio(page);
  await page.getByText('Create an image or video for this post').click();
  await page.getByLabel('Image', { exact: true }).check();
  await page.getByLabel('Where will it be used?').selectOption('instagram');
  await page.getByLabel('Shape').selectOption('1:1');
  await page.getByLabel('Brief', { exact: true }).fill('A calm product shot');
  await checks(page, 'creative-form');
  await page.locator('.ps-creative').getByRole('button', { name: 'Check the credit cost' }).click();
  await expect(page.locator('.ps-creative').getByRole('group', { name: 'Credit cost' })).toBeVisible();
  expect(log.calls.some((c) => c.endsWith('/creative-jobs') && c.startsWith('POST'))).toBe(false);
  await page.locator('.ps-creative').getByRole('button', { name: /Use 4 credits and generate/ }).click();
  await expect(page.getByText('Made by AI')).toBeVisible();
  expect(log.bodies[`POST /customer/campaigns/${CID}/variants/v1/creative-jobs`]).toMatchObject({ kind: 'image', platform: 'instagram', aspect_ratio: '1:1', quote_id: 'q1', supplied_asset_ids: [] });
  await expect(page.getByRole('img', { name: /created for this post/ })).toBeVisible();
  await checks(page, 'creative-ready');
  await page.getByRole('button', { name: 'Approve', exact: true }).click();
  expect(log.calls.some((c) => c.endsWith('/approval'))).toBe(false);
  await page.getByRole('button', { name: 'Yes, approve' }).click();
  await expect(page.getByText(/Approved\. It has not been published/)).toBeVisible();
  await page.reload(); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await page.getByText('Create an image or video for this post').click();
  await expect(page.getByText('Approved by you. It has not been published.')).toBeVisible(); // the job is found again after a reload
  expect(log.errors).toEqual([]);
});

test('campaign management: rename, then archive with a reason; the archived campaign moves to the archived list and nothing is deleted', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaigns', exact: true }).click();
  await page.getByRole('button', { name: 'Rename Northgate spring leasing' }).click();
  await page.getByLabel(/campaign name/i).fill('Northgate autumn leasing');
  await checks(page, 'campaigns-rename');
  await page.getByRole('button', { name: 'Save name' }).click();
  await expect(page.getByText('Northgate autumn leasing').first()).toBeVisible();
  expect(log.bodies[`PATCH /customer/campaigns/${CID}`]).toMatchObject({ name: 'Northgate autumn leasing', expected_campaign_version: 3 });
  await page.getByRole('button', { name: 'Archive Northgate autumn leasing' }).click();
  await expect(page.getByText(/not deleted|nothing is deleted/i).first()).toBeVisible();
  await page.getByLabel(/why/i).fill('Replaced by the winter campaign');
  await checks(page, 'campaigns-archive');
  await page.getByRole('button', { name: 'Archive campaign' }).click();
  await page.getByRole('button', { name: /Show archived campaigns/ }).click();
  await expect(page.getByRole('list', { name: 'Archived campaigns' })).toContainText('Northgate autumn leasing');
  expect(log.bodies[`POST /customer/campaigns/${CID}/archive`]).toMatchObject({ reason: 'Replaced by the winter campaign' });
  expect(log.errors).toEqual([]);
});
