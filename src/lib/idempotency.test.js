import { describe, expect, it, vi } from 'vitest';
import { createIdempotencyKey, idempotencyAttempt } from './idempotency';

describe('createIdempotencyKey', () => {
  it('uses the platform UUID generator when available', () => {
    const randomUUID = vi
      .fn()
      .mockReturnValue('00000000-0000-4000-8000-000000000444');

    expect(createIdempotencyKey({ randomUUID })).toBe(
      '00000000-0000-4000-8000-000000000444'
    );
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates a valid UUID v4 with secure random bytes as a fallback', () => {
    const getRandomValues = vi.fn((bytes) => {
      bytes.fill(0xab);
      return bytes;
    });

    expect(createIdempotencyKey({ getRandomValues })).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    );
  });

  it('fails closed when secure randomness is unavailable', () => {
    expect(() => createIdempotencyKey({})).toThrow('Secure random');
  });
});

describe('idempotencyAttempt', () => {
  it('reuses the key for a retry of the same payload', () => {
    const createKey = vi.fn().mockReturnValue('key-1');
    const first = idempotencyAttempt(null, { startsAt: '10:00' }, createKey);
    const retry = idempotencyAttempt(first, { startsAt: '10:00' }, createKey);

    expect(retry).toBe(first);
    expect(createKey).toHaveBeenCalledOnce();
  });

  it('rotates the key when the payload changes', () => {
    const createKey = vi
      .fn()
      .mockReturnValueOnce('key-1')
      .mockReturnValueOnce('key-2');
    const first = idempotencyAttempt(null, { startsAt: '10:00' }, createKey);
    const changed = idempotencyAttempt(first, { startsAt: '11:00' }, createKey);

    expect(changed.idempotencyKey).toBe('key-2');
  });
});
