import { test, expect } from '@playwright/test';
import { API, EVIDENCE, IDS, checks, nav, onboarding, open, png, sess, welcome, ws } from './helpers.mjs';

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


// REHEARSAL, not acceptance: the Veo provider adapter, video service, asset store and worker reconciliation are the real code; only the HTTPS transport to Vertex AI and the GCS copy are a
// local stand-in that finishes an operation with a genuine H.264 9:16 MP4 (see qa/real-backend/server.mjs). It exists to find product-wiring blockers before any paid provider call.
test('VIDEO rehearsal (stand-in transport): TikTok video -> price -> confirm -> pending operation polled to completion -> attach -> review -> approve -> a playable video', async ({ page }) => {
  const seen = await open(page); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await page.getByText('Add an image or video to this campaign').click();
  await page.getByLabel('Name', { exact: true }).fill('Spring reel'); await page.getByRole('radio', { name: 'Video' }).check(); await page.getByLabel('Platform', { exact: true }).selectOption('tiktok'); await page.getByLabel('Where on the platform').fill('feed'); await page.getByLabel('Account or page').fill('Northgate TikTok');
  await page.getByRole('button', { name: 'Add to the campaign' }).click();
  const vp = page.locator('details.ps-creative').filter({ hasText: 'Create the video for this post' }); await vp.getByText('Create the video for this post').click();
  await vp.getByLabel('Brief', { exact: true }).fill('A short vertical reveal of a new van on the forecourt');
  await vp.getByRole('button', { name: /Get the price for the video/ }).click();
  await expect(vp.getByRole('group', { name: 'Price' })).toContainText('6 credits'); await checks(page, 'video-price');
  await vp.getByRole('button', { name: /Confirm and set aside 6 credits/ }).click();
  await expect(vp.getByText(/6 credits used\./)).toBeVisible({ timeout: 60000 });
  await expect(vp.getByLabel('Video result').first()).toBeVisible(); await checks(page, 'video-finished');
  await vp.getByRole('button', { name: 'Attach to this post' }).click(); await expect(vp.getByText(/Attached to the post/)).toBeVisible();
  const h264 = await page.evaluate(() => !!document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"'));
  const vid = vp.locator('video');
  if (h264) await expect(vid.first()).toBeVisible({ timeout: 30000 }); else await expect(vp.getByText(/couldn.t be displayed in your browser/).first()).toBeVisible({ timeout: 30000 });
  // The backend validated these bytes with ffprobe (H.264, 720x1280, 4 s, no audio) before the asset existed. Decoding needs an H.264-capable browser; open-source Chromium has none.
  if (h264) await expect.poll(() => vid.first().evaluate((v) => v.readyState >= 1 && v.videoWidth === 720 && v.videoHeight === 1280 && v.duration > 3), { timeout: 30000 }).toBe(true); // 9:16, 4 s, decoded by the browser
  else test.info().annotations.push({ type: 'playback', description: 'not decoded: this Chromium has no H.264; bytes verified by the backend inspector and delivery check below' });
  await vp.getByRole('button', { name: 'Send for review' }).click(); await expect(page.getByText('Ready for review')).toBeVisible();
  await page.getByRole('button', { name: 'Render preview' }).click(); await expect(page.getByText(/Preview rendered\. Step 2 of 3/)).toBeVisible();
  await page.getByRole('button', { name: 'Acknowledge preview' }).click(); await expect(page.getByText(/Step 3 of 3/)).toBeVisible();
  await page.getByRole('button', { name: /^Approve/ }).click(); await expect(page.getByText(/Approved/).first()).toBeVisible({ timeout: 15000 });
  const approvedVid = page.locator('.creative-assets video'); if (h264) await expect(approvedVid.first()).toBeVisible({ timeout: 30000 }); else await expect(page.locator('.creative-assets').getByText(/couldn.t be displayed in your browser/).first()).toBeVisible({ timeout: 30000 });
  await expect(page.locator('.creative-fit-ok').filter({ hasText: /Suits TikTok/ }).first()).toBeVisible(); await expect(page.locator('.creative-facts').filter({ hasText: '720×1280 · 4 s' }).first()).toBeVisible(); // platform fit + measured facts shown to the customer
  if (h264) await expect.poll(async () => { await approvedVid.first().evaluate((v) => { v.muted = true; return v.play().catch(() => {}); }); await page.waitForTimeout(900); return approvedVid.first().evaluate((v) => v.currentTime); }, { timeout: 25000 }).toBeGreaterThan(0.3);
  // (with H.264 support the element may be re-rendered once after approval, so playback is retried)
  expect(seen.bad).toEqual([]); await checks(page, 'video-approved'); expect(seen.errors).toEqual([]);
});

// FAILURE PATH, end to end: the stand-in provider returns a video the product must refuse (it has an audio track). The backend measures the real bytes, rejects them, releases the
// reservation and settles nothing; the customer sees why, is told they were not charged, and the failed job is still there after a reload.
test('VIDEO rejected by media validation: reason shown, no charge, still visible after reload', async ({ page }) => {
  const seen = await open(page); await page.goto('/'); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await page.getByText('Add an image or video to this campaign').click();
  await page.getByLabel('Name', { exact: true }).fill('Rejected reel'); await page.getByRole('radio', { name: 'Video' }).check(); await page.getByLabel('Platform', { exact: true }).selectOption('tiktok'); await page.getByLabel('Where on the platform').fill('feed'); await page.getByLabel('Account or page').fill('Northgate TikTok');
  await page.getByRole('button', { name: 'Add to the campaign' }).click();
  const vp = () => page.locator('details.ps-creative').filter({ hasText: 'Create the video for this post' }).last();
  await vp().getByText('Create the video for this post').click();
  await vp().getByLabel('Brief', { exact: true }).fill('BG-REJECT a vertical reveal');
  await vp().getByRole('button', { name: /Get the price for the video/ }).click();
  await expect(vp().getByRole('group', { name: 'Price' })).toContainText('6 credits');
  await vp().getByRole('button', { name: /Confirm and set aside 6 credits/ }).click();
  await expect(vp().getByText(/did not pass BizGenie.s format and quality checks/).first()).toBeVisible({ timeout: 90000 });
  await expect(vp().getByText(/You were not charged/).first()).toBeVisible(); await checks(page, 'video-rejected');
  expect(seen.errors.filter((e) => !/VIDEO_OUTPUT_INVALID|502|failed/i.test(String(e)))).toEqual([]);
  await page.reload(); await welcome(page);
  await nav(page).getByRole('button', { name: 'Campaign Studio', exact: true }).click();
  await vp().getByText('Create the video for this post').click();
  await expect(vp().getByText(/Not made/).first()).toBeVisible({ timeout: 30000 });
  await expect(vp().getByText(/did not pass BizGenie.s format and quality checks/).first()).toBeVisible();
});
