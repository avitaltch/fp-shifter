import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TenantDatabaseService } from '../database/tenant-database.service';
import { TenantScope } from '../tenancy/tenant-scope';
import { SchedulingRepository } from './scheduling.repository';

describe('SchedulingRepository', () => {
  const scope = TenantScope.forBusiness(
    '00000000-0000-4000-8000-000000000001',
  );
  const locationId = '00000000-0000-4000-8000-000000000101';
  const rangeStart = new Date('2030-01-06T07:00:00.000Z');
  const rangeEnd = new Date('2030-01-06T17:00:00.000Z');
  let query: ReturnType<typeof vi.fn>;
  let repository: SchedulingRepository;

  beforeEach(async () => {
    query = vi.fn().mockResolvedValue([]);
    const module = await Test.createTestingModule({
      providers: [
        SchedulingRepository,
        { provide: TenantDatabaseService, useValue: { query } },
      ],
    }).compile();
    repository = module.get(SchedulingRepository);
  });

  it('lists active services through the tenant-scoped database', async () => {
    await repository.listActiveServices(scope);

    expect(query).toHaveBeenCalledWith(
      scope,
      expect.stringContaining('where business_id = $1'),
    );
  });

  it('lists only requested provider skills and skips empty requests', async () => {
    await expect(repository.listProviderSkills(scope, [])).resolves.toEqual([]);
    expect(query).not.toHaveBeenCalled();

    const serviceIds = ['00000000-0000-4000-8000-000000000401'];
    await repository.listProviderSkills(scope, serviceIds);
    expect(query).toHaveBeenCalledWith(
      scope,
      expect.stringContaining('ps.business_id = $1'),
      [serviceIds],
    );
  });

  it('loads business hours for a tenant-owned location', async () => {
    await repository.listBusinessHours(scope, locationId);

    expect(query).toHaveBeenCalledWith(
      scope,
      expect.stringContaining('location_id = $2'),
      [locationId],
    );
  });

  it('loads overlapping provider availability within the tenant', async () => {
    await repository.listAvailability(scope, locationId, rangeStart, rangeEnd);

    expect(query).toHaveBeenCalledWith(
      scope,
      expect.stringContaining("&& tstzrange($3::timestamptz, $4::timestamptz, '[)')"),
      [locationId, rangeStart, rangeEnd],
    );
  });

  it('loads only active appointment steps within the tenant', async () => {
    await repository.listActiveAppointmentSteps(
      scope,
      locationId,
      rangeStart,
      rangeEnd,
    );

    expect(query).toHaveBeenCalledWith(
      scope,
      expect.stringContaining("&& tstzrange($3::timestamptz, $4::timestamptz, '[)')"),
      [locationId, rangeStart, rangeEnd],
    );
  });
});
