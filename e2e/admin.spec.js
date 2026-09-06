import { expect, test } from '@playwright/test';
import { authenticateAs, fulfillJson } from './helpers/auth.js';

test.describe('manager operations', () => {
  test.beforeEach(async ({ page }) => authenticateAs(page, { role: 'Owner' }));

  test('loads ordered handoffs and cancels through the operator API', async ({ page }) => {
    const now = new Date(Date.now() + 60 * 60_000);
    const ends = new Date(now.getTime() + 60 * 60_000);
    const appointment = {
      id: 'appointment-1',
      customerFirstName: 'רות',
      customerLastName: 'מזרחי',
      customerPhoneE164: '+972501234567',
      status: 'Confirmed',
      startsAt: now.toISOString(),
      endsAt: ends.toISOString(),
      timezone: 'Asia/Jerusalem',
      steps: [
        {
          id: 'step-1', sequenceNumber: 1, status: 'Scheduled', serviceName: 'טיפוח',
          providerUserId: 'provider-1', providerFirstName: 'דנה', providerLastName: 'לוי',
          startsAt: now.toISOString(), endsAt: new Date(now.getTime() + 45 * 60_000).toISOString(),
        },
        {
          id: 'step-2', sequenceNumber: 2, status: 'Scheduled', serviceName: 'חיסון',
          providerUserId: 'provider-2', providerFirstName: 'נועה', providerLastName: 'כהן',
          startsAt: new Date(now.getTime() + 45 * 60_000).toISOString(), endsAt: ends.toISOString(),
        },
      ],
    };
    await page.route('**/api/v1/operator/appointments?**', (route) => fulfillJson(route, [appointment]));
    await page.route('**/api/v1/operator/appointments/appointment-1/cancel', (route) =>
      fulfillJson(route, { ...appointment, status: 'Cancelled' }, 201)
    );
    page.on('dialog', (dialog) => dialog.accept());

    await page.goto('/admin/dashboard');
    await expect(page.getByText('טיפוח')).toBeVisible();
    await expect(page.getByText('חיסון')).toBeVisible();
    await page.getByRole('button', { name: /ביטול התור של רות/ }).click();
    await expect(page.getByText('התור בוטל והשעות שוחררו.')).toBeVisible();
  });
});
