import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// Employee flows behind ProtectedRoute. The Supabase session is seeded into
// localStorage (the role itself comes from the stubbed public.users profile
// fetch, matching the app's AuthContext) and every REST/auth call is
// intercepted, so the suite runs without a live database.

const USER_ID = 'user-1';

// The supabase-js storage key is `sb-<project-ref>-auth-token`. Derive the
// ref from the environment instead of hardcoding it: prefer the process env
// var and fall back to parsing the project .env file Vite itself uses.
function resolveSupabaseUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env');
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^\s*VITE_SUPABASE_URL\s*=\s*["']?([^"'\r\n]+)/m);
  if (!match) {
    throw new Error('VITE_SUPABASE_URL not found in the environment or .env');
  }
  return match[1].trim();
}

const projectRef = new URL(resolveSupabaseUrl()).hostname.split('.')[0];
const storageKey = `sb-${projectRef}-auth-token`;

const mockUser = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'employee@test.com',
  user_metadata: {},
  app_metadata: { provider: 'email' },
  created_at: '2026-01-01T00:00:00Z',
};

const mockSession = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  user: mockUser,
};

// Row in public.users — this (not user_metadata) is where the role lives.
const mockProfile = {
  id: USER_ID,
  first_name: 'דנה',
  last_name: 'לוי',
  role: 'Employee',
};

async function authenticateAsEmployee(page) {
  // Seed the persisted session before any app code runs
  await page.addInitScript(
    ([key, session]) => {
      window.localStorage.setItem(key, JSON.stringify(session));
    },
    [storageKey, mockSession]
  );

  // Any auth endpoint the client touches (user fetch, token refresh, logout)
  await page.route('**/auth/v1/user*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockUser),
    });
  });
  await page.route('**/auth/v1/token*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSession),
    });
  });
  await page.route('**/auth/v1/logout*', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  // AuthContext profile fetch: from('users')...single() -> a single object
  await page.route('**/rest/v1/users*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockProfile),
    });
  });
}

test.describe('Employee Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await authenticateAsEmployee(page);
  });

  test('Employee can add availability', async ({ page }) => {
    const createdEntry = {
      id: 'avail-1',
      user_id: USER_ID,
      available_date: '2030-01-15',
      start_time: '08:00:00',
      end_time: '16:00:00',
      notes: null,
    };

    await page.route('**/rest/v1/availabilities*', async (route) => {
      const method = route.request().method();
      if (method === 'POST') {
        // insert(...).select().single() -> a single created row
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(createdEntry),
        });
      } else {
        // Initial listMyAvailability
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([]),
        });
      }
    });

    await page.goto('/employee/availability');

    // ProtectedRoute let the Employee through
    await expect(
      page.getByRole('heading', { name: 'הזנת זמינות - אזור אישי' })
    ).toBeVisible();
    await expect(page.getByText('עדיין לא הוזנה זמינות עתידית.')).toBeVisible();

    await page.locator('#date-input').fill('2030-01-15');
    await page.getByRole('button', { name: 'שמור זמינות' }).click();

    // Inline success message (no alert() anymore) + the entry in the list
    // (scoped to the list — the success message repeats the same times)
    await expect(page.getByText(/זמינות נשמרה/)).toBeVisible();
    await expect(
      page.locator('.availability-entry').getByText(/08:00-\s*16:00/)
    ).toBeVisible();
  });

  test('Employee sees start/end validation inline', async ({ page }) => {
    await page.route('**/rest/v1/availabilities*', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.goto('/employee/availability');
    await page.locator('#date-input').fill('2030-01-15');
    await page.locator('#start-time').selectOption('16:00');
    await page.locator('#end-time').selectOption('16:00');
    await page.getByRole('button', { name: 'שמור זמינות' }).click();

    await expect(
      page.getByText('שעת הסיום חייבת להיות אחרי שעת ההתחלה.')
    ).toBeVisible();
  });

  test('Employee can view shifts and advance their status', async ({ page }) => {
    const shift = {
      id: 'task-1',
      user_id: USER_ID,
      work_date: '2030-01-15',
      start_time: '10:00:00',
      end_time: '11:00:00',
      status: 'Scheduled',
      service_types: { name: 'עיסוי' },
      appointments: {
        visit_date: '2030-01-15',
        customers: { first_name: 'רות', last_name: 'מזרחי' },
      },
    };

    await page.route('**/rest/v1/appointment_items*', async (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        // Guarded update(...).select() -> array with the updated row
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{ ...shift, status: 'In_Progress' }]),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([shift]),
        });
      }
    });

    await page.goto('/employee/shifts');

    // Header shows the profile name from public.users
    await expect(
      page.getByRole('heading', { name: /המשמרות שלי - דנה לוי/ })
    ).toBeVisible();
    await expect(page.getByText('עיסוי')).toBeVisible();
    await expect(page.getByText(/רות מזרחי/)).toBeVisible();

    const statusBtn = page.getByRole('button', { name: 'מתוכנן - לחץ להתחלה' });
    await expect(statusBtn).toBeVisible();
    await statusBtn.click();

    await expect(
      page.getByRole('button', { name: 'בביצוע - לחץ לסיום' })
    ).toBeVisible();
  });
});
