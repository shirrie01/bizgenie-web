// TikTok DRAFT journey in a real browser against the real backend code, run with RB_SOCIAL=tiktok (BG-LAUNCH-006).
// With RB_TIKTOK_STANDIN=1 TikTok's HTTP is a labelled stand-in (fakeTikTok.mjs): this is a REHEARSAL of BizGenie's wiring and states and is NOT TikTok acceptance.
// The real, founder-approved run uses the same journey with the stand-in off and the TikTok sandbox credentials in the environment.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import { APP, checks, nav, open, welcome } from './helpers.mjs';

const STANDIN = process.env.RB_TIKTOK_STANDIN === '1'; const REAL = process.env.RB_PROVIDERS === 'real';
const INBOX_CONFIRMED = process.env.RB_TIKTOK_INBOX_CONFIRMED_FILE || '/tmp/rb-tiktok-inbox-confirmed'; const LOG = process.env.RB_STANDIN_LOG || '/tmp/rb-tiktok-calls.jsonl';
const calls = () => (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

test('TikTok: connect -> a bound TikTok video -> review, approval, schedule -> sent as a DRAFT -> never shown as published -> disconnect revokes', async ({ page }) => {
  test.setTimeout(REAL || !STANDIN ? 3600000 : 300000);
  const seen = await open(page);
  // Rehearsal: the authorize page is a redirect stand-in. Real run: NOTHING is stubbed; a person signs in to TikTok with the sandbox test account in this (headed) browser.
  if (STANDIN) await page.route('https://www.tiktok.com/**', (route) => { const u = new URL(route.request().url()); seen.oauth.push(u.href); return route.fulfill({ status: 302, headers: { location: `${APP}/?code=standin_authorization_code&state=${encodeURIComponent(u.searchParams.get('state'))}` }, body: '' }); });
  await page.goto('/'); await welcome(page);

  // 1. connect TikTok (the authorize page is the stand-in redirect; the redirect URI is the one registered in code)
  await nav(page).getByRole('button', { name: 'Accounts and publishing', exact: true }).click();
  await page.getByRole('button', { name: 'Connect TikTok' }).click();
  if (STANDIN) {
    await page.waitForURL(/\?code=standin_authorization_code&state=/, { timeout: 20000 });
    const auth = new URL(seen.oauth[0]); expect(auth.origin + auth.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(auth.searchParams.get('redirect_uri')).toBe('https://getbizgenie.com/customer/social/oauth/callback/tiktok'); expect(auth.searchParams.get('response_type')).toBe('code');
    expect(auth.searchParams.get('scope')).toBe('user.info.basic,video.upload'); expect(auth.searchParams.get('code_verifier')).toBeNull();
  } else {
    // The registered redirect is on getbizgenie.com, which is not routed to this machine. After the person approves on TikTok the browser lands on that URL; this step carries its code and
    // state to the local Studio in the SAME tab (so the verifier BizGenie kept in this tab is still there). The one-use code stays in the browser and is never printed or stored.
    await page.waitForURL(/getbizgenie\.com\/customer\/social\/oauth\/callback\/tiktok\?/, { timeout: 900000 });
    const back = new URL(page.url()); expect(back.origin + back.pathname).toBe('https://getbizgenie.com/customer/social/oauth/callback/tiktok');
    await page.goto(`${APP}/?code=${encodeURIComponent(back.searchParams.get('code') || '')}&state=${encodeURIComponent(back.searchParams.get('state') || '')}`);
  }
  await welcome(page); await nav(page).getByRole('button', { name: 'Accounts and publishing', exact: true }).click();
  await expect(page.getByText('TikTok is connected.')).toBeVisible({ timeout: 20000 });
  expect(page.url()).not.toContain('code='); await checks(page, 'tt-connected');

  // 2. a TikTok video created FOR the connected account, made and reviewed through the normal Studio steps
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await page.getByText('Add an image or video to this campaign').click();
  await page.getByLabel('Name', { exact: true }).fill('TikTok reel'); await page.getByRole('radio', { name: 'Video' }).check(); await page.getByLabel('Platform', { exact: true }).selectOption('tiktok');
  await page.getByLabel('Where on the platform').fill('feed');
  const account = page.getByLabel('Connected account'); await expect(account).toBeVisible(); await account.selectOption({ index: 1 });
  await expect(page.getByLabel('Account or page')).not.toHaveValue(''); await page.getByRole('button', { name: 'Add to the campaign' }).click();
  const vp = page.locator('details.ps-creative').filter({ hasText: 'Create the video for this post' }).last(); await vp.getByText('Create the video for this post').click();
  await vp.getByLabel('Brief', { exact: true }).fill('A short vertical reveal of a new van on the forecourt');
  await vp.getByRole('button', { name: /Get the price for the video/ }).click(); await expect(vp.getByRole('group', { name: 'Price' })).toContainText('6 credits');
  await vp.getByRole('button', { name: /Confirm and set aside 6 credits/ }).click(); await expect(vp.getByText(/6 credits used\./)).toBeVisible({ timeout: REAL ? 900000 : 90000 });
  await vp.getByRole('button', { name: 'Attach to this post' }).click(); await expect(vp.getByText(/Attached to the post/)).toBeVisible();
  await vp.getByRole('button', { name: 'Send for review' }).click(); await expect(page.getByText('Ready for review')).toBeVisible();
  await page.getByRole('button', { name: 'Render preview' }).click(); await expect(page.getByText(/Preview rendered\. Step 2 of 3/)).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge preview' }).click(); await expect(page.getByText(/Step 3 of 3/)).toBeVisible();
  await page.getByRole('button', { name: /^Approve/ }).click(); await expect(page.getByText(/Approved/).first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.creative-fit-ok').filter({ hasText: /Suits TikTok/ }).first()).toBeVisible();

  // 3. plan a time a little ahead, then send it as a DRAFT
  const when = new Date(Date.now() + 100000); const local = when.toISOString().slice(0, 16);
  await page.getByLabel(/Plan when to publish/).last().fill(local); await page.getByRole('button', { name: 'Save planned time' }).last().click(); await expect(page.getByText('Planned time saved.').first()).toBeVisible({ timeout: 15000 });
  const send = page.getByRole('group', { name: 'Send to TikTok as a draft' }); await expect(send).toBeVisible(); await expect(send).toContainText(/BizGenie does not publish it/);
  await expect(send.getByRole('button', { name: /Send as a draft/ })).toBeDisabled(); await send.getByRole('checkbox').check(); await send.getByRole('button', { name: /Send as a draft/ }).click();
  await expect(send.getByRole('status')).toContainText(/Queued/); await checks(page, 'tt-queued');

  // 4. at the planned time the worker uploads the draft; the Studio shows a draft awaiting the creator, never a publication
  let drafted = false;
  for (let i = 0; i < (STANDIN ? 14 : 60) && !drafted; i += 1) {
    await page.reload(); await welcome(page); await nav(page).getByRole('button', { name: 'Accounts and publishing', exact: true }).click();
    drafted = await page.getByText('Draft sent to TikTok').first().waitFor({ state: 'visible', timeout: 6000 }).then(() => true).catch(() => false); if (!drafted) await page.waitForTimeout(10000);
  }
  expect(drafted, 'the draft state appeared').toBe(true);
  await expect(page.getByText(/in your TikTok inbox as a draft/i).first()).toBeVisible(); await expect(page.getByText(/BizGenie has not published it/i).first()).toBeVisible();
  // the harness also seeds an unrelated, genuinely published post, so the check is on THIS draft's own list entry
  const entry = page.getByRole('list', { name: 'Publishing list' }).getByRole('listitem').filter({ hasText: 'Draft sent to TikTok' }).first();
  await expect(entry).not.toContainText('Published'); await expect(entry).not.toContainText(/Confirmed by the platform/); await expect(entry.getByRole('link')).toHaveCount(0); await expect(entry.getByRole('button', { name: /cancel/i })).toHaveCount(0);
  await checks(page, 'tt-drafted');
  if (STANDIN) {
    const c = calls(); const init = c.find((x) => x.path === '/v2/post/publish/inbox/video/init/'); const put = c.find((x) => x.method === 'PUT');
    expect(init.source).toBe('FILE_UPLOAD'); expect(init.video_size).toBeGreaterThan(1000); expect(put.bytes).toBe(init.video_size); expect(put.bearer).toBe(false);
    expect(c.filter((x) => x.path === '/v2/post/publish/inbox/video/init/')).toHaveLength(1); expect(c.some((x) => x.unexpected)).toBe(false);
    expect(c.some((x) => /\/video\/(publish|direct)/.test(x.path) || x.path === '/v2/post/publish/video/init/')).toBe(false);   // Direct Post is never called
  }

  // A person must see the draft in the TikTok app (creator action) before the account is disconnected: create the confirmation file once they have, with a screenshot or screen recording.
  if (!STANDIN) { console.log(`WAITING for the person to confirm the draft is in the TikTok inbox: create ${INBOX_CONFIRMED}`); await expect.poll(() => fs.existsSync(INBOX_CONFIRMED), { timeout: 1800000, intervals: [5000] }).toBe(true); }

  // 5. disconnect: revoked locally at once, and TikTok is asked to revoke
  await page.getByRole('button', { name: /^Disconnect Stand-in Creator|^Disconnect .*TikTok/i }).first().click(); await page.getByRole('button', { name: 'Yes, disconnect' }).click();
  await expect(page.getByText(/was disconnected\. Anything already published stays on the platform/)).toBeVisible();
  if (STANDIN) await expect.poll(() => calls().some((x) => x.path === '/v2/oauth/revoke/'), { timeout: 15000 }).toBe(true);
  else console.log('Disconnected. Now confirm in the TikTok developer portal / account that the app no longer has access, and record it.');
  expect(seen.errors).toEqual([]);
});
