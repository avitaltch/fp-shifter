import { expect, test } from '@playwright/test';
import { businessLocalDateTimeToInstant } from '../src/lib/dates.js';

const enabled = process.env.E2E_REAL_STACK === 'true';
const apiBaseUrl = process.env.VITE_API_URL || 'http://127.0.0.1:3000/api/v1';
const ownerEmail = process.env.E2E_OWNER_EMAIL;
const ownerPassword = process.env.E2E_OWNER_PASSWORD;
const businessSlug = 'happy-pets-demo';
const locationId = '00000000-0000-4000-8000-000000000101';
const providerIds = [
  '00000000-0000-4000-8000-000000000201',
  '00000000-0000-4000-8000-000000000202',
];

function nextMondayInJerusalem() {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [year, month, day] = today.split('-').map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const daysUntilMonday = ((1 - current.getUTCDay() + 7) % 7) || 7;
  current.setUTCDate(current.getUTCDate() + daysUntilMonday);
  return current.toISOString().slice(0, 10);
}

async function provisionAvailability(request, accessToken, date) {
  const startsAt = businessLocalDateTimeToInstant(date, '08:00', 'Asia/Jerusalem');
  const endsAt = businessLocalDateTimeToInstant(date, '20:00', 'Asia/Jerusalem');
  for (const providerUserId of providerIds) {
    const existing = await request.get(`${apiBaseUrl}/operator/availability`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      params: { from: startsAt, to: endsAt, providerUserId },
    });
    expect(existing.ok(), await existing.text()).toBe(true);
    const alreadyProvisioned = (await existing.json()).some(
      (interval) =>
        interval.kind === 'Available' &&
        interval.startsAt === startsAt &&
        interval.endsAt === endsAt
    );
    if (alreadyProvisioned) continue;
    const response = await request.post(`${apiBaseUrl}/operator/availability`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        providerUserId,
        intervals: [{ locationId, kind: 'Available', startsAt, endsAt }],
      },
    });
    expect(response.ok(), await response.text()).toBe(true);
  }
}

test.describe('real self-hosted compound booking', () => {
  test.skip(!enabled, 'Set E2E_REAL_STACK=true to run against PostgreSQL and NestJS');

  test('books consecutive services with different qualified providers', async ({ page, request }) => {
    expect(ownerEmail).toBeTruthy();
    expect(ownerPassword).toBeTruthy();
    const login = await request.post(`${apiBaseUrl}/auth/login`, {
      data: { email: ownerEmail, password: ownerPassword, businessSlug },
    });
    expect(login.ok(), await login.text()).toBe(true);
    const { accessToken } = await login.json();
    const date = nextMondayInJerusalem();
    await provisionAvailability(request, accessToken, date);

    await page.goto(`/book/${businessSlug}`);
    await page.locator('.service-card', { hasText: 'Pet Trim' }).click();
    await page.locator('.service-card', { hasText: 'Vaccination' }).click();
    await page.locator('#visitDate').fill(date);
    await expect(page.locator('.slot-chip').first()).toBeVisible();
    await page.locator('.slot-chip').first().click();
    await page.locator('#firstName').fill('E2E');
    await page.locator('#lastName').fill(`Customer ${Date.now()}`);
    await page.locator('#phone').fill(`050-${String(Date.now()).slice(-7)}`);
    await page.getByRole('button', { name: 'אישור הזמנה' }).click();

    await expect(page).toHaveURL(new RegExp(`/book/${businessSlug}/success$`));
    await expect(page.getByText('₪200')).toBeVisible();
  });
});
