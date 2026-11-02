import { test, expect } from '@playwright/test';
test('portal displays real API/database readiness and truthful availability on desktop/mobile', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('A city beginswith a connection.');
  await expect(page.getByRole('status')).toHaveText('Database connected · schema v1');
  await expect(page.getByText('Playable worlds, shared identity and travel are not available yet.', { exact: false })).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Refresh status' })).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `artifacts/foundation-${test.info().project.name}.png`, fullPage: true });
});
