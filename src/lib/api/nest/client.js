import { resolveApiConfig } from '../../runtimeConfig';

export class NestApiError extends Error {
  constructor(message, { status = 0, code = 'API_ERROR', details, requestId, cause } = {}) {
    super(message, { cause });
    this.name = 'NestApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export async function requestNestApi(
  path,
  {
    method = 'GET',
    body,
    signal,
    apiBaseUrl,
    fetchImpl = globalThis.fetch,
  } = {}
) {
  const baseUrl = apiBaseUrl || resolveApiConfig().apiBaseUrl;
  const normalizedPath = String(path).replace(/^\/+/, '');
  const url = `${baseUrl.replace(/\/+$/, '')}/${normalizedPath}`;
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetchImpl(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause?.name === 'AbortError') throw cause;
    throw new NestApiError('Unable to reach the ShiftSync API', {
      code: 'API_UNAVAILABLE',
      cause,
    });
  }

  const text = await response.text();
  const payload = parseJson(text);
  const requestId = response.headers.get('x-request-id') || undefined;

  if (!response.ok) {
    throw new NestApiError(
      payload?.message || `ShiftSync API request failed with status ${response.status}`,
      {
        status: response.status,
        code: payload?.code || 'API_ERROR',
        details: payload?.details,
        requestId,
      }
    );
  }
  if (payload === undefined) {
    throw new NestApiError('ShiftSync API returned an invalid response', {
      status: response.status,
      code: 'INVALID_API_RESPONSE',
      requestId,
    });
  }
  return payload;
}
