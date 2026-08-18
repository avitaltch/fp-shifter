import { describe, expect, it, vi } from 'vitest';
import { NestApiError, requestNestApi } from './client';

function mockResponse({ status = 200, body = null, requestId = 'request-1' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: vi.fn(() => requestId) },
    text: vi.fn().mockResolvedValue(body === null ? '' : JSON.stringify(body)),
  };
}

describe('requestNestApi', () => {
  it('sends a normalized JSON request and returns the response body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({ body: { business: { slug: 'happy-pets-demo' } } })
    );

    await expect(
      requestNestApi('/public/businesses/happy-pets-demo/catalog', {
        apiBaseUrl: 'http://127.0.0.1:3000/api/v1/',
        fetchImpl,
      })
    ).resolves.toEqual({ business: { slug: 'happy-pets-demo' } });
    expect(fetchImpl).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/v1/public/businesses/happy-pets-demo/catalog',
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        body: undefined,
        signal: undefined,
      }
    );
  });

  it('preserves stable API error metadata and request correlation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      mockResponse({
        status: 409,
        requestId: 'request-conflict',
        body: {
          code: 'PLAN_NO_LONGER_AVAILABLE',
          message: 'The selected booking time is no longer available',
        },
      })
    );

    const error = await requestNestApi('bookings', {
      apiBaseUrl: 'https://api.example.com/api/v1',
      fetchImpl,
    }).catch((reason) => reason);
    expect(error).toBeInstanceOf(NestApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'PLAN_NO_LONGER_AVAILABLE',
      requestId: 'request-conflict',
    });
  });

  it('maps network failures while allowing AbortError to propagate', async () => {
    const networkError = await requestNestApi('catalog', {
      apiBaseUrl: 'https://api.example.com/api/v1',
      fetchImpl: vi.fn().mockRejectedValue(new Error('network down')),
    }).catch((reason) => reason);
    expect(networkError).toMatchObject({
      name: 'NestApiError',
      code: 'API_UNAVAILABLE',
      status: 0,
    });

    const abortError = new DOMException('cancelled', 'AbortError');
    await expect(
      requestNestApi('catalog', {
        apiBaseUrl: 'https://api.example.com/api/v1',
        fetchImpl: vi.fn().mockRejectedValue(abortError),
      })
    ).rejects.toBe(abortError);
  });

  it('rejects a successful non-JSON response as an invalid contract', async () => {
    const response = mockResponse();
    response.text.mockResolvedValue('<html>proxy error</html>');

    await expect(
      requestNestApi('catalog', {
        apiBaseUrl: 'https://api.example.com/api/v1',
        fetchImpl: vi.fn().mockResolvedValue(response),
      })
    ).rejects.toMatchObject({ code: 'INVALID_API_RESPONSE' });
  });
});
