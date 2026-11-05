// Real-browser regression checks for the customer app. The API and session are fully mocked in the
// browser (no network, no credentials). Build with placeholder VITE_* values (see the workflow).
import { test, expect } from '@playwright/test';

const CID = '22222222-2222-4222-8222-222222222222';
const rec = { recommendation_id: '11111111-1111-4111-8111-111111111111', tenant_id: 't', project_id: 'p', brand_id: 'b', campaign_name: 'Spring Offer Campaign', explanation: 'First safe campaign shape.',
  create_campaign_payload: { tenant_id: 't', project_id: 'p', brand_id: 'b', name: 'Spring Offer Campaign', goal: 'g', display_timezone: 'Europe/London' },
  suggested_items: [{ name: 'Offer announcement', format: 'text', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', reason: 'r' }] };
const campaign = (version) => ({ campaign_id: CID, name: 'Spring Offer Campaign', version, items: [{ content_item_id: 'c1', name: 'Offer announcement', format: 'text', variants: [{ variant_id: 'v1', platform: 'instagram', placement: 'feed', destination_label: 'Instagram', workflow: 'draft', current_revision_id: 'rev-1', current_content: null }] }] });

async function reachCampaign(page) {
  await page.addInitScript(() => localStorage.setItem('sb-supabase-auth-token', JSON.stringify({ access_token: 'fake-local-test-token', refresh_token: 'x', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 't', project_id: 'p', brand_id: 'b' } } })));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  await page.route('http://api.test/**', async (route) => {
    const req = route.request(); const u = req.url();
    const json = (body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' }, body: JSON.stringify(body) });
    if (req.method() === 'OPTIONS') return json({});
    if (u.endsWith('/campaign-recommendations')) return json({ recommendation: rec });
    if (u.endsWith('/campaigns') && req.method() === 'POST') return json({ result: { campaign_id: CID, campaign_version: 1 }, campaign: campaign(1) });
    if (u.endsWith('/content-items')) return json({ campaign: campaign(2) });
    return json({}, 404);
  });
  await page.goto('/');
  await page.getByLabel(/your goal/i).fill('Promote our spring offer');
  await page.getByRole('button', { name: /get my recommendation/i }).click();
  await page.getByRole('button', { name: /^create campaign$/i }).click();
  await page.getByText(/saved to your workspace/i).waitFor();
}

test('no horizontal overflow once a campaign is open (Execution mode select stays inside its card)', async ({ page }) => {
  await reachCampaign(page);
  await expect(page.getByLabel('Execution mode')).toBeVisible();
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const offenders = [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > vw + 1).map((e) => e.tagName + '.' + e.className);
    return { overflow: document.documentElement.scrollWidth > vw + 1, offenders: offenders.slice(0, 5) };
  });
  expect(m).toEqual({ overflow: false, offenders: [] });
});

test('every .eyebrow label meets WCAG AA contrast against its actual background', async ({ page }) => {
  await reachCampaign(page);
  const failures = await page.evaluate(() => {
    const parse = (c) => c.match(/[\d.]+/g).map(Number);
    const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
    const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c.length === 3 || c[3] > 0.99) return c.slice(0, 3); } return [255, 255, 255]; };
    return [...document.querySelectorAll('.eyebrow')].map((el) => {
      const fg = parse(getComputedStyle(el).color).slice(0, 3); const [hi, lo] = [lum(fg), lum(bgOf(el))].sort((a, b) => b - a);
      return { text: el.textContent.trim().slice(0, 30), ratio: +(((hi + 0.05) / (lo + 0.05)).toFixed(2)) };
    }).filter((x) => x.ratio < 4.5);
  });
  expect(failures).toEqual([]);
});
