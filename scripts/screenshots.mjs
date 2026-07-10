/**
 * Throwaway screenshot capture for README docs.
 * Reuses the same network-stub patterns as e2e/ (no live Supabase required).
 *
 * Usage: node scripts/screenshots.mjs
 * Starts Vite on :5173 if nothing is listening, then writes PNGs to docs/screenshots/.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { authenticateAs, resolveSupabaseUrl } from '../e2e/helpers/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const outDir = path.join(root, 'docs', 'screenshots');
const BASE = 'http://localhost:5173';
const VIEWPORT = { width: 1280, height: 800 };

const ADMIN_ID = 'admin-1';
const EMP_ID = 'emp-1';

const adminProfile = {
  id: ADMIN_ID,
  first_name: 'דנה',
  last_name: 'לוי',
  role: 'Admin',
  phone: '050-1111111',
};

const empProfile = {
  id: EMP_ID,
  first_name: 'יוסי',
  last_name: 'כהן',
  role: 'Employee',
  phone: '050-2222222',
};

const mockServices = [
  { id: 's1', name: 'תספורת', description: 'תספורת קלאסית', base_price: 150, default_duration: 45 },
  { id: 's2', name: 'צבע', description: 'צביעת שיער', base_price: 200, default_duration: 120 },
  { id: 's3', name: 'עיצוב', description: 'עיצוב לאירוע', base_price: 180, default_duration: 60 },
];

const mockSlots = [
  { slot_start: '10:00:00', slot_end: '10:45:00' },
  { slot_start: '11:00:00', slot_end: '11:45:00' },
  { slot_start: '12:00:00', slot_end: '12:45:00' },
  { slot_start: '14:00:00', slot_end: '14:45:00' },
];

function addDaysLocal(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  const pad = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayLocal() {
  return addDaysLocal(0);
}

const visitDate = addDaysLocal(7);

async function waitForServer(url, timeoutMs = 60_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404) return;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`Dev server did not become ready at ${url}`);
}

async function ensureDevServer() {
  try {
    const res = await fetch(BASE);
    if (res.ok || res.status === 404) return null;
  } catch {
    // start below
  }
  const child = spawn('npm', ['run', 'dev'], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env },
  });
  await waitForServer(BASE);
  return child;
}

async function stubJson(page, urlGlob, body, { methods, status = 200, headers } = {}) {
  await page.route(urlGlob, async (route) => {
    if (methods && !methods.includes(route.request().method())) {
      await route.fallback();
      return;
    }
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers,
      body: JSON.stringify(body),
    });
  });
}

async function captureBooking(page) {
  await stubJson(page, '**/rest/v1/service_types*', mockServices);
  await stubJson(page, '**/rest/v1/rpc/get_available_slots*', mockSlots);

  await page.goto(`${BASE}/book`, { waitUntil: 'networkidle' });
  await page.locator('.service-card', { hasText: 'תספורת' }).click();
  await page.locator('#visitDate').fill(visitDate);
  await page.locator('.slot-chip', { hasText: '10:00' }).waitFor({ state: 'visible' });
  await page.locator('.slot-chip', { hasText: '10:00' }).click();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(outDir, '01-booking.png'),
    fullPage: false,
  });
}

async function captureBookingSuccess(page) {
  await stubJson(page, '**/rest/v1/service_types*', mockServices);
  await stubJson(page, '**/rest/v1/rpc/get_available_slots*', mockSlots);
  await page.route('**/rest/v1/rpc/book_appointment*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'booking-demo-1',
        visit_date: visitDate,
        start_time: '10:00:00',
        total_duration: 45,
        total_price: 150,
        status: 'Pending',
      }),
    });
  });

  await page.goto(`${BASE}/book`, { waitUntil: 'networkidle' });
  await page.locator('.service-card', { hasText: 'תספורת' }).click();
  await page.locator('#visitDate').fill(visitDate);
  await page.locator('.slot-chip', { hasText: '10:00' }).click();
  await page.locator('#firstName').fill('רות');
  await page.locator('#lastName').fill('מזרחי');
  await page.locator('#phone').fill('050-1234567');
  await page.getByRole('button', { name: 'אישור הזמנה' }).click();
  await page.getByText('התור שלך נקבע בהצלחה!').waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(outDir, '02-booking-success.png'),
    fullPage: false,
  });
}

