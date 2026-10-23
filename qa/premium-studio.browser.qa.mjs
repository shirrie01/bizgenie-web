// Real-browser QA of the flag-ON production build. The API and the Supabase session are fully mocked in the
// browser (no network, no credentials): this is NOT a deployed or staging journey. Build with
// VITE_PREMIUM_STUDIO_ENABLED=true and placeholder VITE_* values (see the workflow).
import { test, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
let AXE = null;
try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* axe-core is optional locally; CI installs it */ }
const EVIDENCE = process.env.EVIDENCE_DIR || '';
const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const CID = '22222222-2222-4222-8222-222222222222';

const token = (scoped) => JSON.stringify({ access_token: 'fake-local-test-token', refresh_token: 'x', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: scoped ? { tenant_id: 't', project_id: 'p', brand_id: 'b' } : {} } });
const brain = (name, description) => ({ brand_id: 'b', project_id: 'p', name, ...(description ? { identity: { description } } : {}), metadata: { version: 1, status: 'draft' } });
const rec = { recommendation_id: '11111111-1111-4111-8111-111111111111', tenant_id: 't', project_id: 'p', brand_id: 'b', campaign_name: 'Lease Enquiry Campaign', summary: 'Start with one clear offer.', explanation: 'First safe campaign shape.',
  create_campaign_payload: { tenant_id: 't', project_id: 'p', brand_id: 'b', name: 'Lease Enquiry Campaign', goal: 'g', display_timezone: 'Europe/London' },
  suggested_items: [{ name: 'Offer announcement', format: 'text', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', reason: 'r' }] };
const camp = (version, items, workflow = 'draft') => ({ campaign_id: CID, tenant_id: 't', project_id: 'p', brand_id: 'b', name: 'Lease Enquiry Campaign', version, items: items ? [{ content_item_id: 'c1', name: 'Offer announcement', format: 'text', variants: [{ variant_id: 'v1', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow, ...(workflow !== 'draft' ? { current_revision_id: 'rev-1', current_content: 'Server persisted review copy' } : {}) }] }] : [] });

async function setup(page, { scoped = true, signedOut = false, brainDoc = brain('Northgate Vehicle Leasing', 'We lease cars to small businesses.'), brainStatus = 200 } = {}) {
  const log = { calls: [], errors: [] };
  page.on('pageerror', (e) => log.errors.push(e.message));
  if (!signedOut) await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [token(scoped)]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  let items = 0;
  await page.route('http://api.test/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    log.calls.push(`${m} ${u.pathname}`);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) });
    if (m === 'OPTIONS') return json({});
    if (u.pathname.endsWith('/brand-brain') && m === 'GET') return brainStatus === 200 ? json({ status: 'ready', brand_brain: brainDoc }) : json({}, brainStatus);
    if (u.pathname.endsWith('/brand-brain') && m === 'PUT') { const b = JSON.parse(req.postData()); brainDoc = { ...b, brand_id: 'b', project_id: 'p', metadata: { version: 2, status: 'draft' } }; return json({ status: 'ready', brand_brain: brainDoc }); }
    if (u.pathname === '/customer/campaigns' && m === 'GET') return json({ campaigns: [] });
    if (u.pathname === '/customer/workspace') return json({ status: 'missing_workspace', workspace: null });
    if (u.pathname.endsWith('/workspace/bootstrap')) { brainDoc = brain(JSON.parse(req.postData()).business_name); await page.evaluate(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [token(true)]); return json({ status: 'ready', workspace: { tenant_id: 't' }, requires_session_refresh: false }, 201); }
    if (u.pathname.endsWith('/campaign-recommendations')) return json({ recommendation: rec });
    if (u.pathname.endsWith('/campaigns') && m === 'POST') { items = 0; return json({ result: { campaign_id: CID, campaign_version: 1 }, campaign: camp(1, 0) }); }
    if (u.pathname.endsWith('/content-items')) { items += 1; return json({ campaign: camp(2, 1) }); }
    if (u.pathname.endsWith('/generate')) return json({ campaign: camp(3, 1, 'review') });
    if (u.pathname.includes('/creative-preview')) return json({ preview: { contract_version: 'campaign-creative-preview.v1', campaign_id: CID, campaign_version: Number(u.searchParams.get('expected_campaign_version')), content_item_id: 'c1', variant_id: 'v1', revision_id: u.searchParams.get('revision_id'), revision_number: 1, platform: 'instagram', placement: 'feed', content_type: 'text', workflow: 'review', content_status: 'available', copy_status: 'available', copy: { title: null, body: 'Server persisted review copy', caption: null, alt_text: null }, media: [], provenance: { source: 'persisted_revision', revision_source: 'manual', created_at: '2026-10-22T09:00:00.000Z' }, approval_status: 'not_approved', platform_preview: { status: 'unrendered', artifact_url: null, reason: 'NO_PERSISTED_PLATFORM_ARTIFACT' }, acknowledgement_status: 'not_acknowledged', read_only: true } });
    if (u.pathname.endsWith('/preview-renders')) return json({ preview: { render_receipt_id: 'receipt-1', revision_id: 'rev-1' } }, 201);
    if (u.pathname.endsWith('/preview-acknowledgements')) return json({ campaign: camp(4, 1, 'review'), result: { created_ids: { preview_ids: ['preview-1'] } } });
    if (u.pathname.endsWith('/approval')) return json({ campaign: camp(5, 1, 'approved') });
    return json({}, 404);
  });
  return log;
}

async function scan(page, label) {
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const small = [...document.querySelectorAll('button, a[href], input, select, textarea')].filter((e) => e.offsetParent !== null).map((e) => ({ t: (e.textContent || e.id || e.tagName).trim().slice(0, 24), r: e.getBoundingClientRect() })).filter((x) => x.r.width < 24 || x.r.height < 24).map((x) => `${x.t} ${Math.round(x.r.width)}x${Math.round(x.r.height)}`);
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

test('workspace overview for a vehicle-leasing customer: real brand, no demonstration content, accessible, no overflow', async ({ page }) => {
  const log = await setup(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  await expect(page.getByText('Vehicle leasing', { exact: true }).first()).toBeVisible();
  const text = await page.locator('main').innerText();
  for (const t of [/fonzo/i, /maison/i, /clearskin/i, /\b\d+(\.\d)?[KkMm]\b/, /illustrative/i, /simulated/i]) expect(text).not.toMatch(t);
  await scan(page, 'workspace-leasing');
  expect(log.errors).toEqual([]);
});

for (const [slug, name, description, label] of [
  ['fragrance', 'Maison Aurelle', 'A fragrance house.', 'Fragrance & perfume'],
  ['aesthetics', 'Clearskin Studio', 'An aesthetics clinic in Leeds.', 'Aesthetics clinic'],
  ['soft-drinks', 'Fonzo', 'Soft drinks for everyone.', 'Soft drinks & beverages'],
  ['charity', 'WOW Charity', 'We support local families.', 'Charity & community'],
  ['unknown', 'Harbour Partners', 'Business consulting.', 'Not specified'],
]) {
  test(`workspace for ${name} follows its own sector`, async ({ page }) => {
    await setup(page, { brainDoc: brain(name, description) });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: `Welcome back, ${name}.` })).toBeVisible();
    await expect(page.locator('.ps-chip')).toHaveText(label);
    const text = (await page.locator('main').innerText()).split(name).join(' ').toLowerCase();
    expect(text.includes('lease') && slug !== 'unknown' ? slug === 'leasing' : false).toBe(false);
    if (name !== 'Fonzo') expect(text).not.toContain('fonzo');
    await scan(page, `workspace-${slug}`);
  });
}

test('onboarding for a new customer: create workspace, save to Brand Brain, recommendation, Campaign Studio review to approval', async ({ page }) => {
  const log = await setup(page, { scoped: false });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /let.s set up your workspace/i })).toBeVisible();
  await scan(page, 'onboarding-1-welcome');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('heading', { name: /tell us about your business/i })).toBeFocused();
  await page.getByRole('button', { name: /create my workspace/i }).click();
  await expect(page.getByText(/enter your business name/i)).toBeVisible();
  await page.getByLabel('Business name').fill('Northgate Vehicle Leasing');
  await scan(page, 'onboarding-2-business');
  await page.getByRole('button', { name: /create my workspace/i }).dblclick();
  await expect(page.getByRole('heading', { name: /what does your business do/i })).toBeFocused();
  expect(log.calls.filter((c) => c.endsWith('/workspace/bootstrap'))).toHaveLength(1);
  await page.getByLabel(/what kind of business/i).fill('vehicle leasing');
  await expect(page.getByText(/Inferred from what you typed/i).first()).toBeVisible();
  await page.getByLabel(/describe what the business does/i).fill('We lease cars to small businesses.');
  await scan(page, 'onboarding-3-about');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByLabel(/who are your customers/i).fill('Small business owners');
  await page.getByLabel(/what do you want a campaign to achieve/i).fill('Get more lease enquiries');
  await scan(page, 'onboarding-4-customers');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /^Instagram/ }).click();
  await expect(page.getByRole('button', { name: /^Instagram/ })).toHaveAttribute('aria-pressed', 'true');
  await scan(page, 'onboarding-5-channels');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('heading', { name: /your brand brain/i })).toBeVisible();
  await page.getByRole('button', { name: /save to brand brain/i }).click();
  await expect(page.getByText(/saved to your brand brain/i)).toBeVisible();
  await scan(page, 'onboarding-6-brain');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /get my recommendation/i }).click();
  await expect(page.getByRole('heading', { name: 'Lease Enquiry Campaign' })).toBeVisible();
  await scan(page, 'onboarding-7-recommendation');
  await page.getByRole('button', { name: /continue in campaign studio/i }).click();
  await page.getByRole('button', { name: /^create campaign$/i }).click();
  await expect(page.getByText(/saved to your workspace/i)).toBeVisible();
  await page.getByRole('button', { name: /generate draft/i }).first().click();
  await expect(page.getByText('Server persisted review copy').first()).toBeVisible();
  await page.getByRole('button', { name: /^render preview$/i }).click();
  await page.getByRole('button', { name: /^acknowledge preview$/i }).click();
  await page.getByRole('button', { name: /^approve$/i }).click();
  await expect(page.getByText('Approved', { exact: true })).toBeVisible();
  await expect(page.getByText(/manual publication required/i)).toBeVisible();
  await scan(page, 'studio-approved');
  // Nothing was published or scheduled, and sector/channel choices never reached the backend.
  expect(log.calls.some((c) => /\/(publish|schedule)/.test(c))).toBe(false);
  await page.getByRole('navigation', { name: /workspace sections/i }).getByRole('button', { name: 'Overview' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' })).toBeVisible();
  await expect(page.getByText('Instagram').first()).toBeVisible();
  await scan(page, 'workspace-after-onboarding');
  expect(log.errors).toEqual([]);
});

