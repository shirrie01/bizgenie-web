// Real-browser QA of the capabilities with their build gates ON (plan catalogue, subscription management, credit preview, customer image/video,
// workspace calendar API). Built with VITE_PLAN_CATALOGUE_API, VITE_BILLING_MANAGEMENT_API, VITE_CREDIT_PREVIEW_API, VITE_CUSTOMER_MEDIA_API and
// VITE_WORKSPACE_CALENDAR_API set to "true" on port 4181. The API and Supabase are fully MOCKED, with mocks shaped like the backend DRAFT (bizgenie-api
// PR #216 f8d81bf); every price, credit, term and file below is a TEST VALUE. This is NOT a deployed or staging journey: it proves the screens and
// the request/response shapes, not the backend, whose routes are unmounted or undeployed.
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
const plan = (code, amount, credits) => ({ plan_code: code, plan_version: 1, amount_minor: amount, currency: 'GBP', billing_cadence: 'month', tax: { presentation: 'exclusive', jurisdiction: 'Testland', wording: 'TEST TAX STATEMENT' }, credit_grant_cadence: 'month', included_credits: credits, policy_id: `pol-${code}`, entitlement_codes: ['generation'], effective_from: '2026-01-01T00:00:00.000Z', effective_to: null, terms: { version: 'test-t1', url: `https://example.test/terms-${code}`, cancellation_url: `https://example.test/cancel-${code}`, refund_url: `https://example.test/refund-${code}` }, approval: { decision: 'DEC-TEST', source: 'https://example.test/decision', approved_at: '2026-01-02T00:00:00.000Z' } });
const plans = { contract_version: 'commercial-catalog.v1', plans: [plan('standard', 1111, 11), plan('pro', 2222, 22)] };
const soon = () => new Date(Date.now() + 10 * 60000).toISOString();

async function open(page, { role = 'owner', subscription = { status: 'not_subscribed', subscription: null, available_credits: null }, jobs = [] } = {}) {
  const log = { calls: [], bodies: {}, errors: [], calendarReqs: [], name: 'Northgate spring leasing', archived: false, version: 3 };
  page.on('pageerror', (e) => log.errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [sess]);
  await page.route(/fonts\./, (r) => r.abort());
  await page.route(/^https:\/\/(checkout\.example\.test|billing\.stripe\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe-hosted page (test)</title>' }));
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
    if (p === '/customer/billing/plans') return json(route, plans);
    if (p === '/billing/stripe/checkout') return json(route, { url: 'https://checkout.example.test/s', checkout_session_id: 'cs_test' });
    if (p === '/customer/billing/management/subscription/cancel' || p === '/customer/billing/management/portal-session' || p === '/customer/billing/management/subscription/change') return json(route, { status: 'confirmation_required', portal_url: 'https://billing.stripe.com/p/session/test_abc', entitlement_confirmed: false }, 201);
    if (p === '/customer/billing/credit-preview') { log.previewQuery = Object.fromEntries(u.searchParams); return json(route, { contract_version: 'execution-cost-preview.v1', tenant_id: u.searchParams.get('tenant_id'), project_id: u.searchParams.get('project_id'), brand_id: u.searchParams.get('brand_id'), execution_class: u.searchParams.get('execution_class'), credit_cost: 4, policy_id: 'pol', entitlement_id: 'ent', available_credits: 40, spend_cap: Number(u.searchParams.get('spend_cap')), affordability: 'within_limit', observed_at: new Date().toISOString(), expires_at: soon(), reserved: false, execution_authorized: false, confirmation_supported: false }); }
    if (p === '/customer/calendar') { log.calendarReqs.push(Object.fromEntries(u.searchParams)); const first = u.searchParams.get('from') === log.calendarReqs[0].from; return json(route, { contract_version: 'workspace-calendar.v1', window: { from: u.searchParams.get('from'), to: u.searchParams.get('to') }, display_timezone: 'UTC', entries: first ? [{ campaign_id: CID, campaign_name: log.name, content_item_id: 'i1', content_item_name: 'Lease offer post', format: 'text', variant_id: 'v1', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow: 'scheduled', occurrence_at: new Date(Date.now() + 2 * 86400000).toISOString(), occurrence_kind: 'scheduled', schedule_id: 'sch1', publication_id: null }] : [], unscheduled: first ? [{ campaign_id: CID, campaign_name: log.name, content_item_id: 'i2', content_item_name: 'Undated post', format: 'text', variant_id: 'v2', platform: 'email', placement: 'feed', destination_label: 'Email', workflow: 'draft', occurrence_at: null, occurrence_kind: 'unscheduled', schedule_id: null, publication_id: null }] : [], next_cursor: null }); }
    if (p === '/customer/social-accounts') return json(route, { contract_version: 'social-accounts.v1', accounts: [{ account_id: 'a1', provider: 'instagram', display_name: 'Test Account', status: 'connected', scopes_granted: ['publish'], connected_at: '2026-10-01T00:00:00Z', token_expires_at: '2026-12-01T00:00:00Z', last_verified_at: null }] });
    if (p === '/customer/publishing-queue') return json(route, { contract_version: 'publishing-queue.v1', items: [{ publication_id: 'pub1', campaign_id: CID, variant_id: 'v1', account_id: 'a1', scheduled_for: '2026-11-01T10:00:00Z', status: 'failed', attempts: 2, last_error_code: 'TOKEN_EXPIRED', platform_post_url: null, verified_by: null }], next_cursor: null });
    if (p === `/customer/campaigns/${CID}/results`) return json(route, { contract_version: 'campaign-results.v1', metrics: [{ metric: 'clicks', value: 12, unit: 'count', observed_at: '2026-10-20T00:00:00Z', source: 'customer_entered', method: null, fresh_as_of: '2026-10-21T00:00:00Z' }] });
    if (p === '/customer/learning/insights') return json(route, { contract_version: 'learning-insights.v1', insights: [{ insight_id: 'i1', statement: 'TEST suggestion: shorter posts got more clicks.', confidence: 'low', status: 'proposed', generated_by: 'ai', created_at: '2026-10-22T00:00:00Z', evidence: [{ source: 'customer_entered', metric: 'clicks', period_from: '2026-10-01T00:00:00Z', period_to: '2026-10-20T00:00:00Z', sample_size: 3 }] }] });
    if (p === '/customer/generate-image') return json(route, { status: 'completed', execution_id: log.bodies[key].execution_id, generation_id: log.bodies[key].generation_id, media: { provider: 'mock', provider_job_id: 'j1', asset: { location: 'gs://private-bucket/a.png', mime_type: 'image/png' }, aspect_ratio: '1:1', approval_status: 'pending', created_at: '2026-10-26T10:00:00Z', completed_at: '2026-10-26T10:00:05Z' } });
    return json(route, { status: 'failed', error: { code: 'NOT_FOUND' } }, 404);
  });
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

test('plans: the owner sees server prices, tax wording and term links (and "not published" for what the contract lacks); a chosen plan starts Stripe-hosted checkout with that plan code', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Plans and prices' })).toBeVisible();
  await expect(page.getByText('£11.11')).toBeVisible(); await expect(page.getByText('£22.22')).toBeVisible();
  await expect(page.getByText(/TEST TAX STATEMENT/).first()).toBeVisible();
  await expect(page.getByRole('link', { name: 'Refunds' }).first()).toHaveAttribute('href', 'https://example.test/refund-standard');
  await expect(page.getByText('Not published yet').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /continue to secure checkout/i })).toHaveCount(0);
  expect(log.calls).toContain('GET /customer/billing/plans');
  await checks(page, 'plans-owner');
  await page.getByRole('button', { name: 'Choose Pro' }).click();
  await expect(page).toHaveURL(/checkout\.example\.test/);
  expect(log.bodies['POST /billing/stripe/checkout']).toMatchObject({ plan_code: 'pro', tenant_id: 't1' });
  expect(log.errors).toEqual([]);
});

