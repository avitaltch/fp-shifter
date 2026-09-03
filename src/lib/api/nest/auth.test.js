import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearStaffAccessToken,
  loginStaff,
  logoutStaff,
  refreshStaffSession,
  requestAuthenticatedNestApi,
} from './auth';

function successfulFetch(body) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    headers: { get: vi.fn() },
    text: vi.fn().mockResolvedValue(body === null ? '' : JSON.stringify(body)),
  });
}

function response({ body, ok = true, status = 200 }) {
  return {
    ok,
    status,
    headers: { get: vi.fn() },
    text: vi.fn().mockResolvedValue(body === null ? '' : JSON.stringify(body)),
  };
}

const session = {
  accessToken: 'signed-access-token',
  expiresInSeconds: 900,
  user: { id: 'user-1' },
  business: { id: 'business-1', role: 'Owner' },
};

describe('NestJS auth adapter', () => {
  beforeEach(() => {
    clearStaffAccessToken();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('logs in with cookie credentials and keeps the access token in memory', async () => {
    localStorage.setItem('unrelated', 'preserved');
    sessionStorage.setItem('unrelated', 'preserved');
    const fetchImpl = successfulFetch(session);
    await loginStaff(
      { email: 'owner@example.com', password: 'secret' },
      { apiBaseUrl: 'http://localhost/api/v1', fetchImpl }
    );

    expect(fetchImpl.mock.calls[0][0]).toBe('http://localhost/api/v1/auth/login');
    expect(fetchImpl.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      credentials: 'include',
    });

    const protectedFetch = successfulFetch({ ok: true });
    await requestAuthenticatedNestApi('operator/test', {
      apiBaseUrl: 'http://localhost/api/v1',
      fetchImpl: protectedFetch,
    });
    expect(protectedFetch.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer signed-access-token'
    );
    expect(JSON.stringify(localStorage)).not.toContain('signed-access-token');
    expect(JSON.stringify(sessionStorage)).not.toContain('signed-access-token');
    expect(localStorage.getItem('unrelated')).toBe('preserved');
    expect(sessionStorage.getItem('unrelated')).toBe('preserved');
  });

  it('deduplicates concurrent refresh rotation', async () => {
    let resolveFetch;
    const fetchImpl = vi.fn(
      () => new Promise((resolve) => {
        resolveFetch = resolve;
      })
    );
    const first = refreshStaffSession({
      apiBaseUrl: 'http://localhost/api/v1',
      fetchImpl,
    });
    const second = refreshStaffSession({
      apiBaseUrl: 'http://localhost/api/v1',
      fetchImpl,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    resolveFetch({
      ok: true,
      status: 200,
      headers: { get: vi.fn() },
      text: vi.fn().mockResolvedValue(JSON.stringify(session)),
    });
    await expect(Promise.all([first, second])).resolves.toEqual([session, session]);
  });

  it('clears the in-memory token only after a successful logout', async () => {
    await loginStaff(
      { email: 'owner@example.com', password: 'secret' },
      { apiBaseUrl: 'http://localhost/api/v1', fetchImpl: successfulFetch(session) }
    );
    await logoutStaff({
      apiBaseUrl: 'http://localhost/api/v1',
      fetchImpl: successfulFetch(null),
    });

    await expect(requestAuthenticatedNestApi('operator/test')).rejects.toThrow(
      'AUTHENTICATION_REQUIRED'
    );
  });

  it('preserves the in-memory session when server logout fails', async () => {
    await loginStaff(
      { email: 'owner@example.com', password: 'secret' },
      { apiBaseUrl: 'http://localhost/api/v1', fetchImpl: successfulFetch(session) }
    );
    const failedLogout = vi.fn().mockResolvedValue(
      response({ body: { code: 'API_ERROR', message: 'Unavailable' }, ok: false, status: 503 })
    );
    await expect(
      logoutStaff({ apiBaseUrl: 'http://localhost/api/v1', fetchImpl: failedLogout })
    ).rejects.toMatchObject({ status: 503 });

    const protectedFetch = successfulFetch({ ok: true });
    await requestAuthenticatedNestApi('operator/test', {
      apiBaseUrl: 'http://localhost/api/v1',
      fetchImpl: protectedFetch,
    });
    expect(protectedFetch.mock.calls[0][1].headers.Authorization).toBe(
      'Bearer signed-access-token'
    );
  });

  it('coordinates one refresh and retries a protected request once after a 401', async () => {
    const refreshedSession = { ...session, accessToken: 'rotated-access-token' };
    await loginStaff(
      { email: 'owner@example.com', password: 'secret' },
      { apiBaseUrl: 'http://localhost/api/v1', fetchImpl: successfulFetch(session) }
    );
    const fetchImpl = vi.fn((url, options) => {
      if (url.endsWith('/auth/refresh')) {
        return Promise.resolve(response({ body: refreshedSession }));
      }
      if (options.headers.Authorization === 'Bearer signed-access-token') {
        return Promise.resolve(
          response({ body: { code: 'INVALID_ACCESS_TOKEN' }, ok: false, status: 401 })
        );
      }
      return Promise.resolve(response({ body: { ok: true } }));
    });

    await expect(
      requestAuthenticatedNestApi('operator/test', {
        apiBaseUrl: 'http://localhost/api/v1',
        fetchImpl,
      })
    ).resolves.toEqual({ ok: true });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][1].headers.Authorization).toBe(
      'Bearer rotated-access-token'
    );
  });
});
