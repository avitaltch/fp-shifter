import { describe, expect, it } from 'vitest';
import { readBearerCapability } from './capability-token';

describe('readBearerCapability', () => {
  it('accepts the expected prefix and base64url value including underscores', () => {
    const token = `wo_${'_'.repeat(43)}`;
    expect(readBearerCapability(`Bearer ${token}`, 'wo')).toBe(token);
  });

  it.each([
    [undefined, 'wo'],
    [`Basic ${'a'.repeat(43)}`, 'wo'],
    [`Bearer sm_${'a'.repeat(43)}`, 'wo'],
    [`Bearer wo_${'a'.repeat(42)}`, 'wo'],
  ] as const)('rejects malformed or wrong-purpose capabilities', (header, prefix) => {
    expect(readBearerCapability(header, prefix)).toBeNull();
  });
});
