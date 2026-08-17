import { describe, expect, it } from 'vitest';
import { TenantScope } from './tenant-scope';

describe('TenantScope', () => {
  it('creates an immutable normalized tenant boundary', () => {
    const scope = TenantScope.forBusiness(
      '00000000-0000-4000-8000-0000000000AA',
    );

    expect(scope.businessId).toBe('00000000-0000-4000-8000-0000000000aa');
    expect(Object.isFrozen(scope)).toBe(true);
  });

  it('rejects identifiers that cannot safely establish tenancy', () => {
    expect(() => TenantScope.forBusiness('happy-pets-demo')).toThrow(
      'Tenant business ID must be a valid UUID',
    );
  });
});
