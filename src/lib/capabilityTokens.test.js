import { describe, expect, it } from 'vitest';
import { readFragmentCapability } from './capabilityTokens';

describe('readFragmentCapability', () => {
  it('reads a correctly scoped capability from a URL fragment', () => {
    const token = `wo_${'a'.repeat(43)}`;
    expect(readFragmentCapability(`#token=${token}`, 'wo')).toBe(token);
  });

  it('rejects malformed and cross-purpose capabilities', () => {
    const managementToken = `sm_${'b'.repeat(43)}`;
    expect(readFragmentCapability(`#token=${managementToken}`, 'wo')).toBeNull();
    expect(readFragmentCapability('#token=wo_too-short', 'wo')).toBeNull();
    expect(readFragmentCapability('', 'sm')).toBeNull();
  });
});
