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
// workspace-onboarding.v1 as the API (draft PR #213) returns it. MOCKED in the browser: not staging evidence.
const onboardingDoc = (over = {}) => ({ contract_version: 'workspace-onboarding.v1', tenant_id: 't', project_id: 'p', brand_id: 'b', version: 3, status: 'completed', sector: { key: 'leasing', source: 'customer' }, industry_text: 'vehicle leasing', channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-23T10:00:00.000Z', updated_at: '2026-10-23T10:00:00.000Z', ...over });
const NOT_STARTED = onboardingDoc({ version: 0, status: 'not_started', sector: { key: null, source: null }, industry_text: null, channels: { values: [], source: null }, current_step: null, completed_at: null, updated_at: null });
const camp = (version, items, workflow = 'draft') => ({ campaign_id: CID, tenant_id: 't', project_id: 'p', brand_id: 'b', name: 'Lease Enquiry Campaign', version, items: items ? [{ content_item_id: 'c1', name: 'Offer announcement', format: 'text', variants: [{ variant_id: 'v1', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow, ...(workflow !== 'draft' ? { current_revision_id: 'rev-1', current_content: 'Server persisted review copy' } : {}) }] }] : [] });

async function setup(page, { scoped = true, signedOut = false, brainDoc = brain('Northgate Vehicle Leasing', 'We lease cars to small businesses.'), brainStatus = 200, onboarding = onboardingDoc(), onboardingGetStatus = 200, onboardingPutStatus = 200, placeholder = false, role = null, brainPut = 'ok', lostAck = false, putIncomplete = null, putForbidden = false } = {}) {
  const log = { calls: [], errors: [], puts: [], brainPuts: [], doc: onboarding };
  page.on('pageerror', (e) => log.errors.push(e.message));
  if (!signedOut) await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [token(scoped)]);
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  let items = 0;
  await page.route('http://api.test/**', async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    log.calls.push(`${m} ${u.pathname}`);
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) });
    if (m === 'OPTIONS') return json({});
    if (u.pathname.endsWith('/workspace/onboarding')) {
      if (m === 'GET') return onboardingGetStatus === 200 ? json({ status: 'ready', onboarding: log.doc, brand_name_placeholder: placeholder }) : json({ status: 'failed', error: { code: 'ONBOARDING_UNAVAILABLE', message: 'x' } }, onboardingGetStatus);
      if (m === 'PUT') {
        const b = JSON.parse(req.postData()); log.puts.push(b);
        if (putForbidden) return json({ status: 'failed', error: { code: 'WORKSPACE_NOT_AUTHORIZED', message: 'Workspace selection is not authorized' } }, 403);
        if (putIncomplete) return json({ status: 'failed', error: { code: 'ONBOARDING_INCOMPLETE', message: 'x', details: putIncomplete.map((path) => ({ path, code: 'required', message: 'Required' })) } }, 422);
        if (onboardingPutStatus !== 200) return json({ status: 'failed', error: { code: 'ONBOARDING_UNAVAILABLE', message: 'x' } }, onboardingPutStatus);
        const sig = JSON.stringify({ ...b, idempotency_key: undefined });
        if (log.lastKey === b.idempotency_key && log.lastSig === sig) return json({ status: 'saved', replayed: true, onboarding: log.doc, brand_name_placeholder: placeholder });
        if (b.expected_version !== log.doc.version) return json({ status: 'failed', error: { code: 'VERSION_CONFLICT', message: 'x', details: { current_version: log.doc.version } } }, 409);
        const d = { ...log.doc, sector: { ...log.doc.sector }, channels: { ...log.doc.channels }, draft: { ...log.doc.draft } };
        if (b.sector_key !== undefined) d.sector = b.sector_key === null ? { key: null, source: null } : { key: b.sector_key, source: b.sector_source || 'customer' };
        if (b.industry_text !== undefined) d.industry_text = b.industry_text;
        if (b.channels !== undefined) d.channels = b.channels.length ? { values: b.channels, source: b.channels_source || 'customer' } : { values: [], source: null };
        if (b.current_step !== undefined) d.current_step = b.current_step;
        for (const [k, v] of Object.entries(b.draft || {})) { if (v === null) delete d.draft[k]; else d.draft[k] = v; }
        d.status = b.complete === true ? 'completed' : b.complete === false ? 'in_progress' : (d.status === 'not_started' ? 'in_progress' : d.status);
        d.completed_at = d.status === 'completed' ? '2026-10-23T11:00:00.000Z' : null;
        d.version = log.doc.version + 1; log.doc = d; log.lastKey = b.idempotency_key; log.lastSig = sig;
        // A lost acknowledgement: the write is stored, but the first response is a 503.
        if (lostAck && log.puts.length === 1) return json({ status: 'failed', error: { code: 'ONBOARDING_UNAVAILABLE', message: 'x' } }, 503);
        return json({ status: 'saved', replayed: false, onboarding: d, brand_name_placeholder: placeholder });
      }
    }
    if (u.pathname.endsWith('/brand-brain') && m === 'GET') return brainStatus === 200 ? json({ status: 'ready', brand_brain: brainDoc }) : json({}, brainStatus);
    if (u.pathname.endsWith('/brand-brain') && m === 'PUT') { const b = JSON.parse(req.postData()); log.brainPuts.push(b); if (brainPut === 'forbidden') return json({ status: 'failed', error: { code: 'BRAND_BRAIN_WRITE_FORBIDDEN', message: 'Current workspace-owner authority is required for business identity changes' } }, 403); if (brainPut === 'conflict') return json({ status: 'failed', error: { code: 'BRAND_BRAIN_VERSION_CONFLICT', message: 'Brand Brain changed; reload before saving' } }, 409); if (brainPut === 'unavailable') return json({ status: 'failed', error: { code: 'BRAND_BRAIN_PERSISTENCE_UNAVAILABLE', message: 'x' } }, 503); brainDoc = { ...b, brand_id: 'b', project_id: 'p', metadata: { version: 2, status: 'draft' } }; return json({ status: 'ready', brand_brain: brainDoc }); }
    if (u.pathname === '/customer/campaigns' && m === 'GET') return json({ campaigns: [] });
    if (u.pathname === '/customer/workspace') return role ? json({ status: 'ready', workspace: { tenant_id: 't', tenant_name: 'T', project_id: 'p', project_name: 'P', brand_id: 'b', brand_name: 'B', brand_status: 'approved', membership_role: role } }) : json({ status: 'missing_workspace', workspace: null });
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

