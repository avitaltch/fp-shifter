import { test, expect } from '@playwright/test';

// Mobile viewport smoke for the public booking flow (network-stubbed).
// Uses Chromium with a phone viewport so CI only needs one browser binary.

const mockServices = [
  { id: 's1', name: 'תספורת', description: '', base_price: 150, default_duration: 45 },
];

const mockSlots = [
  { slot_start: '10:00:00', slot_end: '10:45:00' },
  { slot_start: '11:00:00', slot_end: '11:45:00' },
];

function addDaysLocal(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const visitDate = addDaysLocal(7);

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});

test.describe('Mobile booking', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/rest/v1/service_types*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockServices),
      });
    });
    await page.route('**/rest/v1/rpc/get_available_slots*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSlots),
      });
    });
    await page.route('**/rest/v1/rpc/book_appointment*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'booking-1',
          visit_date: visitDate,
          start_time: '10:00:00',
          total_duration: 45,
          total_price: 150,
          status: 'Pending',
        }),
      });
    });
  });

  test('opens the nav drawer and completes a booking on a phone viewport', async ({ page }) => {
    await page.goto('/');

    const menuToggle = page.locator('.menu-icon');
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();
    await expect(page.locator('.nav-menu')).toHaveClass(/active/);
    await expect(page.locator('.nav-backdrop')).toBeVisible();

    await page.locator('.nav-menu').getByRole('link', { name: 'הזמנת תור', exact: true }).click();
    await expect(page).toHaveURL(/\/book$/);
    await expect(page.locator('.nav-menu')).not.toHaveClass(/active/);

    await page.locator('.service-card', { hasText: 'תספורת' }).click();
    await page.locator('#visitDate').fill(visitDate);
    await expect(page.locator('.slot-chip', { hasText: '10:00' })).toBeVisible();
    await page.locator('.slot-chip', { hasText: '10:00' }).click();

    await page.locator('#firstName').fill('דנה');
    await page.locator('#lastName').fill('לוי');
    await page.locator('#phone').fill('050-1234567');

    const summary = page.locator('.booking-summary');
    await expect(summary).toBeVisible();
    await summary.getByRole('button', { name: 'אישור הזמנה' }).click();

    await expect(page).toHaveURL(/\/book\/success/);
    await expect(page.getByRole('heading', { name: /התור שלך נקבע בהצלחה/ })).toBeVisible();
  });
});
