import { test, expect } from '@playwright/test';

// Customer booking flow against the real app routes (/book, /book/success).
// All Supabase traffic (REST + RPC) is stubbed with page.route so the suite
// runs without a live database.

const mockServices = [
  { id: 's1', name: 'תספורת', description: '', base_price: 150, default_duration: 45 },
  { id: 's2', name: 'צבע', description: '', base_price: 200, default_duration: 120 },
];

const mockSlots = [
  { slot_start: '10:00:00', slot_end: '10:45:00' },
  { slot_start: '11:00:00', slot_end: '11:45:00' },
];

// A date inside the booking window (min = today, max = today + 60 days).
function addDaysLocal(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
const visitDate = addDaysLocal(7);

const mockBooking = {
  id: 'booking-1',
  visit_date: visitDate,
  start_time: '10:00:00',
  total_duration: 45,
  total_price: 150,
  status: 'Pending',
};

async function stubServices(page, services = mockServices) {
  await page.route('**/rest/v1/service_types*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(services),
    });
  });
}

async function stubSlots(page, slots = mockSlots) {
  await page.route('**/rest/v1/rpc/get_available_slots*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(slots),
    });
  });
}

async function stubBookAppointment(page) {
  await page.route('**/rest/v1/rpc/book_appointment*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockBooking),
    });
  });
}

// Select a service, pick date + slot, fill personal details.
async function fillBookingForm(page, { phone = '050-1234567' } = {}) {
  await page.locator('.service-card', { hasText: 'תספורת' }).click();
  await page.locator('#visitDate').fill(visitDate);
  await page.locator('#visitTime').selectOption('10:00:00');
  await page.locator('#firstName').fill('דנה');
  await page.locator('#lastName').fill('לוי');
  await page.locator('#phone').fill(phone);
}

test.describe('Booking Flow E2E', () => {
  test.beforeEach(async ({ page }) => {
    await stubServices(page);
    await stubSlots(page);
    await stubBookAppointment(page);
  });

  test('Landing page leads to the /book route', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('link', { name: 'הזמנת תור חדש' }).click();

    await expect(page).toHaveURL(/\/book$/);
    await expect(page.getByRole('heading', { name: 'הזמנת תור חדש' })).toBeVisible();
    await expect(page.locator('.service-card', { hasText: 'תספורת' })).toBeVisible();
  });

  test('Happy path: services -> slots from RPC -> booking -> success page', async ({ page }) => {
    await page.goto('/book');

    // Services loaded from the stubbed REST endpoint
    const haircutCard = page.locator('.service-card', { hasText: 'תספורת' });
    await expect(haircutCard).toBeVisible();
    await expect(haircutCard.locator('.price')).toHaveText('₪150');

    // Selecting a service + date surfaces the slot dropdown fed by the RPC stub
    await haircutCard.click();
    await page.locator('#visitDate').fill(visitDate);
    const timeSelect = page.locator('#visitTime');
    await expect(timeSelect).toBeVisible();
    await expect(timeSelect.locator('option', { hasText: '10:00' })).toHaveCount(1);
    await timeSelect.selectOption('10:00:00');

    await page.locator('#firstName').fill('דנה');
    await page.locator('#lastName').fill('לוי');
    await page.locator('#phone').fill('050-1234567');

    const submitBtn = page.getByRole('button', { name: 'אישור הזמנה' });
    await expect(submitBtn).toBeEnabled();
    await submitBtn.click();

    // Success page renders the booking passed via router state
    await expect(page).toHaveURL(/\/book\/success$/);
    await expect(page.getByText('התור שלך נקבע בהצלחה!')).toBeVisible();
    await expect(page.getByText('שירותים:')).toBeVisible();
    await expect(page.getByText('₪150')).toBeVisible();
  });

  test('Edge case: network error on services load', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await page.route('**/rest/v1/service_types*', async (route) => {
      await route.abort('failed');
    });

    await page.goto('/book');

    await expect(
      page.getByText('שגיאה בטעינת השירותים. יש לנסות שוב מאוחר יותר.')
    ).toBeVisible({ timeout: 10000 });
  });

  test('Edge case: empty services state', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await stubServices(page, []);

    await page.goto('/book');

    await expect(page.getByText('לא נמצאו שירותים זמינים כרגע.')).toBeVisible();
  });

  test('Edge case: no free slots for the chosen date', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await stubServices(page);
    await stubSlots(page, []);

    await page.goto('/book');
    await page.locator('.service-card', { hasText: 'תספורת' }).click();
    await page.locator('#visitDate').fill(visitDate);

    await expect(
      page.getByText('אין שעות פנויות בתאריך זה. יש לבחור תאריך אחר.')
    ).toBeVisible();
  });

  test('Edge case: invalid phone shows an inline error, no navigation', async ({ page }) => {
    await page.goto('/book');
    await fillBookingForm(page, { phone: 'abc-invalid' });

    await page.getByRole('button', { name: 'אישור הזמנה' }).click();

    await expect(page.getByText('מספר הטלפון אינו תקין.')).toBeVisible();
    await expect(page).toHaveURL(/\/book$/);
  });

  test('Edge case: SLOT_TAKEN race shows a friendly error and stays on the form', async ({ page }) => {
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await stubServices(page);
    await stubSlots(page);
    // PostgREST-style error raised by the book_appointment function
    await page.route('**/rest/v1/rpc/book_appointment*', async (route) => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'P0001',
          message: 'SLOT_TAKEN',
          details: null,
          hint: null,
        }),
      });
    });

    await page.goto('/book');
    await fillBookingForm(page);

    await page.getByRole('button', { name: 'אישור הזמנה' }).click();

    await expect(
      page.getByText('השעה שנבחרה נתפסה זה עתה. יש לבחור שעה אחרת.')
    ).toBeVisible();
    await expect(page).toHaveURL(/\/book$/);
  });
});