for (const [slug, name, description, label, key] of [
  ['fragrance', 'Maison Aurelle', 'A fragrance house.', 'Fragrance & perfume', 'perfume'],
  ['aesthetics', 'Clearskin Studio', 'An aesthetics clinic in Leeds.', 'Aesthetics clinic', 'aesthetics'],
  ['soft-drinks', 'Fonzo', 'Soft drinks for everyone.', 'Soft drinks & beverages', 'beverage'],
  ['charity', 'WOW Charity', 'We support local families.', 'Charity & community', 'charity'],
  ['unknown', 'Harbour Partners', 'Business consulting.', 'Not specified', null],
]) {
  test(`workspace for ${name} follows its own sector`, async ({ page }) => {
    await setup(page, { brainDoc: brain(name, description), onboarding: onboardingDoc({ sector: key ? { key, source: 'inferred' } : { key: null, source: null }, industry_text: null }) });
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
  const log = await setup(page, { scoped: false, onboarding: NOT_STARTED });
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
  // Setup counts as complete only after the customer saves their progress and then confirms it.
  await expect(page.getByRole('button', { name: /confirm setup/i })).toBeDisabled();
  await page.getByRole('button', { name: /^save progress$/i }).click();
  await expect(page.getByText(/setup progress saved\. you can leave/i)).toBeVisible();
  await page.getByRole('button', { name: /confirm setup/i }).click();
  await expect(page.getByText(/setup confirmed and saved/i)).toBeVisible();
  await scan(page, 'onboarding-6-brain');
  expect(log.puts.map((b) => b.complete)).toEqual([undefined, true]);
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
  // Nothing was published or scheduled, and sector/channel choices were saved only through the onboarding endpoint.
  expect(log.calls.some((c) => /\/(publish|schedule)/.test(c))).toBe(false);
  expect(log.doc).toMatchObject({ status: 'completed', sector: { key: 'leasing', source: 'inferred' }, channels: { values: ['instagram'], source: 'customer' } });
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

// ---------------------------------------------------------------------------------------------------------------
// BG-STUDIO-010-FE: persistent onboarding in a real browser. API and session are MOCKED (no staging, no database).
// ---------------------------------------------------------------------------------------------------------------
test('resume: an unfinished setup reopens at the saved step with saved sector, channels and unsaved answers', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle'), onboarding: onboardingDoc({ version: 2, status: 'in_progress', completed_at: null, current_step: 4, sector: { key: 'perfume', source: 'customer' }, channels: { values: ['instagram', 'email'], source: 'customer' }, draft: { goal: 'Sell more discovery sets' } }) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /where would you like to reach customers/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Instagram/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ps-save-state')).toContainText('Setup progress saved (version 2)');
  await scan(page, 'resume-channels');
  await page.getByRole('button', { name: /^back$/i }).click();
  await expect(page.getByLabel(/what do you want a campaign to achieve/i)).toHaveValue('Sell more discovery sets');
  expect(log.puts).toEqual([]); // resuming writes nothing
});

