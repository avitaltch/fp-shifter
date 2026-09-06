import { expect, test } from '@playwright/test';
import { fulfillJson, installApiConfig } from './helpers/auth.js';

const serviceIds = ['00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000402'];

function futureDate(days = 7) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function stubPublicApi(page, { slots = true } = {}) {
  const date = futureDate();
  const startsAt = `${date}T07:00:00.000Z`;
  const endsAt = `${date}T08:00:00.000Z`;
  await installApiConfig(page);
  await page.route('**/api/v1/public/businesses/happy-pets-demo/**', async (route) => {
    const url = route.request().url();
    if (url.endsWith('/catalog')) {
      return fulfillJson(route, {
        business: { slug: 'happy-pets-demo', name: 'Happy Pets' },
        location: { name: 'תל אביב', timezone: 'Asia/Jerusalem' },
        services: serviceIds.map((id, index) => ({
          id,
          name: index === 0 ? 'טיפוח' : 'חיסון',
          description: '',
          durationMinutes: index === 0 ? 45 : 15,
          priceMinor: index === 0 ? 12_000 : 8_000,
          currency: 'ILS',
        })),
      });
    }
    if (url.endsWith('/availability/search')) {
      return fulfillJson(route, { slots: slots ? [{ startsAt, endsAt }] : [], diagnostics: [] });
    }
    if (url.endsWith('/bookings')) {
      return fulfillJson(route, {
        appointmentId: '00000000-0000-4000-8000-000000000999',
        status: 'Confirmed',
        startsAt,
        endsAt,
        totalPriceMinor: 20_000,
        currency: 'ILS',
        steps: [],
        managementToken: `sm_${'m'.repeat(43)}`,
      }, 201);
    }
    if (url.endsWith('/waitlist')) {
      return fulfillJson(route, { waitlistEntryId: 'waitlist-1' }, 201);
    }
    return route.abort();
  });
  return date;
}

test.describe('public compound booking', () => {
  test('books an ordered two-provider visit only through NestJS contracts', async ({ page }) => {
    const date = await stubPublicApi(page);
    const observed = [];
    page.on('request', (request) => {
      if (request.url().includes('/api/v1/')) observed.push(request.url());
    });
    await page.goto('/book/happy-pets-demo');
    await page.locator('.service-card', { hasText: 'טיפוח' }).click();
    await page.locator('.service-card', { hasText: 'חיסון' }).click();
    await page.locator('#visitDate').fill(date);
    await page.locator('.slot-chip').first().click();
    await page.locator('#firstName').fill('דנה');
    await page.locator('#lastName').fill('לוי');
    await page.locator('#phone').fill('050-1234567');
    await page.getByRole('button', { name: 'אישור הזמנה' }).click();

    await expect(page).toHaveURL(/\/book\/happy-pets-demo\/success$/);
    await expect(page.getByText('₪200')).toBeVisible();
    expect(observed).toEqual(expect.arrayContaining([
      expect.stringContaining('/catalog'),
      expect.stringContaining('/availability/search'),
      expect.stringContaining('/bookings'),
    ]));
    expect(observed.some((url) => url.includes('supabase') || url.includes('/rest/v1'))).toBe(false);
    const stored = await page.evaluate(() => sessionStorage.getItem('bookingConfirmation'));
    expect(stored).not.toContain('sm_');
  });

  test('registers ordered demand when no compound slot exists', async ({ page }) => {
    const date = await stubPublicApi(page, { slots: false });
    let requestBody;
    page.on('request', (request) => {
      if (request.url().endsWith('/waitlist')) requestBody = request.postDataJSON();
    });
    await page.goto('/book/happy-pets-demo');
    await page.locator('.service-card', { hasText: 'טיפוח' }).click();
    await page.locator('.service-card', { hasText: 'חיסון' }).click();
    await page.locator('#visitDate').fill(date);
    await expect(page.getByText(/אין כרגע זמן/)).toBeVisible();
    await page.locator('#firstName').fill('דנה');
    await page.locator('#lastName').fill('לוי');
    await page.locator('#phone').fill('050-1234567');
    await page.getByRole('button', { name: 'הצטרפות לרשימת ההמתנה' }).click();

    await expect(page.getByText(/נרשמת לרשימת ההמתנה/)).toBeVisible();
    expect(requestBody).toMatchObject({ serviceIds, customer: { phoneE164: '+972501234567' } });
  });

  test('validates the tenant code fallback without contacting an API', async ({ page }) => {
    await installApiConfig(page);
    await page.goto('/book');
    await page.getByLabel('קוד העסק').fill('../other');
    await page.getByRole('button', { name: 'המשך להזמנה' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
  });
});
