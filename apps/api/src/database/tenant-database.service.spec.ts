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

  it('commits tenant-scoped transaction work and releases the client', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ id: 'appointment-1' }] })
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const module = await Test.createTestingModule({
      providers: [
        TenantDatabaseService,
        {
          provide: DATABASE_POOL,
          useValue: { connect: vi.fn().mockResolvedValue({ query, release }) },
        },
      ],
    }).compile();

    const result = await module
      .get(TenantDatabaseService)
      .transaction(scope, (transaction) =>
        transaction.query(
          'select id from appointments where business_id = $1 and id = $2',
          ['appointment-1'],
        ),
      );

    expect(result).toEqual([{ id: 'appointment-1' }]);
    expect(query.mock.calls).toEqual([
      ['begin'],
      [
        'select id from appointments where business_id = $1 and id = $2',
        ['00000000-0000-4000-8000-000000000001', 'appointment-1'],
      ],
      ['commit'],
    ]);
    expect(release).toHaveBeenCalledOnce();
  });

  it('rolls back failed transaction work and releases the client', async () => {
    const failure = new Error('write failed');
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce({ rows: [] });
    const release = vi.fn();
    const module = await Test.createTestingModule({
      providers: [
        TenantDatabaseService,
        {
          provide: DATABASE_POOL,
          useValue: { connect: vi.fn().mockResolvedValue({ query, release }) },
        },
      ],
    }).compile();

    await expect(
      module.get(TenantDatabaseService).transaction(scope, (transaction) =>
        transaction.query(
          'insert into appointments (business_id) values ($1)',
        ),
      ),
    ).rejects.toBe(failure);
    expect(query.mock.calls).toEqual([
      ['begin'],
      ['insert into appointments (business_id) values ($1)', [scope.businessId]],
      ['rollback'],
    ]);
    expect(release).toHaveBeenCalledOnce();
  });
});