async function captureAdminDashboard(page) {
  await authenticateAs(page, {
    userId: ADMIN_ID,
    email: 'admin@test.com',
    profile: adminProfile,
  });

  const appointment = {
    id: 'apt-1',
    visit_date: todayLocal(),
    status: 'Confirmed',
    customers: { first_name: 'רות', last_name: 'מזרחי', phone: '050-9876543' },
    appointment_items: [
      {
        id: 'item-1',
        user_id: EMP_ID,
        start_time: '10:00:00',
        end_time: '11:00:00',
        service_types: { name: 'תספורת' },
        users: { first_name: 'יוסי', last_name: 'כהן' },
      },
      {
        id: 'item-2',
        user_id: null,
        start_time: '14:00:00',
        end_time: '16:00:00',
        service_types: { name: 'צבע' },
        users: null,
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
      headers: { 'content-range': '0-1/2' },
      body: JSON.stringify([adminProfile, empProfile]),
    });
  });

  await page.goto(`${BASE}/admin/dashboard`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: /דאשבורד מנהל/ }).waitFor({ state: 'visible' });
  await page.getByText(/רות מזרחי/).waitFor({ state: 'visible' });
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(outDir, '03-admin-dashboard.png'),
    fullPage: false,
  });
}

async function captureEmployeeAvailability(page) {
  await authenticateAs(page, {
    userId: EMP_ID,
    email: 'employee@test.com',
    profile: empProfile,
  });

  const existing = [
    {
      id: 'avail-1',
      user_id: EMP_ID,
      available_date: addDaysLocal(1),
      start_time: '08:00:00',
      end_time: '16:00:00',
      notes: null,
    },
    {
      id: 'avail-2',
      user_id: EMP_ID,
      available_date: addDaysLocal(2),
      start_time: '09:00:00',
      end_time: '15:00:00',
      notes: null,
    },
  ];

  await page.route('**/rest/v1/availabilities*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(existing),
    });
  });

  await page.goto(`${BASE}/employee/availability`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: 'הזנת זמינות - אזור אישי' }).waitFor({
    state: 'visible',
  });
  await page.getByText('פתיחה מרוכזת').waitFor({ state: 'visible' });
  // Bring the bulk-open section into view for a clean capture
  await page.locator('.availability-bulk').scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  await page.screenshot({
    path: path.join(outDir, '04-employee-availability.png'),
    fullPage: false,
  });
}

async function main() {
  // Touch resolve so missing .env fails early with a clear message
  resolveSupabaseUrl();

  fs.mkdirSync(outDir, { recursive: true });

  const child = await ensureDevServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    locale: 'he-IL',
  });

  try {
    // Fresh page per capture so route stubs / auth seeds don't collide
    const bookingPage = await context.newPage();
    await captureBooking(bookingPage);
    await bookingPage.close();

    const successPage = await context.newPage();
    await captureBookingSuccess(successPage);
    await successPage.close();

    const adminPage = await context.newPage();
    await captureAdminDashboard(adminPage);
    await adminPage.close();

    const availPage = await context.newPage();
    await captureEmployeeAvailability(availPage);
    await availPage.close();

    const files = fs.readdirSync(outDir).filter((f) => f.endsWith('.png'));
    for (const f of files) {
      const size = fs.statSync(path.join(outDir, f)).size;
      console.log(`${f}: ${(size / 1024).toFixed(1)} KB`);
      if (size < 20 * 1024) {
        console.warn(`WARNING: ${f} is under 20KB — may be blank/empty`);
      }
    }
    console.log(`Wrote ${files.length} screenshots to docs/screenshots/`);
  } finally {
    await browser.close();
    if (child) {
      child.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
