import { expect, test } from '@playwright/test';
import { installApiConfig } from './helpers/auth.js';

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

test('mobile navigation opens and reaches the tenant booking entry', async ({ page }) => {
  await installApiConfig(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'פתח תפריט' }).click();
  await expect(page.locator('.nav-backdrop')).toBeVisible();
  await page.locator('.nav-menu').getByRole('link', { name: 'הזמנת תור' }).click();
  await expect(page).toHaveURL(/\/book$/);
  await expect(page.getByLabel('קוד העסק')).toBeVisible();
});
