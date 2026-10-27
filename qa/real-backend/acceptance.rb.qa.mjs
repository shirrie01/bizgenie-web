// Real-browser acceptance of the integrated premium journey against the REAL local backend harness (bizgenie-api #220 routers on disposable PostgreSQL, real HTTP, real CORS).
// ONLY the workspace/bootstrap endpoints and the sign-in provider are stubbed (the harness does not compose the customer-workspace service); every other request - media, creative
// jobs, quotes, campaigns, social, calendar, insights - reaches the real backend. The platform sign-in pages are stubbed as redirects (no real OAuth). Nothing here is staging.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
let AXE = null; try { AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8'); } catch { /* optional locally */ }
const IDS = JSON.parse(fs.readFileSync(process.env.RB_IDS || '/tmp/claude-0/rb-ids.json', 'utf8'));
const EVIDENCE = process.env.EVIDENCE_DIR || ''; const W = Number((process.env.BG_VIEWPORT || '1440x900').split('x')[0]);
const API = IDS.base; const APP = 'http://127.0.0.1:4182';
const sess = (token) => JSON.stringify({ access_token: token, refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 'tenant_a', project_id: 'project_a', brand_id: 'brand_a' } } });
const ws = (role) => ({ tenant_id: 'tenant_a', tenant_name: 'Northgate Group', project_id: 'project_a', project_name: 'Northgate campaigns', brand_id: 'brand_a', brand_name: 'Northgate Vehicle Leasing', brand_status: 'approved', membership_role: role });
const onboarding = { contract_version: 'workspace-onboarding.v1', tenant_id: 'tenant_a', project_id: 'project_a', brand_id: 'brand_a', version: 3, status: 'completed', sector: { key: 'leasing', source: 'customer' }, industry_text: null, channels: { values: ['email'], source: 'customer' }, current_step: 6, draft: {}, completeness: { sector: true, channels: true, ready_to_complete: true, missing: [] }, completed_at: '2026-10-24T10:00:00.000Z' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5XkAAAAASUVORK5CYII=', 'base64');

async function open(page, { token = 'ok', role = 'owner' } = {}) {
  const seen = { real: [], bad: [], errors: [], oauth: [] };
  page.on('pageerror', (e) => seen.errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [sess(token)]);
  await page.route(/fonts\./, (r) => r.abort());
  await page.route('http://supabase.test/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: sess(token) }));
  // sign-in provider stubs: the authorize page redirects to the registered redirect URI, which redirects back into the app with the state it was given (a real callback shape)
  // The sign-in page stub plays platform + registered redirect in one hop (the browser would be sent to the registered redirect URI, which sends the visitor back to the app with code and state).
  await page.route('https://www.facebook.com/**', (route) => { const u = new URL(route.request().url()); seen.oauth.push(u.href); if (u.searchParams.get('redirect_uri') !== 'https://app.example.test/connections') return route.fulfill({ status: 400, body: 'unregistered redirect' }); return route.fulfill({ status: 302, headers: { location: `${APP}/?code=synthetic_authorization_code&state=${encodeURIComponent(u.searchParams.get('state'))}` }, body: '' }); });
  const cors = { 'access-control-allow-origin': APP, 'access-control-allow-headers': 'authorization,content-type', 'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS', vary: 'Origin' };
  await page.route(`${API}/**`, (route) => {
    const req = route.request(); const u = new URL(req.url()); const p = u.pathname; const json = (b, s = 200) => route.fulfill({ status: s, contentType: 'application/json', headers: cors, body: JSON.stringify(b) });
    if (req.method() === 'OPTIONS') return route.fallback();
    if (p === '/customer/workspace') return json({ status: 'ready', workspace: ws(role) });
    if (p === '/customer/workspace/brand-brain') return json({ status: 'ready', brand_brain: { brand_id: 'brand_a', project_id: 'project_a', name: 'Northgate Vehicle Leasing', identity: { description: 'We lease cars and vans to small businesses.' }, metadata: { version: 1, status: 'approved' } } });
    if (p === '/customer/workspace/onboarding') return json({ status: 'ready', onboarding, brand_name_placeholder: false });
    if (p.startsWith('/customer/billing/') || p.startsWith('/billing/')) return json({ status: 'unavailable', error: { code: 'BILLING_NOT_COMPOSED_IN_HARNESS' } }, 503); // billing is out of scope of this harness
    seen.real.push(`${req.method()} ${p}`); return route.fallback();
  });
  page.on('response', async (r) => { if (r.url().startsWith(API) && r.status() >= 400 && r.request().method() !== 'OPTIONS') seen.bad.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname} ${await r.text().catch(() => '')} REQ ${r.request().postData() || ''}`); });
  return seen;
}
const nav = (page) => page.getByRole('navigation', { name: /workspace sections/i });
const welcome = (page) => page.getByRole('heading', { name: 'Welcome back, Northgate Vehicle Leasing.' }).waitFor();
async function checks(page, label) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1), `${label}: horizontal overflow`).toBe(false);
  if (AXE) { await page.addScriptTag({ content: AXE }); const v = await page.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] })).violations.map((x) => `${x.id}: ${x.nodes.map((n) => n.target.join(' ')).join(' | ')}`)); expect(v, `${label}: axe`).toEqual([]); }
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-rb-${label}.png`, fullPage: true }); }
}