test('failure state: an unavailable Brand Brain is stated plainly and shows nothing as saved', async ({ page }) => {
  await setup(page, { brainStatus: 500 });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(/brand brain could not be loaded/i);
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  // Unknown is not missing: nothing is reported as absent while the Brand Brain cannot load.
  await expect(page.getByText('Missing', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /recommended next steps/i })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: /welcome back/i })).toHaveCount(0);
  await scan(page, 'failure-brand-brain');
});

test('missing information: an incomplete profile opens onboarding with an empty, honest form', async ({ page }) => {
  await setup(page, { brainDoc: brain('Northgate Vehicle Leasing') });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /what does your business do/i })).toBeVisible();
  await expect(page.getByLabel(/describe what the business does/i)).toHaveValue('');
  await scan(page, 'missing-brand-brain');
});

test('signed-out visitors see sign-in and no customer data', async ({ page }) => {
  const log = await setup(page, { signedOut: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /sign in to bizgenie/i })).toBeVisible();
  expect(log.calls.filter((c) => c.includes('/customer/'))).toEqual([]);
  await scan(page, 'signed-out');
});

test('keyboard: sections are reachable and operable without a mouse', async ({ page }) => {
  await setup(page);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  const nav = page.getByRole('navigation', { name: /workspace sections/i });
  await nav.getByRole('button', { name: 'Calendar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText(/create a campaign to see its calendar/i)).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Calendar' })).toHaveAttribute('aria-current', 'page');
});