test('Save and exit: saves exactly what changed, opens the workspace, and the next visit resumes', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle'), onboarding: onboardingDoc({ version: 1, status: 'in_progress', completed_at: null, current_step: 2, sector: { key: null, source: null }, channels: { values: [], source: null }, industry_text: null }) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /what does your business do/i })).toBeVisible();
  await page.getByLabel(/sector used for guidance/i).selectOption('perfume');
  await expect(page.getByTestId('ps-save-state')).toContainText('not saved yet');
  await scan(page, 'unsaved-changes');
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /^Email/ }).click();
  await page.getByRole('button', { name: /save and exit/i }).click();
  await expect(page.getByRole('heading', { name: /^welcome/i })).toBeVisible();
  expect(log.puts).toHaveLength(1);
  expect(log.puts[0]).toMatchObject({ expected_version: 1, sector_key: 'perfume', sector_source: 'customer', channels: ['email'], current_step: 4 });
  expect(JSON.stringify(log.puts[0])).not.toMatch(/tenant|project|brand_id/i);
  await expect(page.getByRole('button', { name: /continue your setup/i })).toBeVisible();
  await scan(page, 'saved-and-exited');
  await page.reload();
  await expect(page.getByRole('heading', { name: /where would you like to reach customers/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Email/ })).toHaveAttribute('aria-pressed', 'true');
});

test('unavailable storage (503 on save) says "not confirmed" (never "NOT saved"), keeps the answers and never navigates away', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle'), onboarding: onboardingDoc({ version: 1, status: 'in_progress', completed_at: null, current_step: 2, sector: { key: null, source: null }, channels: { values: [], source: null } }), onboardingPutStatus: 503 });
  await page.goto('/');
  await page.getByLabel(/describe what the business does/i).fill('Small-batch perfume house.');
  await page.getByRole('button', { name: /save and exit/i }).click();
  await expect(page.getByRole('alert')).toContainText('Save not confirmed — your changes may already have been saved.');
  await expect(page.getByRole('alert')).not.toContainText(/NOT saved/);
  await expect(page.getByLabel(/describe what the business does/i)).toHaveValue('Small-batch perfume house.');
  await expect(page.getByRole('heading', { name: /what does your business do/i })).toBeVisible();
  await scan(page, 'save-unavailable');
  expect(log.doc.version).toBe(1);
});

test('unavailable storage on load is stated plainly and does not call setup complete or incomplete', async ({ page }) => {
  await setup(page, { onboardingGetStatus: 503 });
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText(/saved setup could not be loaded/i);
  await expect(page.getByText('Needs your input')).toHaveCount(0);
  await scan(page, 'load-unavailable');
});

test('a bootstrap-seeded Brand Brain is not treated as a finished profile', async ({ page }) => {
  await setup(page, { onboarding: NOT_STARTED, brainDoc: { ...brain('Halal Motor Leasing Ltd', 'Customer-provided website or profile: https://leaseexpert.example'), commercial: { primary_cta: 'Get more Audi A3 leasing enquiries' } } });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /what does your business do/i })).toBeVisible();
  await expect(page.getByLabel(/describe what the business does/i)).toHaveValue('');
  await expect(page.getByRole('heading', { name: /welcome back/i })).toHaveCount(0);
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('button', { name: /confirm setup/i })).toBeDisabled();
  await expect(page.getByRole('list', { name: /still needed to confirm/i })).toContainText(/website address is not a description/i);
  await scan(page, 'seeded-brain-not-complete');
});

