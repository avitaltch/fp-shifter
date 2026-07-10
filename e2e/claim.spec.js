import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth.js';

const USER_ID = 'user-1';

const profile = {
  id: USER_ID,
  first_name: 'דנה',
  last_name: 'לוי',
  role: 'Employee',
};

const openShift = {
  id: 'item-open',
  service_type_id: 'svc-1',
  work_date: '2030-01-20',
  start_time: '10:00:00',
  end_time: '11:00:00',
  user_id: null,
  deleted_at: null,
  status: 'Scheduled',
  service_types: { name: 'צבע' },
  appointments: {
    visit_date: '2030-01-20',
    customers: { first_name: 'יעל', last_name: 'כהן' },
  },
};

test.describe('Claim Open Shift E2E', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAs(page, {
      userId: USER_ID,
      email: 'employee@test.com',
      profile,
    });
  });

  test('Employee can claim an eligible open shift', async ({ page }) => {
    // getClaimableShifts: open items + skills + availabilities + my assignments
    await page.route('**/rest/v1/appointment_items*', async (route) => {
      const url = route.request().url();
      if (url.includes('user_id=is.null')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([openShift]),
        });
        return;
      }
      // Existing assignments for the user (conflict check)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/employee_skills*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, service_type_id: 'svc-1' }]),
      });
    });

    await page.route('**/rest/v1/availabilities*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user_id: USER_ID,
            available_date: '2030-01-20',
            start_time: '08:00:00',
            end_time: '16:00:00',
          },
        ]),
      });
    });

    await page.route('**/rest/v1/rpc/claim_shift*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item_id: openShift.id, user_id: USER_ID }),
      });
    });

    await page.goto('/employee/recommendations');
    await expect(page.getByRole('heading', { name: 'משמרות פתוחות' })).toBeVisible();
    await expect(page.getByText('צבע')).toBeVisible();

    await page.getByRole('button', { name: /אני פנוי\/ה/ }).click();

    await expect(page.getByText('מעולה! המשמרת שובצה אליך בהצלחה.')).toBeVisible();
    await expect(page.getByText('אין משמרות פתוחות כרגע. הכל מתוקתק!')).toBeVisible();
  });

  test('Shows SHIFT_TAKEN when another employee claimed first', async ({ page }) => {
    await page.route('**/rest/v1/appointment_items*', async (route) => {
      const url = route.request().url();
      if (url.includes('user_id=is.null')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([openShift]),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });
    await page.route('**/rest/v1/employee_skills*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ user_id: USER_ID, service_type_id: 'svc-1' }]),
      });
    });
    await page.route('**/rest/v1/availabilities*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            user_id: USER_ID,
            available_date: '2030-01-20',
            start_time: '08:00:00',
            end_time: '16:00:00',
          },
        ]),
      });
    });

    await page.route('**/rest/v1/rpc/claim_shift*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'P0001',
          message: 'SHIFT_TAKEN',
          details: null,
          hint: null,
        }),
      });
    });

    await page.goto('/employee/recommendations');
    await page.getByRole('button', { name: /אני פנוי\/ה/ }).click();

    await expect(page.getByText('המשמרת כבר שובצה לעובד אחר.')).toBeVisible();
  });
});
