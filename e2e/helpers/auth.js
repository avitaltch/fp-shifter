import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Shared auth seeding for ProtectedRoute e2e specs. The role comes from the
// stubbed public.users profile fetch (matching AuthContext), not user_metadata.

export function resolveSupabaseUrl() {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  // helpers/ lives one level under e2e/, so climb two dirs to the project root
  const envPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.env');
  if (!fs.existsSync(envPath)) {
    throw new Error('VITE_SUPABASE_URL not found in the environment or .env');
  }
  const content = fs.readFileSync(envPath, 'utf8');
  const match = content.match(/^\s*VITE_SUPABASE_URL\s*=\s*["']?([^"'\r\n]+)/m);
  if (!match) {
    throw new Error('VITE_SUPABASE_URL not found in the environment or .env');
  }
  return match[1].trim();
}

const projectRef = new URL(resolveSupabaseUrl()).hostname.split('.')[0];
export const storageKey = `sb-${projectRef}-auth-token`;

export function buildSession(userId, email) {
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    user_metadata: {},
    app_metadata: { provider: 'email' },
    created_at: '2026-01-01T00:00:00Z',
  };
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
}

// Seeds localStorage + stubs auth endpoints and the AuthContext profile fetch
// (`users?id=eq.<id>`). Other `/users` list/count calls must be stubbed by the
// test (registered after this helper so they take precedence).
export async function authenticateAs(page, { userId, email, profile }) {
  const session = buildSession(userId, email);

  await page.addInitScript(
    ([key, seeded]) => {
      window.localStorage.setItem(key, JSON.stringify(seeded));
    },
    [storageKey, session]
  );

  await page.route('**/auth/v1/user*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session.user),
    });
  });
  await page.route('**/auth/v1/token*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(session),
    });
  });
  await page.route('**/auth/v1/logout*', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/rest/v1/users*', async (route) => {
    const url = route.request().url();
    if (url.includes(`id=eq.${userId}`)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(profile),
      });
      return;
    }
    // Fallback so unmatched list/count calls don't hang if a test forgot a stub
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([profile]),
    });
  });
}
