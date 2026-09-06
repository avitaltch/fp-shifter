import { requestNestApi } from './client';

let accessToken = null;
let refreshPromise = null;

function rememberSession(session) {
  accessToken = session.accessToken;
  return session;
}

export async function loginStaff(credentials, options = {}) {
  const session = await requestNestApi('auth/login', {
    ...options,
    method: 'POST',
    body: credentials,
    credentials: 'include',
  });
  return rememberSession(session);
}

export function refreshStaffSession(options = {}) {
  if (!refreshPromise) {
    refreshPromise = requestNestApi('auth/refresh', {
      ...options,
      method: 'POST',
      credentials: 'include',
    })
      .then(rememberSession)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

export async function logoutStaff(options = {}) {
  await requestNestApi('auth/logout', {
    ...options,
    method: 'POST',
    credentials: 'include',
  });
  accessToken = null;
}

function requestWithAccessToken(path, options) {
  if (!accessToken) throw new Error('AUTHENTICATION_REQUIRED');
  return requestNestApi(path, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: 'include',
  });
}

export async function requestAuthenticatedNestApi(path, options = {}) {
  try {
    return await requestWithAccessToken(path, options);
  } catch (error) {
    if (error?.status !== 401) throw error;

    const { apiBaseUrl, fetchImpl, signal } = options;
    await refreshStaffSession({ apiBaseUrl, fetchImpl, signal });
    return requestWithAccessToken(path, options);
  }
}

export function changeStaffPassword(currentPassword, newPassword, options = {}) {
  return requestAuthenticatedNestApi('auth/password', {
    ...options,
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export function clearStaffAccessToken() {
  accessToken = null;
}