test('stale version: another tab saved first, so the latest is loaded and nothing is overwritten', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle'), onboarding: onboardingDoc({ version: 1, status: 'in_progress', completed_at: null, current_step: 2, sector: { key: null, source: null }, channels: { values: [], source: null } }) });
  await page.goto('/');
  await page.getByLabel(/describe what the business does/i).fill('Small-batch perfume house.');
  log.doc = { ...log.doc, version: 2, sector: { key: 'charity', source: 'customer' } }; // saved elsewhere meanwhile
  await page.getByRole('button', { name: /^save progress$/i }).click();
  await expect(page.getByRole('alert')).toContainText(/changed somewhere else/i);
  await expect(page.getByLabel(/describe what the business does/i)).toHaveValue('Small-batch perfume house.');
  await scan(page, 'version-conflict');
  await page.getByRole('button', { name: /^save progress$/i }).click();
  await expect(page.getByTestId('ps-save-state')).toContainText('version 3');
  expect(log.puts.map((b) => b.expected_version)).toEqual([1, 2]);
});

test('keyboard: Save progress and Save and exit are reachable and announce their result', async ({ page }) => {
  await setup(page, { brainDoc: brain('Maison Aurelle'), onboarding: onboardingDoc({ version: 1, status: 'in_progress', completed_at: null, current_step: 4, channels: { values: [], source: null } }) });
  await page.goto('/');
  await page.getByRole('button', { name: /^Email/ }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^save progress$/i }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: /setup progress saved\. you can leave/i })).toBeVisible();
});

// ---------------------------------------------------------------------------------------------------------------
// BG-STUDIO-011-FE contract alignment with the hardened API (bizgenie-api PR #213 at 120a874). MOCKED, not staging.
// ---------------------------------------------------------------------------------------------------------------
test('lost acknowledgement: the save committed but answered 503, so the page says "not confirmed" and the retry replays the same request', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle'), lostAck: true, onboarding: onboardingDoc({ version: 1, status: 'in_progress', completed_at: null, current_step: 2, sector: { key: null, source: null }, channels: { values: [], source: null } }) });
  await page.goto('/');
  await page.getByLabel(/describe what the business does/i).fill('Small-batch perfume house.');
  await page.getByRole('button', { name: /^save progress$/i }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Save not confirmed — your changes may already have been saved.' });
  await expect(alert).toBeVisible();
  await expect(page.getByRole('alert')).not.toContainText(/NOT saved/);
  await expect(page.getByLabel(/describe what the business does/i)).toHaveValue('Small-batch perfume house.');
  expect(log.doc.version).toBe(2); // it WAS stored
  await scan(page, 'save-not-confirmed');
  await page.getByRole('button', { name: /^save progress$/i }).click();
  await expect(page.getByText(/setup progress saved\. you can leave/i)).toBeVisible();
  expect(log.puts).toHaveLength(2);
  expect(log.puts[1]).toEqual(log.puts[0]); // same key and same body
  expect(log.doc.version).toBe(2); // stored once
});

test('incomplete business setup (422): field-specific guidance, nothing marked confirmed', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle', 'A small-batch perfume house.'), putIncomplete: ['business_name', 'description'], onboarding: onboardingDoc({ version: 2, status: 'in_progress', completed_at: null, current_step: 5, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] } }) });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /your brand brain/i })).toBeVisible();
  await page.getByRole('button', { name: /confirm setup/i }).click();
  const list = page.getByRole('list', { name: /what is still needed/i });
  await expect(list).toContainText(/business name/i);
  await expect(list).toContainText(/a website address alone is not a description/i);
  await expect(page.getByText(/you confirmed your setup/i)).toHaveCount(0);
  expect(log.doc.status).toBe('in_progress');
  await scan(page, 'confirm-incomplete');
});

