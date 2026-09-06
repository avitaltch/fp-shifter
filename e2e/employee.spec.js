import { expect, test } from '@playwright/test';
import { authenticateAs, fulfillJson } from './helpers/auth.js';

test.describe('provider operations', () => {
  test.beforeEach(async ({ page }) => authenticateAs(page, { role: 'Provider' }));

  test('views the personal schedule and advances a step status', async ({ page }) => {
    const startsAt = new Date(Date.now() + 60 * 60_000).toISOString();
    const step = {
      id: 'step-1',
      status: 'Scheduled',
      serviceName: 'טיפוח',
      customerFirstName: 'רות',
      customerLastName: 'מזרחי',
      startsAt,
      endsAt: new Date(Date.parse(startsAt) + 45 * 60_000).toISOString(),
      timezone: 'Asia/Jerusalem',
    };
    await page.route('**/api/v1/operator/me/steps?**', (route) => fulfillJson(route, [step]));
    await page.route('**/api/v1/operator/steps/step-1/status', (route) =>
      fulfillJson(route, { ...step, status: 'InProgress' })
    );
    await page.goto('/employee/shifts');
    await expect(page.getByText('טיפוח')).toBeVisible();
    await page.getByRole('button', { name: 'מתוכנן - לחץ להתחלה' }).click();
    await expect(page.getByRole('button', { name: 'בביצוע - לחץ לסיום' })).toBeVisible();
  });

  test('creates availability only through the authenticated NestJS API', async ({ page }) => {
    const date = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    await page.route('**/api/v1/operator/locations', (route) => fulfillJson(route, [{
      id: '00000000-0000-4000-8000-000000000101', name: 'ראשי',
      timezone: 'Asia/Jerusalem', address: null, isPrimary: true,
    }]));
    await page.route('**/api/v1/operator/availability?**', (route) => fulfillJson(route, []));
    await page.route('**/api/v1/operator/availability', (route) => fulfillJson(route, [{
      id: 'availability-1', locationId: '00000000-0000-4000-8000-000000000101',
      providerUserId: 'user-1', kind: 'Available',
      startsAt: `${date}T05:00:00.000Z`, endsAt: `${date}T13:00:00.000Z`, notes: null,
    }], 201));
    await page.goto('/employee/availability');
    await page.locator('#date-input').fill(date);
    await page.getByRole('button', { name: /שמור זמינות/ }).click();
    await expect(page.getByText(/זמינות נשמרה/)).toBeVisible();
  });
});
