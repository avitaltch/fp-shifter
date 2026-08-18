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

// Select a service, pick date + slot chip, fill personal details.
async function fillBookingForm(page, { phone = '050-1234567' } = {}) {
  await page.locator('.service-card', { hasText: 'תספורת' }).click();
  await page.locator('#visitDate').fill(visitDate);
  await page.locator('.slot-chip', { hasText: '10:00' }).click();
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

    // Selecting a service + date surfaces the slot chips fed by the RPC stub
    await haircutCard.click();
    await page.locator('#visitDate').fill(visitDate);
    const slotChip = page.locator('.slot-chip', { hasText: '10:00' });
    await expect(slotChip).toBeVisible();
    await expect(page.locator('.slot-chip', { hasText: '11:00' })).toBeVisible();
    await slotChip.click();
    await expect(slotChip).toHaveAttribute('aria-pressed', 'true');

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

  test('Business slug journey uses only the NestJS public contracts', async ({ page }) => {
    const serviceId = '00000000-0000-4000-8000-000000000401';
    const startsAt = `${visitDate}T07:00:00.000Z`;
    const endsAt = `${visitDate}T08:00:00.000Z`;
    const requests = [];
    const supabaseRequests = [];

    await page.addInitScript(() => {
      window.__APP_CONFIG__ = Object.freeze({
        API_URL: 'http://localhost:5173/api/v1',
      });
    });
    page.on('request', (request) => {
      if (request.url().includes('/rest/v1/')) supabaseRequests.push(request.url());
    });
    await page.route('**/api/v1/public/businesses/happy-pets-demo/**', async (route) => {
      const request = route.request();
      requests.push({
        url: request.url(),
        body: request.postDataJSON(),
        idempotencyKey: request.headers()['idempotency-key'],
      });
      if (request.url().endsWith('/catalog')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            business: {
              slug: 'happy-pets-demo',
              name: 'Happy Pets',
              locale: 'he-IL',
            },
            location: {
              name: 'תל אביב',
              address: null,
              timezone: 'Asia/Jerusalem',
            },
            services: [
              {
                id: serviceId,
                name: 'טיפוח מלא',
                description: 'טיפול מלא',
                durationMinutes: 60,
                priceMinor: 12_500,
                currency: 'ILS',
              },
            ],
          }),
        });
      }
      if (request.url().endsWith('/availability/search')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            slots: [{ startsAt, endsAt }],
            diagnostics: [],
          }),
        });
      }
      return route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          appointmentId: '00000000-0000-4000-8000-000000000999',
          status: 'Confirmed',
          startsAt,
          endsAt,
          totalPriceMinor: 12_500,
          currency: 'ILS',
          steps: [],
        }),
      });
    });

    await page.goto('/book/happy-pets-demo');
    await expect(
      page.getByRole('heading', { name: 'הזמנת תור אצל Happy Pets' })
    ).toBeVisible();
    await page.locator('.service-card', { hasText: 'טיפוח מלא' }).click();
    await page.locator('#visitDate').fill(visitDate);
    await page.locator('.slot-chip').first().click();
    await page.locator('#firstName').fill('דנה');
    await page.locator('#lastName').fill('לוי');
    await page.locator('#phone').fill('050-1234567');
    await page.getByRole('button', { name: 'אישור הזמנה' }).click();

    await expect(page).toHaveURL(/\/book\/happy-pets-demo\/success$/);
    await expect(
      page.getByRole('heading', { name: /התור שלך נקבע בהצלחה/ })
    ).toBeVisible();
    await expect(page.locator('.booking-details').getByText('₪125')).toBeVisible();
    const catalogRequests = requests.filter(({ url }) => url.endsWith('/catalog'));
    const availabilityRequests = requests.filter(({ url }) =>
      url.endsWith('/availability/search')
    );
    const bookingRequests = requests.filter(({ url }) => url.endsWith('/bookings'));
    expect(catalogRequests.length).toBeGreaterThanOrEqual(1);
    expect(availabilityRequests).toHaveLength(1);
    expect(bookingRequests).toHaveLength(1);
    expect(availabilityRequests[0].body).toEqual({
      date: visitDate,
      serviceIds: [serviceId],
    });
    expect(bookingRequests[0].body).toMatchObject({
      date: visitDate,
      startsAt,
      serviceIds: [serviceId],
      customer: { phoneE164: '+972501234567' },
    });
    expect(bookingRequests[0].idempotencyKey).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    );
    expect(supabaseRequests).toEqual([]);
  });

  test('Public no-slot journey registers ordered demand on the waitlist', async ({ page }) => {
    const serviceIds = ['service-trim', 'service-vaccine'];
    let waitlistRequest;
    await page.addInitScript(() => {
      window.__APP_CONFIG__ = Object.freeze({
        API_URL: 'http://localhost:5173/api/v1',
      });
    });
    await page.route('**/api/v1/public/businesses/happy-pets-demo/**', async (route) => {
      const request = route.request();
      if (request.url().endsWith('/catalog')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            business: { slug: 'happy-pets-demo', name: 'Happy Pets' },
            location: { name: 'תל אביב', timezone: 'Asia/Jerusalem' },
            services: serviceIds.map((id, index) => ({
              id,
              name: index === 0 ? 'תספורת' : 'חיסון',
              description: '',
              durationMinutes: 30,
              priceMinor: 5_000,
              currency: 'ILS',
            })),
          }),
        });
      }
      if (request.url().endsWith('/availability/search')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ slots: [], diagnostics: [] }),
        });
      }
      if (request.url().endsWith('/waitlist')) {
        waitlistRequest = request.postDataJSON();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({ waitlistEntryId: 'waitlist-1' }),
        });
      }
      return route.abort();
    });

    await page.goto('/book/happy-pets-demo');
    await page.locator('.service-card', { hasText: 'תספורת' }).click();
    await page.locator('.service-card', { hasText: 'חיסון' }).click();
    await page.locator('#visitDate').fill(visitDate);
    await expect(page.getByText('אין כרגע זמן שמתאים לכל השירותים')).toBeVisible();
    await page.locator('#firstName').fill('דנה');
    await page.locator('#lastName').fill('לוי');
    await page.locator('#phone').fill('050-1234567');
    await page.getByRole('button', { name: 'הצטרפות לרשימת ההמתנה' }).click();

    await expect(page.getByText(/נרשמת לרשימת ההמתנה/)).toBeVisible();
    expect(waitlistRequest).toMatchObject({
      serviceIds,
      customer: {
        firstName: 'דנה',
        lastName: 'לוי',
        phoneE164: '+972501234567',
      },
    });
    expect(Date.parse(waitlistRequest.windowStartsAt)).not.toBeNaN();
    expect(Date.parse(waitlistRequest.windowEndsAt)).not.toBeNaN();
  });

  test('Waitlist offer claims with an authorization header and no persistent token', async ({ page }) => {
    const token = `wo_${'a'.repeat(43)}`;
    let authorizationHeader;
    await page.addInitScript(() => {
      window.__APP_CONFIG__ = Object.freeze({
        API_URL: 'http://localhost:5173/api/v1',
      });
    });
    await page.route('**/api/v1/public/businesses/happy-pets-demo/**', async (route) => {
      const request = route.request();
      if (request.url().endsWith('/catalog')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            business: { slug: 'happy-pets-demo', name: 'Happy Pets' },
            location: { name: 'תל אביב', timezone: 'Asia/Jerusalem' },
            services: [{
              id: 'service-trim',
              name: 'תספורת',
              description: '',
              durationMinutes: 30,
              priceMinor: 5_000,
              currency: 'ILS',
            }],
          }),
        });
      }
      if (request.url().endsWith('/waitlist/offers/accept')) {
        authorizationHeader = request.headers().authorization;
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            appointmentId: 'appointment-1',
            status: 'Confirmed',
            startsAt: `${visitDate}T07:00:00.000Z`,
            endsAt: `${visitDate}T07:30:00.000Z`,
            totalPriceMinor: 5_000,
            currency: 'ILS',
            steps: [{ sequenceNumber: 1, serviceId: 'service-trim' }],
            managementToken: `sm_${'b'.repeat(43)}`,
            managementTokenExpiresAt: '2031-01-07T07:00:00.000Z',
          }),
        });
      }
      return route.abort();
    });

    await page.goto(`/waitlist/claim/happy-pets-demo#token=${token}`);

    await expect(page).toHaveURL(/\/waitlist\/claim\/happy-pets-demo$/);
    expect(authorizationHeader).toBeUndefined();
    await page.getByRole('button', { name: 'אישור וקביעת התור' }).click();
    await expect(page).toHaveURL(/\/book\/happy-pets-demo\/success$/);
    await expect(page.getByText('התור שלך נקבע בהצלחה!')).toBeVisible();
    expect(authorizationHeader).toBe(`Bearer ${token}`);
    expect(page.url()).not.toContain(token);
    expect(
      await page.evaluate(() => sessionStorage.getItem('bookingConfirmation'))
    ).toBeNull();
  });
});