test('read-only member: can read setup, cannot save or confirm, and is told why', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle', 'A small-batch perfume house.'), role: 'member', onboarding: onboardingDoc({ version: 2, status: 'in_progress', completed_at: null, current_step: 4, channels: { values: ['email'], source: 'customer' } }) });
  await page.goto('/');
  await expect(page.getByText(/view only\. your role in this workspace is member/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Email/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /^save progress$/i })).toBeDisabled();
  await expect(page.getByRole('button', { name: /^save and exit$/i })).toBeDisabled();
  await scan(page, 'read-only-member');
  expect(log.puts).toEqual([]);
});

test('a refused write (403) on an unknown role explains itself and switches to view only once the role is read', async ({ page }) => {
  const log = await setup(page, { brainDoc: brain('Maison Aurelle'), putForbidden: true, onboarding: onboardingDoc({ version: 2, status: 'in_progress', completed_at: null, current_step: 4, channels: { values: [], source: null } }) });
  await page.goto('/');
  await page.getByRole('button', { name: /^Email/ }).click();
  await page.getByRole('button', { name: /^save progress$/i }).click();
  await expect(page.getByRole('alert')).toContainText(/only the workspace owner can save or confirm setup, or your access to this workspace has ended/i);
  expect(log.puts).toHaveLength(1);
  await scan(page, 'write-refused');
});

async function editAudienceAtBrainStep(page, text) {
  await page.getByRole('button', { name: /^back$/i }).click();
  await page.getByRole('button', { name: /^back$/i }).click();
  await page.getByLabel(/who are your customers/i).fill(text);
  await page.getByRole('button', { name: /^continue$/i }).click();
  await page.getByRole('button', { name: /^continue$/i }).click();
  await expect(page.getByRole('heading', { name: /your brand brain/i })).toBeVisible();
}

// Brand Brain identity ownership (DEC-021 / DEC-022; backend draft PR #214 at 2319e5e8). MOCKED API: not staging evidence.
async function toBrainStep(page) {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /your brand brain/i })).toBeVisible();
}
const BRAIN_STEP = onboardingDoc({ version: 2, status: 'in_progress', completed_at: null, current_step: 5, channels: { values: ['email'], source: 'customer' } });
const FULL_BRAIN = { ...brain('Maison Aurelle', 'A small-batch perfume house.'), audience: { summary: 'Gift buyers.' }, commercial: { primary_cta: 'Shop the new scent' } };

test('member at the Brand Brain step: name and description are owner-only, the rest can still be saved, and the stored identity is repeated exactly', async ({ page }) => {
  const log = await setup(page, { brainDoc: FULL_BRAIN, role: 'member', onboarding: BRAIN_STEP });
  await toBrainStep(page);
  await expect(page.getByText(/only the workspace owner can change the business name and description/i)).toBeVisible();
  await editAudienceAtBrainStep(page, 'Collectors and gift buyers');
  const save = page.getByRole('button', { name: /save who it serves and customer action/i });
  await expect(save).toBeEnabled();
  await scan(page, 'member-brain-step');
  await save.click();
  await expect(page.getByText(/business name and description are unchanged/i)).toBeVisible();
  expect(log.brainPuts).toHaveLength(1);
  expect(log.brainPuts[0].name).toBe('Maison Aurelle');
  expect(log.brainPuts[0].identity.description).toBe('A small-batch perfume house.');
  await scan(page, 'member-brain-saved');
});

test('refused (403) and conflicting (409) Brand Brain saves are explained, keep the answers and never show a save', async ({ page }) => {
  for (const [mode, text, label] of [['forbidden', /only the workspace owner can change the business name and description, and anyone whose access|changed by the workspace owner/i, 'brain-write-refused'], ['conflict', /changed somewhere else[\s\S]*nothing was overwritten/i, 'brain-write-conflict']]) {
    const log = await setup(page, { brainDoc: FULL_BRAIN, brainPut: mode, onboarding: BRAIN_STEP });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /your brand brain/i })).toBeVisible();
    await editAudienceAtBrainStep(page, 'Collectors');
    await page.getByRole('button', { name: /^save to brand brain$/i }).click();
    await expect(page.getByRole('alert')).toContainText(text);
    await expect(page.getByText(/saved to your brand brain/i)).toHaveCount(0);
    expect(log.brainPuts).toHaveLength(1);
    await scan(page, label);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
});

