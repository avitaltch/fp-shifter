import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { TenantScope } from '../tenancy/tenant-scope';
import { DATABASE_POOL } from './database.constants';
import { TenantDatabaseService } from './tenant-database.service';

describe('TenantDatabaseService', () => {
  const scope = TenantScope.forBusiness(
    '00000000-0000-4000-8000-000000000001',
  );

  it('always prepends the trusted tenant ID to query values', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ id: 'service-1' }] });
    const module = await Test.createTestingModule({
      providers: [
        TenantDatabaseService,
        { provide: DATABASE_POOL, useValue: { query } },
      ],
    }).compile();

    await expect(
      module
        .get(TenantDatabaseService)
        .query(scope, 'select id from services where business_id = $1 and id = $2', [
          'service-1',
        ]),
    ).resolves.toEqual([{ id: 'service-1' }]);
    expect(query).toHaveBeenCalledWith(
      'select id from services where business_id = $1 and id = $2',
      ['00000000-0000-4000-8000-000000000001', 'service-1'],
    );
  });

  it('rejects repository SQL that omits the tenant parameter', async () => {
    const module = await Test.createTestingModule({
      providers: [
        TenantDatabaseService,
        { provide: DATABASE_POOL, useValue: { query: vi.fn() } },
      ],
    }).compile();

    await expect(
      module.get(TenantDatabaseService).query(scope, 'select id from services'),
    ).rejects.toThrow('Tenant queries must reference business_id through $1');
  });
});
