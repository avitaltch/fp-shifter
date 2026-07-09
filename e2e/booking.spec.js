import { test, expect } from '@playwright/test';

// Test Data
const mockServices = [
  { id: 's1', name: 'תספורת', base_price: 150, default_duration: 45 },
  { id: 's2', name: 'צבע', base_price: 200, default_duration: 120 }
];

test.describe('Booking Flow E2E', () => {

  test.beforeEach(async ({ page }) => {
    // Intercept Supabase API call to return mock data
    await page.route('**/rest/v1/service_types*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockServices)
      });
    });
  });

  test('Happy Path: User can complete a booking', async ({ page }) => {
    await page.goto('/booking');

    // Check that services loaded
    await expect(page.getByText('תספורת')).toBeVisible();
    await expect(page.getByText('₪150')).toBeVisible();

    // Select service
    await page.getByText('תספורת').click();

    // Fill date
    await page.locator('#visitDate').fill('2026-10-15');

    // Select time
    await page.locator('#visitTime').selectOption('10:00');

    // Ensure submit button is enabled
    const submitBtn = page.getByRole('button', { name: 'אשרי הזמנה' });
    await expect(submitBtn).toBeEnabled();

    // Submit
    await submitBtn.click();

    // Wait for success page
    await expect(page).toHaveURL(/.*\/booking\/success/);
    await expect(page.getByText('התור שלך נקבע בהצלחה!')).toBeVisible();
  });

  test('Edge Case: Network Error on Services Load', async ({ page }) => {
    // Override route to fail
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route('**/rest/v1/service_types*', async route => {
      await route.abort('failed');
    });

    await page.goto('/booking');

    // Should show error state
    await expect(page.getByText('שגיאה בטעינת השירותים. אנא רענני את העמוד.')).toBeVisible({ timeout: 10000 });
  });

  test('Edge Case: Empty Services State', async ({ page }) => {
    // Override route to return empty array
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route('**/rest/v1/service_types*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.goto('/booking');

    // Should show empty state
    await expect(page.getByText('לא נמצאו שירותים זמינים כרגע.')).toBeVisible();
  });

  test('Edge Case: Double click prevention', async ({ page }) => {
    await page.goto('/booking');

    await page.getByText('תספורת').click();
    await page.locator('#visitDate').fill('2026-10-15');
    await page.locator('#visitTime').selectOption('10:00');

    const submitBtn = page.getByRole('button', { name: 'אשרי הזמנה' });
    
    // Click once
    await submitBtn.click();
    
    // Immediately check that button says "מעבד..." and is disabled
    await expect(page.getByRole('button', { name: 'מעבד...' })).toBeDisabled();
  });
});