test('an unavailable Brand Brain save says "not confirmed" and offers to check what was saved', async ({ page }) => {
  const log = await setup(page, { brainDoc: FULL_BRAIN, brainPut: 'unavailable', onboarding: BRAIN_STEP });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /your brand brain/i })).toBeVisible();
  await editAudienceAtBrainStep(page, 'Collectors');
  await page.getByRole('button', { name: /^save to brand brain$/i }).click();
  await expect(page.getByRole('alert')).toContainText(/save not confirmed — your changes may already have been saved/i);
  await expect(page.getByRole('button', { name: /check what was saved/i })).toBeVisible();
  expect(await page.getByRole('alert').innerText()).not.toMatch(/not saved/i);
  await scan(page, 'brain-save-not-confirmed');
  expect(log.brainPuts).toHaveLength(1);
});

// BG-STUDIO-015-FE: the Brand tab (replaces the shared legacy panel inside the flag-on Studio) and latest-version saves.
// MOCKED API with the shapes in bizgenie-api #214; not staging evidence.
const DONE = onboardingDoc();
test('Brand tab, owner: edits are applied to the latest stored Brand Brain, not to the copy loaded earlier', async ({ page }) => {
  const log = await setup(page, { brainDoc: FULL_BRAIN, role: 'owner', onboarding: DONE });
  await page.goto('/');
  await page.getByRole('button', { name: /^brand$/i }).click();
  await expect(page.getByRole('heading', { name: /^brand brain$/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /^save to brand brain$/i })).toBeDisabled(); // nothing edited yet
  await scan(page, 'brand-tab-owner');
  await page.getByLabel(/what a customer should do next/i).fill('Book a discovery set');
  await expect(page.getByRole('button', { name: /^save to brand brain$/i })).toBeEnabled();
  await page.getByRole('button', { name: /^save to brand brain$/i }).click();
  await expect(page.getByText(/saved to your brand brain/i)).toBeVisible();
  expect(log.brainPuts).toHaveLength(1);
  expect(log.brainPuts[0].commercial.primary_cta).toBe('Book a discovery set');
  expect(log.brainPuts[0].audience.summary).toBe('Gift buyers.');
});

test('Brand tab, member: name and description are read-only with the reason, the rest saves', async ({ page }) => {
  const log = await setup(page, { brainDoc: { ...FULL_BRAIN, identity: { description: 'A small-batch perfume house.' } }, role: 'member', onboarding: DONE });
  await page.goto('/');
  await page.getByRole('button', { name: /^brand$/i }).click();
  await expect(page.getByLabel(/^business name$/i)).toHaveAttribute('readonly', '');
  await expect(page.getByLabel(/what the business does/i)).toHaveAttribute('readonly', '');
  await expect(page.getByText(/only the workspace owner can change the business name and description/i).first()).toBeVisible();
  await scan(page, 'brand-tab-member');
  await page.getByLabel(/who it serves/i).fill('Collectors and gift buyers');
  await page.getByRole('button', { name: /save who it serves and customer action/i }).click();
  await expect(page.getByText(/business name and description are unchanged/i)).toBeVisible();
  expect(log.brainPuts[0].name).toBe('Maison Aurelle');
  expect(log.brainPuts[0].audience.summary).toBe('Collectors and gift buyers');
});

test('Brand tab, refused save (403): the Brand Brain stays on screen and is never reported as failing to load', async ({ page }) => {
  const log = await setup(page, { brainDoc: FULL_BRAIN, brainPut: 'forbidden', role: 'owner', onboarding: DONE });
  await page.goto('/');
  await page.getByRole('button', { name: /^brand$/i }).click();
  await page.getByLabel(/who it serves/i).fill('Collectors');
  await page.getByRole('button', { name: /^save to brand brain$/i }).click();
  await expect(page.getByRole('alert')).toContainText(/saving was refused/i);
  await expect(page.getByLabel(/who it serves/i)).toHaveValue('Collectors');
  await expect(page.getByText(/could not be loaded/i)).toHaveCount(0);
  expect(log.brainPuts).toHaveLength(1);
  await scan(page, 'brand-tab-refused');
});
