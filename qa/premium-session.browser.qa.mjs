// Real-browser QA of an ended session in the Premium Studio (BG-STUDIO-017-FE), flag-ON production build.
// The API and Supabase are fully MOCKED (no network, no credentials): this is NOT a deployed or staging journey.
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
const sess = JSON.stringify({ access_token: 'tok-b1', refresh_token: 'r', token_type: 'bearer', expires_in: 99999, expires_at: 4102444800, user: { id: 'u', app_metadata: { tenant_id: 't1', project_id: 'p1', brand_id: 'b1' } } });

test('session expired: the customer is told plainly and can sign in again; no dead-end retry buttons are the only option', async ({ page }) => {
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(([t]) => localStorage.setItem('sb-supabase-auth-token', t), [sess]);
  await page.route(/fonts\./, (r) => r.abort());
  const json = (route, body, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: CORS, body: JSON.stringify(body) });
  await page.route('http://supabase.test/**', (route) => json(route, { error: 'invalid_grant' }, 400)); // the refresh token is no longer accepted
  await page.route('http://api.test/**', (route) => (route.request().method() === 'OPTIONS' ? json(route, {}) : json(route, { status: 'failed', error: { code: 'AUTHENTICATION_REQUIRED' } }, 401)));
  await page.goto('/');
  const notice = page.getByRole('status').filter({ hasText: /your session has ended/i });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/sign in again to continue/i);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
  expect(overflow).toBe(false);
  expect(await axeViolations(page), 'session-ended: axe').toEqual([]);
  if (EVIDENCE) { fs.mkdirSync(EVIDENCE, { recursive: true }); await page.screenshot({ path: `${EVIDENCE}/${W}-session-ended.png`, fullPage: true }); }
  await notice.getByRole('button', { name: /^sign in again$/i }).click();
  await expect(page.getByRole('heading', { name: /sign in to bizgenie/i })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: /your session has ended/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});