test('plans: a member sees the same prices but cannot choose or manage', async ({ page }) => {
  await open(page, { role: 'member' });
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await expect(page.getByText('£11.11')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose Standard' })).toBeDisabled();
  await expect(page.getByText(/only the workspace owner can change the plan/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cancel subscription' })).toHaveCount(0);
  await checks(page, 'plans-member');
});

test('manage: cancelling goes to a Stripe-hosted page, with the rules shown first, a strict request body, and nothing reported as cancelled', async ({ page }) => {
  const log = await open(page, { subscription: { status: 'ready', subscription: { plan_code: 'standard', entitlement_status: 'active', included_monthly_credit_grant: 11, reference_period_start: '2026-10-01T00:00:00.000Z', reference_period_end: '2026-11-01T00:00:00.000Z' }, available_credits: 9 } });
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel subscription' }).click();
  await expect(page.getByRole('link', { name: 'cancellation rules' })).toHaveAttribute('href', 'https://example.test/cancel-standard');
  await checks(page, 'manage-cancel');
  await page.getByRole('button', { name: 'Continue to Stripe' }).click();
  await expect(page).toHaveURL(/billing\.stripe\.com/);
  const body = log.bodies['POST /customer/billing/management/subscription/cancel'];
  expect(Object.keys(body)).toEqual(['request_id']); // the draft backend's body is strict: no tenant, price or redirect
  expect(log.errors).toEqual([]);
});

test('manage: payment details and invoices open the Stripe portal; there is no invoice list of our own', async ({ page }) => {
  await open(page, { subscription: { status: 'ready', subscription: { plan_code: 'standard', entitlement_status: 'active' }, available_credits: 9 } });
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  await expect(page.getByRole('button', { name: /show invoices/i })).toHaveCount(0);
  await page.getByRole('button', { name: 'Payment details, invoices and receipts' }).click();
  await expect(page).toHaveURL(/billing\.stripe\.com/);
});

async function toStudio(page) {
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
}

test('credit cost: a read-only price preview is shown as the current price (not a quote); generation carries no quote fields', async ({ page }) => {
  const log = await open(page);
  await toStudio(page);
  await page.getByRole('button', { name: 'Check the credit cost' }).first().click();
  const card = page.getByRole('group', { name: 'Credit cost' });
  await expect(card).toContainText('Right now this uses 4 credits'); await expect(card).toContainText('not a locked quote'); await expect(card).toContainText('No credits are reserved');
  expect(log.previewQuery).toMatchObject({ tenant_id: 't1', project_id: 'p1', brand_id: 'b1', execution_class: 'text.standard' });
  expect(log.calls.some((c) => c.endsWith('/generate'))).toBe(false);
  await checks(page, 'preview');
  await page.getByRole('button', { name: 'Generate now' }).click();
  await expect(page.getByText(/review/i).first()).toBeVisible();
  await expect.poll(() => log.bodies[`POST /customer/campaigns/${CID}/variants/v1/generate`]).toBeTruthy();
  expect(Object.keys(log.bodies[`POST /customer/campaigns/${CID}/variants/v1/generate`])).not.toContain('quote_id'); // the backend body is strict
});

test('creative: image brief, cost check first, one request with stable ids; the result is never displayed or approved without private delivery', async ({ page }) => {
  const log = await open(page);
  await toStudio(page);
  await page.getByText('Create an image or video for this post').click();
  await expect(page.getByText(/own photos or videos combined with AI/)).toBeVisible();
  await page.getByLabel('Image', { exact: true }).check();
  await page.getByLabel('Shape').selectOption('1:1');
  await page.getByLabel('Brief', { exact: true }).fill('A calm product shot');
  await checks(page, 'creative-form');
  await page.locator('.ps-creative').getByRole('button', { name: 'Check the credit cost' }).click();
  await expect(page.locator('.ps-creative').getByRole('group', { name: 'Credit cost' })).toBeVisible();
  expect(log.previewQuery.execution_class).toBe('image.normal');
  expect(log.calls.some((c) => c === 'POST /customer/generate-image')).toBe(false);
  await page.locator('.ps-creative').getByRole('button', { name: 'Generate now' }).click();
  await expect(page.getByText('Image created')).toBeVisible();
  const sent = log.bodies['POST /customer/generate-image'];
  expect(sent).toMatchObject({ tenant_id: 't1', project_id: 'p1', brand_id: 'b1', campaign_id: CID, topic: 'Lease offer post', aspect_ratio: '1:1', image_purpose: 'A calm product shot' });
  expect(sent.execution_id).toMatch(/^exec_/); expect(sent.generation_id).toMatch(/^gen_/); expect(sent).not.toHaveProperty('user_id');
  await expect(page.getByText(/stored privately/)).toBeVisible();
  await expect(page.locator('.ps-creative img')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('gs://');
  await expect(page.getByRole('button', { name: /^approve/i })).toHaveCount(0);
  await checks(page, 'creative-created');
  await page.reload(); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await page.getByText('Create an image or video for this post').click();
  await expect(page.getByText('Image created')).toBeVisible(); // the finished record is remembered per workspace and item, so a reload shows the same honest state
  expect(log.errors).toEqual([]);
});

test('calendar: the workspace endpoint is followed in requests of at most 93 days with limit 100; undated items are shown', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByText('Lease offer post').first()).toBeVisible();
  await expect(page.getByText('Undated post').first()).toBeVisible();
  expect(log.calendarReqs.length).toBeGreaterThanOrEqual(1);
  for (const q of log.calendarReqs) { expect(Number(q.limit)).toBeLessThanOrEqual(100); expect(Date.parse(q.to) - Date.parse(q.from)).toBeLessThanOrEqual(93 * 86400000); expect(q.tenant_id).toBe('t1'); }
  expect(log.calls.some((c) => /\/customer\/campaigns\/[^/]+\/calendar$/.test(c.split(' ')[1]))).toBe(false); // the old per-campaign fan-out is not used
  await checks(page, 'calendar-api');
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

test('accounts and publishing: only what the server reports; a failed publication states its reason; no verified claim without the platform', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Accounts and publishing', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Connected accounts' })).toContainText('Connected');
  await expect(page.getByRole('list', { name: 'Publishing queue' })).toContainText('Reason code TOKEN_EXPIRED. 2 attempts made.');
  await expect(page.getByRole('button', { name: 'Connect LinkedIn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Instagram' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Confirmed by the platform');
  await checks(page, 'accounts');
  expect(log.errors).toEqual([]);
});

test('results and insights: every number carries its origin; a suggestion is labelled AI, shows evidence, and changes nothing by itself', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Results and insights', exact: true }).click();
  await expect(page.getByRole('table')).toContainText('Entered by you');
  await expect(page.getByText('TEST suggestion: shorter posts got more clicks.')).toBeVisible();
  await expect(page.getByText('AI suggestion').first()).toBeVisible();
  await page.getByText(/Evidence \(1\)/).click();
  await expect(page.getByText(/Clicks, entered by you/)).toBeVisible();
  await checks(page, 'insights');
  expect(log.errors).toEqual([]);
});
