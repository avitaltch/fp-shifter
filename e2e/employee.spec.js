import { test, expect } from '@playwright/test';

test.describe('Employee Flow E2E', () => {
  
  test.beforeEach(async ({ page }) => {
    // Mock the session
    await page.route('**/auth/v1/user', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'user123',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'employee@test.com',
          user_metadata: { full_name: 'Jane Employee' }
        })
      });
    });

    // Mock initial getSession in supabase js (often it checks local storage or hits token endpoint)
    await page.addInitScript(() => {
      window.localStorage.setItem('sb-qskkmhtlihvkuandptkm-auth-token', JSON.stringify({
        access_token: 'fake-access-token',
        refresh_token: 'fake-refresh-token',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: 'user123', user_metadata: { full_name: 'Jane Employee' } }
      }));
    });
  });

  test('Employee can submit availability', async ({ page }) => {
    // Mock insert availability
    await page.route('**/rest/v1/availabilities*', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify([{}])
        });
      } else {
        await route.continue();
      }
    });

    // We can handle alerts
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('נשמרה בהצלחה');
      await dialog.accept();
    });

    await page.goto('/employee/availability');
    
    // Fill form
    await page.fill('input[type="date"]', '2026-10-15');
    
    const startTimeSelect = page.locator('select').first();
    await startTimeSelect.selectOption('10:00');
    
    const endTimeSelect = page.locator('select').nth(1);
    await endTimeSelect.selectOption('16:00');
    
    // Submit
    await page.click('button:has-text("שמירת זמינות")');
    
    // Wait a bit for the dialog to be handled
    await page.waitForTimeout(500);
  });

  test('Employee can view shifts and change status', async ({ page }) => {
    // Mock fetch tasks
    await page.route('**/rest/v1/appointment_items*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([
            {
              id: 'task123',
              start_time: '10:00:00',
              end_time: '11:00:00',
              status: 'Scheduled',
              appointments: { visit_date: '2026-10-15', customers: { first_name: 'John', last_name: 'Doe' } },
              service_types: { name: 'Massage' }
            }
          ])
        });
      } else if (route.request().method() === 'PATCH') {
        // Mock the status update
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify([{}])
        });
      } else {
        await route.continue();
      }
    });

    await page.goto('/employee/shifts');
    
    // Check if shift is rendered
    await expect(page.locator('text=Massage')).toBeVisible();
    await expect(page.locator('text=John Doe')).toBeVisible();
    
    // Status should be Scheduled
    const statusBtn = page.locator('button:has-text("מתוכנן")');
    await expect(statusBtn).toBeVisible();
    
    // Click to change status
    await statusBtn.click();
    
    // Should change to In Progress
    await expect(page.locator('button:has-text("בביצוע")')).toBeVisible();
  });
});