test('F2 your media: add a PNG with the rights confirmation; the real backend inspects it; it previews through authenticated delivery; withdrawing removes it', async ({ page }) => {
  const seen = await open(page); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Your media', exact: true }).click();
  await expect(page.getByText('You have not added any files yet.')).toBeVisible();
  await page.getByLabel('Choose a file').setInputFiles({ name: 'shopfront.png', mimeType: 'image/png', buffer: png });
  await expect(page.getByRole('button', { name: 'Add file' })).toBeDisabled(); // rights not confirmed yet
  await page.getByLabel(/I own this file/).check(); await page.getByRole('button', { name: 'Add file' }).click();
  await expect(page.getByText(/shopfront\.png is ready to use\. Your rights confirmation was recorded as entered by you/)).toBeVisible();
  const img = page.getByAltText('Your file shopfront.png'); await expect(img).toBeVisible(); await expect.poll(() => img.evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  expect(seen.real).toEqual(expect.arrayContaining(['POST /customer/assets/uploads', expect.stringMatching(/^PUT \/customer\/assets\/uploads\/.+\/bytes$/), expect.stringMatching(/^POST \/customer\/assets\/.+\/complete$/), expect.stringMatching(/^GET \/customer\/assets\/.+\/preview$/)]));
  await checks(page, 'media');
  await page.getByRole('button', { name: 'Remove shopfront.png' }).click(); await page.getByRole('button', { name: 'Withdraw it' }).click();
  await expect(page.getByText(/was withdrawn\. Posts that already use it are unchanged/)).toBeVisible(); await expect(page.getByText('You have not added any files yet.')).toBeVisible();
  expect(seen.errors).toEqual([]);
});

test('F2 isolation: another workspace user cannot read the media list', async ({ page }) => {
  const seen = await open(page, { token: 'other' }); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Your media', exact: true }).click();
  await expect(page.getByRole('alert').first()).toContainText(/not available to you|Only the workspace owner/);
  await expect(page.getByRole('list', { name: 'Your files' })).toHaveCount(0);
  expect(seen.errors).toEqual([]);
});

test('F2 creative: price -> confirm -> the real worker finishes -> the server result -> attach -> the image is shown through authenticated, revision-scoped delivery', async ({ page }) => {
  const seen = await open(page); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await page.getByText('Create the image for this post').click();
  await page.getByLabel('Brief', { exact: true }).fill('A calm product shot of the shopfront');
  await page.getByRole('button', { name: /Get the price for the image/ }).click();
  const card = page.getByRole('group', { name: 'Price' }); await expect(card).toContainText('2 credits'); await checks(page, 'creative-price');
  expect(seen.real).not.toContain('POST ' + '/customer/generation-quotes/confirm'); // a price starts nothing
  await page.getByRole('button', { name: /Confirm and set aside 2 credits/ }).click();
  await expect(page.getByText(/2 credits used\./)).toBeVisible({ timeout: 30000 });
  const result = page.getByLabel('Image result').first(); await expect(result).toBeVisible(); await expect(result).toContainText(/stored privately/); await expect(page.locator('.ps-creative img')).toHaveCount(0); // finished is not attached, so not shown
  await checks(page, 'creative-finished');
  await page.getByRole('button', { name: 'Attach to this post' }).click(); await expect(page.getByText(/Attached to the post/)).toBeVisible();
  await expect(page.getByText(/Not approved yet/)).toBeVisible(); await expect(page.getByText(/Approval applies only to the current version/)).toBeVisible();
  const shown = page.locator('.ps-creative figure img'); await expect(shown.first()).toBeVisible({ timeout: 20000 }); await expect.poll(() => shown.first().evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  expect(seen.real.filter((r) => /\/assets\/.+\/preview$/.test(r)).length).toBeGreaterThan(0);
  expect(seen.real).toEqual(expect.arrayContaining([expect.stringMatching(/^POST \/customer\/creative-jobs\/.+\/attach$/)]));
  await checks(page, 'creative-attached');
  await page.getByRole('button', { name: 'Send for review' }).click();
  await expect(page.getByText('Ready for review')).toBeVisible();
  await page.getByRole('button', { name: 'Render preview' }).click();
  await expect(page.getByText(/Preview rendered\. Step 2 of 3/)).toBeVisible(); await checks(page, 'creative-review-preview');
  await page.getByRole('button', { name: 'Acknowledge preview' }).click(); await expect(page.getByText(/Step 3 of 3/)).toBeVisible();
  await page.getByRole('button', { name: /^Approve/ }).click();
  await expect(page.getByText(/Approved/).first()).toBeVisible({ timeout: 15000 });
  expect(seen.real).toEqual(expect.arrayContaining([expect.stringMatching(/\/variants\/.+\/review$/), expect.stringMatching(/\/preview-renders$/), expect.stringMatching(/\/preview-acknowledgements$/), expect.stringMatching(/\/approval$/)]));
  // approved: the saved creative of the CURRENT version is shown through authenticated delivery (found by this acceptance: it used to say "can't be shown here yet")
  const approvedImg = page.locator('.creative-assets img'); await expect(approvedImg.first()).toBeVisible({ timeout: 20000 }); await expect.poll(() => approvedImg.first().evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText(/The image itself can.t be shown here yet/)).toHaveCount(0);
  expect(seen.bad).toEqual([]); await checks(page, 'creative-approved');
  expect(seen.errors).toEqual([]);
});

test('F3 calendar: one entry per post from the real workspace calendar; a still-scheduled post shows its delivery status; a platform-published post is confirmed by the platform and is not shown twice', async ({ page }) => {
  const seen = await open(page); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Calendar', exact: true }).click();
  const day = page.getByRole('button', { name: 'Day', exact: true }); await expect(day).toBeVisible(); await day.click();
  await expect(page.getByText('Queued to send at the planned time.').first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Confirmed by the platform')).toHaveCount(1);
  const entries = page.locator('.ps-wcal-entry'); expect(await entries.count()).toBeGreaterThanOrEqual(2);
  const keys = await entries.evaluateAll((els) => els.map((e) => e.textContent)); expect(new Set(keys).size).toBe(keys.length); // nothing listed twice
  expect(seen.real.some((r) => r.startsWith('GET /customer/calendar'))).toBe(true); expect(seen.real.some((r) => r.startsWith('GET /customer/social/calendar'))).toBe(true);
  expect(seen.real.some((r) => /\/customer\/campaigns\/[^/]+\/calendar$/.test(r.split(' ')[1]))).toBe(false); // no per-campaign fan-out
  expect(seen.bad).toEqual([]); await checks(page, 'calendar');
  expect(seen.errors).toEqual([]);
});

test('F5 learning: the owner reads the real snapshot on request, compares two periods, accepts the suggestion with the server version; a member reads suggestions only', async ({ page, browser }) => {
  const seen = await open(page); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Results and insights', exact: true }).click();
  await expect(page.getByText(/Nothing is read until you ask/)).toBeVisible(); expect(seen.real).not.toContain('POST /customer/insights/snapshots');
  await page.getByRole('button', { name: 'Read the latest platform results' }).click();
  const table = page.getByRole('table'); await expect(table).toContainText('Measured by the platform'); await expect(table).toContainText('20');
  await checks(page, 'insights-results');
  await page.getByRole('button', { name: /Look for a change in Instagram Clicks/ }).click();
  const list = page.getByRole('list', { name: 'Changes worth reviewing' }); await expect(list).toContainText('went up from 10 to 20');
  await expect(page.getByText(/does not show what caused it/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Accept', exact: true }).click(); await expect(page.getByText(/Accepted by you and saved/)).toBeVisible();
  await page.reload(); await welcome(page); await nav(page).getByRole('button', { name: 'Results and insights', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Changes worth reviewing' })).toContainText('Accepted by you and saved'); // the decision is held by the server, not the browser
  await expect(page.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  expect(seen.bad).toEqual([]); await checks(page, 'insights-decided');
  // a member (same workspace, member role in the app) never triggers a snapshot and cannot decide
  const mp = await browser.newPage(); const ms = await open(mp, { role: 'member' }); await mp.goto('/'); await welcome(mp); await nav(mp).getByRole('button', { name: 'Results and insights', exact: true }).click();
  await expect(mp.getByText(/The workspace owner refreshes platform results/)).toBeVisible(); await expect(mp.getByRole('button', { name: 'Accept', exact: true })).toHaveCount(0);
  expect(ms.real).not.toContain('POST /customer/insights/snapshots'); await mp.close();
  expect(seen.errors).toEqual([]);
});

test('F1 accounts: a connection is shown only as the server reports it; disconnect is local revocation; connect follows the server-built sign-in URL and completes only against this browser\'s attempt; an unconfigured platform fails closed', async ({ page }) => {
  const seen = await open(page); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Accounts and publishing', exact: true }).click();
  const accounts = page.getByRole('list', { name: 'Connected accounts' }); await expect(accounts).toContainText('Instagram'); await expect(accounts).toContainText('Connected');
  await expect(page.getByRole('button', { name: 'Connect Instagram' })).toHaveCount(0);
  // a platform with no reviewed configuration: fail closed, nothing opened
  await page.getByRole('button', { name: 'Connect Facebook' }).click(); await expect(page.getByRole('alert').first()).toContainText(/not switched on|not set up/); expect(seen.oauth).toEqual([]);
  // disconnect (local revocation) then connect again through the full sign-in round trip
  await page.getByRole('button', { name: /^Disconnect / }).first().click(); await page.getByRole('button', { name: 'Yes, disconnect' }).click();
  await expect(page.getByText(/was disconnected\. Anything already published stays on the platform/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect Instagram' })).toBeVisible(); await checks(page, 'accounts-disconnected');
  await page.getByRole('button', { name: 'Connect Instagram' }).click();
  await page.waitForURL(/\?code=synthetic_authorization_code&state=/, { timeout: 15000 });
  expect(seen.oauth.length).toBe(1); const u = new URL(seen.oauth[0]); expect(u.origin + u.pathname).toBe('https://www.facebook.com/vTEST/dialog/oauth'); expect(u.searchParams.get('code_challenge_method')).toBe('S256'); expect(u.searchParams.get('code_verifier')).toBeNull(); expect(u.searchParams.get('redirect_uri')).toBe('https://app.example.test/connections');
  await welcome(page); await nav(page).getByRole('button', { name: 'Accounts and publishing', exact: true }).click();
  await expect(page.getByText('Instagram is connected.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('list', { name: 'Connected accounts' })).toContainText('Connected');
  expect(page.url()).not.toContain('code='); // the one-use code is removed from the address bar
  expect(await page.evaluate(() => sessionStorage.getItem('bizgenie.social.pending'))).toBeNull(); // and the verifier is gone
  expect(seen.real).toEqual(expect.arrayContaining(['POST /customer/social/oauth-intents', 'POST /customer/social/oauth-complete']));
  await checks(page, 'accounts-connected');
  expect(seen.errors).toEqual([]);
});
