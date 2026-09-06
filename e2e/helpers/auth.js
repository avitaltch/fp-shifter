export async function installApiConfig(page, apiUrl = 'http://localhost:5173/api/v1') {
  await page.addInitScript((url) => {
    window.__APP_CONFIG__ = Object.freeze({ API_URL: url });
  }, apiUrl);
}

export async function authenticateAs(
  page,
  { userId = 'user-1', email = 'staff@example.test', role = 'Provider' } = {}
) {
  await installApiConfig(page);
  const session = {
    accessToken: 'stubbed-access-token',
    expiresInSeconds: 900,
    user: {
      id: userId,
      email,
      firstName: 'דנה',
      lastName: 'לוי',
      phoneE164: '+972501234567',
      mustChangePassword: false,
    },
    business: {
      id: '00000000-0000-4000-8000-000000000001',
      slug: 'happy-pets-demo',
      role,
    },
  };
  await page.route('**/api/v1/auth/refresh', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(session) })
  );
  await page.route('**/api/v1/auth/logout', (route) => route.fulfill({ status: 204 }));
  return session;
}

export function fulfillJson(route, body, status = 200) {
  return route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}
