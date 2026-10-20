import { test, expect } from '@playwright/test';

test('V2 completes six-step founder journey with safe local state', async ({ page }) => {
  const outbound = [];
  page.on('request', req => { if (!req.url().startsWith('http://127.0.0.1:4178/')) outbound.push(req.url()); });
  await page.goto('/studio-preview/v2/');
  await expect(page.getByRole('heading', { name: 'Your marketing engine, ready to work.' })).toBeVisible();
  await page.getByRole('button', { name: /Let's get started/ }).click();
  await page.locator('#business').fill('Founder & <brand>');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.locator('#goals button[data-value="Launch a product"]').click();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.locator('#logo-preview')).toHaveText('FOUNDER & <BRAND>');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await page.locator('#channels button[data-value="LinkedIn"]').click();
  await page.getByRole('button', { name: /Review campaign/ }).click();
  await expect(page.locator('#brief-business')).toHaveText('Founder & <brand>');
  await expect(page.locator('#brief-goal')).toHaveText('Launch a product');
  await expect(page.locator('#brief-channels')).toContainText('LinkedIn');
  expect(await page.locator('script').count()).toBe(1);
  expect(outbound).toEqual([]);
});

test('V2 rejects blank business and preserves back navigation', async ({ page }) => {
  await page.goto('/studio-preview/v2/');
  await page.getByRole('button', { name: /Let's get started/ }).click();
  await page.locator('#business').fill('   ');
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.locator('#business-error')).toContainText('Enter your business name');
  await page.getByRole('button', { name: /Back/ }).click();
  await expect(page.getByRole('heading', { name: 'Your marketing engine, ready to work.' })).toBeVisible();
});

test('V2 has no horizontal page overflow', async ({ page }) => {
  await page.goto('/studio-preview/v2/');
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
  expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
});
