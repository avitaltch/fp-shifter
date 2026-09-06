import { describe, expect, it } from 'vitest';
import { resolveApiConfig } from './runtimeConfig';

describe('resolveApiConfig', () => {
  it('prefers and normalizes the runtime NestJS URL', () => {
    expect(
      resolveApiConfig(
        { API_URL: 'https://api.example.com/api/v1/' },
        { VITE_API_URL: 'http://127.0.0.1:3000/api/v1' }
      )
    ).toEqual({ apiBaseUrl: 'https://api.example.com/api/v1' });
  });

  it('falls back to the build-time NestJS URL', () => {
    expect(
      resolveApiConfig(undefined, {
        VITE_API_URL: 'http://127.0.0.1:3000/api/v1',
      })
    ).toEqual({ apiBaseUrl: 'http://127.0.0.1:3000/api/v1' });
  });

  it.each([
    'not-a-url',
    'ftp://api.example.com/api/v1',
    'https://user:secret@api.example.com/api/v1',
    'https://api.example.com/api/v1?debug=true',
  ])('rejects unsafe or malformed API URLs: %s', (apiUrl) => {
    expect(() => resolveApiConfig({ API_URL: apiUrl }, {})).toThrow(
      'Invalid API configuration'
    );
  });

  it('fails only when the NestJS transport is requested without configuration', () => {
    expect(() => resolveApiConfig({}, {})).toThrow('Missing API configuration');
  });
});
