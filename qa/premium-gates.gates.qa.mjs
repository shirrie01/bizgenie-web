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
const VID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const QID = '44444444-4444-4444-8444-444444444444';
const SCHED_AT = new Date(Date.now() + 2 * 86400000).toISOString();
const mkWs = (role) => ({ tenant_id: 't1', tenant_name: 'Northgate Group', project_id: 'p1', project_name: 'Northgate campaigns', brand_id: 'b1', brand_name: 'Northgate Vehicle Leasing', brand_status: 'approved', membership_role: role });
const sess = JSON.stringify({ access_token: 'tok-b1', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 't1', project_id: 'p1', brand_id: 'b1' } } });
const onboarding = { contract_version: 'workspace-onboarding.v1', tenant_id: 't1', project_id: 'p1', brand_id: 'b1', version: 3, status: 'completed', sector: { key: 'leasing', source: 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z', updated_at: '2026-10-24T10:00:00.000Z' };
const plan = (code, amount, credits) => ({ plan_code: code, plan_version: 1, amount_minor: amount, currency: 'GBP', billing_cadence: 'month', tax: { presentation: 'exclusive', jurisdiction: 'Testland', wording: 'TEST TAX STATEMENT' }, credit_grant_cadence: 'month', included_credits: credits, policy_id: `pol-${code}`, entitlement_codes: ['generation'], effective_from: '2026-01-01T00:00:00.000Z', effective_to: null, terms: { version: 'test-t1', url: `https://example.test/terms-${code}`, cancellation_url: `https://example.test/cancel-${code}`, refund_url: `https://example.test/refund-${code}` }, approval: { decision: 'DEC-TEST', source: 'https://example.test/decision', approved_at: '2026-01-02T00:00:00.000Z' } });
const plans = { contract_version: 'commercial-catalog.v1', plans: [plan('standard', 1111, 11), plan('pro', 2222, 22)] };
const soon = () => new Date(Date.now() + 10 * 60000).toISOString();

async function open(page, { role = 'owner', subscription = { status: 'not_subscribed', subscription: null, available_credits: null }, jobs = [] } = {}) {
  const log = { calls: [], bodies: {}, errors: [], calendarReqs: [], extraItems: [], quoteState: null, name: 'Northgate spring leasing', archived: false, version: 3 };
  page.on('pageerror', (e) => log.errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [sess]);
  await page.route(/fonts\./, (r) => r.abort());
  await page.route(/^https:\/\/(checkout\.example\.test|billing\.stripe\.com)\//, (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<title>Stripe-hosted page (test)</title>' }));
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  await page.route('http://supabase.test/**', (route) => json(route, JSON.parse(sess)));
  const campaign = (workflow) => ({ campaign_id: CID, tenant_id: 't1', project_id: 'p1', brand_id: 'b1', name: log.name, goal: 'More enquiries', display_timezone: 'Europe/London', version: log.version, archived_at: log.archived ? '2026-10-26T09:00:00.000Z' : null, items: [{ content_item_id: 'i1', name: 'Lease offer post', format: 'text', variants: [{ variant_id: 'v1', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow, current_revision_id: 'rev-1', current_content: { title: 'Lease offer', body: 'Body copy' } }] }, ...log.extraItems], schedules: [] });
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
    if (p === '/customer/social/calendar') { log.socialCal = Object.fromEntries(u.searchParams); return json(route, { contract_version: 'publishing-calendar.v1', entries: [{ dispatch_id: 'dd111111-1111-4111-8111-111111111111', campaign_id: CID, variant_id: 'v1', revision_id: 'r1', state: 'queued', scheduled_for: SCHED_AT, publication_id: null, publication_url: null, published_at: null, evidence_kind: null, delivery_state: 'queued' }], next_cursor: null }); }
    if (p === '/customer/calendar') { log.calendarReqs.push(Object.fromEntries(u.searchParams)); const first = u.searchParams.get('from') === log.calendarReqs[0].from; return json(route, { contract_version: 'workspace-calendar.v1', window: { from: u.searchParams.get('from'), to: u.searchParams.get('to') }, display_timezone: 'UTC', entries: first ? [{ campaign_id: CID, campaign_name: log.name, content_item_id: 'i1', content_item_name: 'Lease offer post', format: 'text', variant_id: 'v1', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow: 'scheduled', occurrence_at: SCHED_AT, occurrence_kind: 'scheduled', schedule_id: 'sch1', publication_id: null }] : [], unscheduled: first ? [{ campaign_id: CID, campaign_name: log.name, content_item_id: 'i2', content_item_name: 'Undated post', format: 'text', variant_id: 'v2', platform: 'email', placement: 'feed', destination_label: 'Email', workflow: 'draft', occurrence_at: null, occurrence_kind: 'unscheduled', schedule_id: null, publication_id: null }] : [], next_cursor: null }); }
    if (p === '/customer/social/connections') return json(route, { connections: [{ connection_id: 'c1', platform: 'instagram', account_id: 'acct_one', display_name: 'Northgate Leasing', status: 'active', expires_at: '2026-12-01T00:00:00Z', version: 1 }], next_cursor: null });
    if (p === '/customer/social/dispatches') return json(route, { dispatches: [{ dispatch_id: 'd1', campaign_id: CID, variant_id: 'v1', revision_id: 'r1', state: 'failed', scheduled_for: '2026-11-01T10:00:00Z', publication_id: null, publication_url: null, published_at: null, evidence_kind: null }], next_cursor: null });
    if (p === `/customer/campaigns/${CID}/content-items` && m === 'POST') { const b = log.bodies[key]; log.version += 1; log.extraItems.push({ content_item_id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', name: b.name, format: b.format, variants: [{ variant_id: VID, platform: b.platform, placement: b.placement, destination_label: b.destination_label, workflow: 'draft', current_revision_id: 'rev-img', current_content: { title: null, body: '', caption: null, alt_text: null, asset_refs: [] } }] }); return json(route, { result: { campaign_id: CID, campaign_version: log.version }, campaign: campaign('draft') }, 201); }
    if (p === '/customer/generation-quotes' && m === 'POST') { const b = log.bodies[key]; log.quoteRequests = (log.quoteRequests || 0) + 1; log.quoteState = { state: 'quoted' }; return json(route, { contract_version: 'generation-quote.v1', quote_id: QID, execution_class: b.execution_class, credits: 3, kind: 'fixed', max_credits: 3, available_credits: 40, sufficient: true, expires_at: new Date(Date.now() + 120000).toISOString(), policy_version: 'pol:1', state: 'quoted' }, 201); }
    if (p === `/customer/generation-quotes/${QID}/confirm`) { log.quoteState = { state: 'confirmed', polls: 0 }; return json(route, { status: 'queued', job_id: 'quoted:job1', quote_id: QID, reserved_credits: 3, replay: false }, 202); }
    if (p === `/customer/generation-quotes/${QID}` && m === 'GET') { const st = log.quoteState || { state: 'quoted' }; st.polls = (st.polls || 0) + 1; const seq = ['queued', 'claimed', 'calling', 'succeeded']; const state = st.state === 'confirmed' ? seq[Math.min(st.polls - 1, seq.length - 1)] : st.state; return json(route, { quote_id: QID, job_id: 'quoted:job1', state, execution_class: 'image.normal', reserved_credits: state === 'succeeded' ? 0 : 3, reservation_state: state === 'succeeded' ? 'settled' : 'held' }); }
    const jobId = 'quoted:job1', ASSET = '55555555-5555-4555-8555-555555555555', REV = '66666666-6666-4666-8666-666666666666';
    const jobBody = () => ({ contract_version: 'creative-job.v1', job_id: jobId, quote_id: QID, kind: 'image', execution_class: 'image.normal', state: 'succeeded', content_dna: null, error_code: null, created_at: '2026-10-27T10:00:00Z', campaign_id: CID, variant_id: VID, outputs: [{ asset_id: ASSET, mime_type: 'image/png', media_kind: 'image', provenance: { origin: 'ai_generated', supplied_asset_ids: [] } }], association: log.attached ? { campaign_id: CID, variant_id: VID, revision_id: REV, campaign_version: 5, current: true, current_campaign_version: 5, approval_status: 'not_approved' } : null, preview: null, can_cancel: false, retry_guidance: null });
    if (p === '/customer/creative-jobs') return json(route, { contract_version: 'creative-job-list.v1', jobs: log.quoteState ? [{ job_id: jobId, quote_id: QID, campaign_id: CID, variant_id: VID, execution_class: 'image.normal', state: 'succeeded', content_dna: null, error_code: null, created_at: '2026-10-27T10:00:00Z' }] : [], next_cursor: null });
    if (p === '/customer/creative-jobs/' + encodeURIComponent(jobId) && m === 'GET') return json(route, jobBody());
    if (p === '/customer/creative-jobs/' + encodeURIComponent(jobId) + '/attach') { log.attached = true; return json(route, jobBody()); }
    if (p === '/customer/assets') return json(route, { assets: [{ asset_id: ASSET, filename: 'shopfront.png', kind: 'image', content_type: 'image/png', bytes: 2048, state: 'ready', rights_confirmed: true, rights_evidence_kind: 'customer_attestation', rights_policy_version: 'rights.v1', created_at: '2026-10-27T10:00:00Z', physical_deletion: null }], next_cursor: null });
    if (p === '/customer/assets/' + ASSET + '/preview') return route.fulfill({ status: 200, contentType: 'image/png', headers: CORS, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
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

test('manage: payment details open the Stripe portal; the owner can also ask for the invoice list, which is Stripe-sourced and never shown unasked', async ({ page }) => {
  const log = await open(page, { subscription: { status: 'ready', subscription: { plan_code: 'standard', entitlement_status: 'active' }, available_credits: 9 } });
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Plan and billing', exact: true }).click();
  // The invoice list (billing-invoices.v1 draft) is an owner action behind a button: nothing is fetched or shown until it is pressed.
  await expect(page.getByRole('button', { name: /show invoices/i })).toBeVisible();
  expect(log.calls.some((c) => c.includes('/customer/billing/invoices'))).toBe(false);
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

test('creative: add an image item, get a binding price, confirm, follow the job to Finished (not approved, not shown) and resume after a reload', async ({ page }) => {
  const log = await open(page);
  await toStudio(page);
  await page.getByText('Add an image or video to this campaign').click();
  await page.getByLabel('Name', { exact: true }).fill('Spring image'); await page.getByLabel('Account or page').fill('Brand page');
  await checks(page, 'add-item');
  await page.getByRole('button', { name: 'Add to the campaign' }).click();
  await expect.poll(() => log.bodies[`POST /customer/campaigns/${CID}/content-items`]).toMatchObject({ name: 'Spring image', format: 'image', platform: 'instagram', placement: 'feed', destination_label: 'Brand page' });
  await expect(page.getByText('Create the image for this post')).toBeVisible();
  await page.getByText('Create the image for this post').click();
  await expect(page.getByText(/The shape is set by BizGenie/)).toBeVisible();
  await page.getByLabel('Brief', { exact: true }).fill('A calm product shot');
  await checks(page, 'creative-form');
  await page.getByRole('button', { name: /Get the price for the image/ }).click();
  const card = page.getByRole('group', { name: 'Price' });
  await expect(card).toContainText('3 credits'); await expect(card).toContainText('You have 40 credits available'); await expect(card).toContainText('fixed price and the most you can be charged');
  expect(log.calls).not.toContain('POST /customer/generation-quotes/' + QID + '/confirm'); // a price starts nothing
  expect(log.bodies['POST /customer/generation-quotes']).toMatchObject({ campaign_id: CID, variant_id: VID, execution_class: 'image.normal', execution_mode: 'ai', execution_brief: 'A calm product shot', supplied_assets: [] });
  expect(log.bodies['POST /customer/generation-quotes'].idempotency_key).toMatch(/^q:[0-9a-f]{48}:/);
  await checks(page, 'creative-price');
  await page.getByRole('button', { name: /Confirm and set aside 3 credits/ }).click();
  await expect.poll(() => log.bodies[`POST /customer/generation-quotes/${QID}/confirm`]).toMatchObject({ max_credits: 3, confirmed: true });
  await expect(page.getByText(/Finished\. 3 credits used/)).toBeVisible({ timeout: 20000 });
  await expect(page.getByText(/Finished is not approved and not published/).first()).toBeVisible();
  const result = page.getByLabel('Image result').first();
  await expect(result).toContainText(/stored privately/);
  await expect(page.locator('.ps-creative img, .ps-creative video')).toHaveCount(0);
  await page.getByRole('button', { name: 'Attach to this post' }).click();
  await expect(page.getByText(/Attached to the post/)).toBeVisible();
  expect(log.bodies['POST /customer/creative-jobs/' + encodeURIComponent('quoted:job1') + '/attach']).toEqual({ tenant_id: 't1', project_id: 'p1', brand_id: 'b1' });
  await expect(page.getByText(/Not approved yet/)).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/gs:\/\/|s3:\/\//);
  await checks(page, 'creative-finished');
  const quotesBefore = log.quoteRequests;
  await page.reload(); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await page.getByText('Create the image for this post').click();
  await expect(page.getByText(/Finished\. 3 credits used/)).toBeVisible(); // the same job is read back from the server
  expect(log.quoteRequests).toBe(quotesBefore); // a reload never asks for a new price
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
  await expect(page.getByText('Queued to send at the planned time.').first()).toBeVisible(); // delivery overlay from /customer/social/calendar joined onto the scheduled item
  expect(log.socialCal).toMatchObject({ tenant_id: 't1', project_id: 'p1', brand_id: 'b1' }); expect(Date.parse(log.socialCal.to) - Date.parse(log.socialCal.from)).toBeLessThanOrEqual(93 * 86400000);
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

test('your media: the owner sees server-reported files, ready ones preview through the authenticated route, and rights are the customer\'s own words', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Your media', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Your files' })).toContainText('Ready to use');
  await expect(page.getByAltText('Your file shopfront.png')).toBeVisible();
  await expect(page.getByText(/your own confirmation/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add file' })).toBeDisabled();
  await checks(page, 'media');
  expect(log.calls.filter((c) => c.startsWith('GET /customer/assets/') && c.endsWith('/preview'))).toHaveLength(1);
  expect(log.errors).toEqual([]);
});

test('accounts and publishing: only what the server reports; a failed publication states its reason; no verified claim without the platform', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Accounts and publishing', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Connected accounts' })).toContainText('Connected');
  await expect(page.getByRole('list', { name: 'Publishing list' })).toContainText('The platform refused it. Nothing was published.');
  await expect(page.getByRole('button', { name: 'Connect LinkedIn' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Instagram' })).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Confirmed by the platform');
  await checks(page, 'accounts');
  expect(log.errors).toEqual([]);
});

test('results and insights: with the gate on but no backend route, nothing is invented and entered results are not presented as measured', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Results and insights', exact: true }).click();
  await expect(page.getByText(/Platform results are not connected yet/)).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(page.locator('main')).not.toContainText('Measured by the platform</');
  await checks(page, 'insights');
  expect(log.errors).toEqual([]);
});

test('growth centre: one operating view with objective, performance, pipeline, experiments and actions; no invented figures', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Growth centre', exact: true }).click();
  for (const h of [/1\. Your objective/, /2\. Current performance/, /3\. Content pipeline/, /4\. Experiments/, /5\. Recommended next actions/]) await expect(page.getByRole('heading', { name: h })).toBeVisible();
  await expect(page.getByText(/BizGenie shows no performance figures it has not received|No platform results are available yet/).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Northgate spring leasing' })).toBeVisible();
  await checks(page, 'growth-overview');
  expect(log.errors).toEqual([]);
});

test('growth centre: strategy reads the goal, an experiment is planned (device only), product details need the owner to approve, and reference ideas drop brand names', async ({ page }) => {
  const log = await open(page);
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Growth centre', exact: true }).click();
  const tabs = page.getByRole('group', { name: 'Growth sections' });
  await tabs.getByRole('button', { name: 'Strategy', exact: true }).click();
  await page.getByLabel('Objective').selectOption('leads');
  await expect(page.getByText('BizGenie does not forecast results.')).toBeVisible();
  await checks(page, 'growth-strategy');
  await tabs.getByRole('button', { name: 'Experiments', exact: true }).click();
  await page.getByLabel(/What do you expect/).fill('A question hook will get more clicks than a statement');
  await page.getByLabel(/Variant A/).fill('Tired of slow quotes?'); await page.getByLabel(/Variant B/).fill('Quotes in a day.');
  await page.getByRole('button', { name: 'Add experiment' }).click();
  await expect(page.getByText('Experiment planned').first()).toBeVisible();
  await expect(page.getByText(/Saved on this device only/).first()).toBeVisible();
  await checks(page, 'growth-experiments');
  await tabs.getByRole('button', { name: 'Product details', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Read my website' })).toBeDisabled();
  await page.getByLabel('What you sell and what you are offering').fill('Free fitting'); await page.getByLabel('Website address').click();
  await page.getByRole('button', { name: 'Approve' }).click(); await expect(page.getByText('Approved by you')).toBeVisible();
  await checks(page, 'growth-product');
  await tabs.getByRole('button', { name: 'Creative ideas', exact: true }).click();
  await page.getByLabel('Describe the style or idea').fill('A quick question then a demonstration, in the style of Acme Fizz');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: 'Create original directions' }).click();
  await expect(page.getByText(/BizGenie has not seen the ad itself/)).toBeVisible();
  await expect(page.getByLabel(/Brief for Direction A/)).not.toHaveValue(/Acme Fizz/);
  await checks(page, 'growth-ideas');
  // none of this touched the backend: it is all device-only
  expect(log.calls.filter((c) => /experiment|product-context|reference/i.test(c))).toEqual([]);
  expect(log.errors).toEqual([]);
});

test('growth centre: a member can read but cannot plan, approve or generate ideas', async ({ page }) => {
  const log = await open(page, { role: 'member' });
  await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Growth centre', exact: true }).click();
  const tabs = page.getByRole('group', { name: 'Growth sections' });
  await tabs.getByRole('button', { name: 'Experiments', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Add experiment' })).toHaveCount(0);
  await tabs.getByRole('button', { name: 'Product details', exact: true }).click();
  await expect(page.getByLabel('Website address')).toBeDisabled();
  await tabs.getByRole('button', { name: 'Creative ideas', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create original directions' })).toBeDisabled();
  await checks(page, 'growth-member');
  expect(log.errors).toEqual([]);
});
