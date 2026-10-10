import { test, expect } from '@playwright/test';

test('six-step demo remains isolated and traversable', async ({ page }) => {
  const remote = [];
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:4178/')) remote.push(req.url()); });
  await page.goto('/studio-preview/');
  await expect(page.getByText('DEMO · No live account')).toBeVisible();
  await page.getByRole('button', { name: /Start creating/ }).click();
  await expect(page.getByText('Tell us about your business.')).toBeVisible();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.locator('#name')).toBeFocused();
  await page.locator('#name').fill('Northside Studio');
  await page.locator('#website').fill('invalid-site');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.locator('#website')).toBeFocused();
  await page.locator('#website').fill('https://example.com');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.getByRole('button', { name: /More customers/ }).click();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.locator('#voice').fill('Warm, helpful and clear');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.getByRole('button', { name: /Instagram/ }).click();
  await page.getByRole('button', { name: /Review proposal/ }).click();
  await expect(page.getByText(/Northside Studio · Campaign direction/)).toBeVisible();
  await expect(page.locator('.summary')).toContainText('Instagram');
  await expect(page.locator('.summary')).toContainText('More customers');
  await page.getByRole('button', { name: /Restart preview/ }).click();
  await expect(page.getByText('Great marketing starts with a great idea.')).toBeVisible();
  expect(remote).toEqual([]);
});

test('user-provided business text is escaped', async ({ page }) => {
  await page.goto('/studio-preview/');
  await page.getByRole('button', { name: /Start creating/ }).click();
  await page.locator('#name').fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: /^Continue/ }).click();
  await page.getByRole('button', { name: /More customers/ }).click();
  await page.getByRole('button', { name: /^Continue/ }).click();
  await expect(page.locator('img')).toHaveCount(0);
  await expect(page.getByText(/<img src=x onerror=alert\(1\)>/)).toBeVisible();
});

test('mobile content does not overflow viewport', async ({ page }) => {
  await page.goto('/studio-preview/');
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, viewport: innerWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.viewport);
});
