import { test, expect } from '@playwright/test';
import { authenticateAs } from './helpers/auth.js';

const ADMIN_ID = 'admin-1';
const EMP_ID = 'emp-2';

const adminProfile = {
  id: ADMIN_ID,
  first_name: 'דנה',
  last_name: 'לוי',
  role: 'Admin',
};

const staff = [
  adminProfile,
  { id: EMP_ID, first_name: 'יוסי', last_name: 'כהן', role: 'Employee' },
];

const openItem = {
  id: 'item-open',
  service_type_id: 'svc-1',
  work_date: '2030-01-20',
  start_time: '10:00:00',
  end_time: '11:00:00',
  user_id: null,
  deleted_at: null,
  status: 'Scheduled',
  service_types: { name: 'תספורת' },
  appointments: {
    visit_date: '2030-01-20',
    customers: { first_name: 'רות', last_name: 'מזרחי' },
  },
};

async function stubJson(page, urlGlob, body, { methods } = {}) {
  await page.route(urlGlob, async (route) => {
    if (methods && !methods.includes(route.request().method())) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}

test.describe('Admin Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAs(page, {
      userId: ADMIN_ID,
      email: 'admin@test.com',
      profile: adminProfile,
    });
  });

  test('Admin can assign an unassigned shift to an eligible employee', async ({ page }) => {
    // getAssignmentData parallel fetches
    await page.route('**/rest/v1/appointment_items*', async (route) => {
      const url = route.request().url();
      // Open shifts: user_id=is.null ; assignments: user_id=not.is.null
      if (url.includes('user_id=is.null')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([openItem]),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/users*', async (route) => {
      const url = route.request().url();
      if (url.includes(`id=eq.${ADMIN_ID}`)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(adminProfile),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(staff),
      });
    });

    await stubJson(page, '**/rest/v1/employee_skills*', [
      { user_id: EMP_ID, service_type_id: 'svc-1' },
    ]);
    await stubJson(page, '**/rest/v1/availabilities*', [
      {
        user_id: EMP_ID,
        available_date: '2030-01-20',
        start_time: '08:00:00',
        end_time: '16:00:00',
      },
    ]);

    // Assignment goes through assign_shift RPC (not a direct PATCH).
    await page.route('**/rest/v1/rpc/assign_shift*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ item_id: openItem.id, user_id: EMP_ID }),
      });
    });

    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/admin/assign');
    await expect(page.getByRole('heading', { name: 'שיבוץ משמרות' })).toBeVisible();
    await expect(page.getByText('תספורת')).toBeVisible();
    await expect(page.getByText(/רות מזרחי/)).toBeVisible();

    await page.locator('.employee-select').selectOption(EMP_ID);

    await expect(page.getByText('השיבוץ בוצע בהצלחה.')).toBeVisible();
    await expect(page.getByText('מעולה! כל הטיפולים שובצו בהצלחה.')).toBeVisible();
  });

  test('Admin can cancel an appointment from the dashboard', async ({ page }) => {
    const today = (() => {
      const d = new Date();
      const pad = (x) => String(x).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    })();

    const appointment = {
      id: 'apt-1',
      visit_date: today,
      status: 'Confirmed',
      customers: { first_name: 'רות', last_name: 'מזרחי' },
      appointment_items: [
        {
          id: 'item-1',
          user_id: EMP_ID,
          start_time: '10:00:00',
          end_time: '11:00:00',
          service_types: { name: 'תספורת' },
          users: { first_name: 'יוסי', last_name: 'כהן' },
        },
      ],
    };

    await page.route('**/rest/v1/appointments*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([appointment]),
      });
    });

    // staff count (Prefer: count=exact)
    await page.route('**/rest/v1/users*', async (route) => {
      const url = route.request().url();
      if (url.includes(`id=eq.${ADMIN_ID}`)) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(adminProfile),
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/3' },
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/rpc/cancel_appointment*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: 'null',
      });
    });

    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/admin/dashboard');
    await expect(page.getByRole('heading', { name: /דאשבורד מנהל/ })).toBeVisible();
    await expect(page.getByText(/רות מזרחי/)).toBeVisible();

    await page.getByRole('button', { name: /ביטול התור של רות/ }).click();

    await expect(page.getByText('התור בוטל והשעות שוחררו.')).toBeVisible();
    await expect(page.getByText(/רות מזרחי/)).toHaveCount(0);
  });
});
