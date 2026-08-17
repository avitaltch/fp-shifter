import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_POOL } from '../database/database.constants';
import { PublicSchedulingRepository } from './public-scheduling.repository';

describe('PublicSchedulingRepository', () => {
  let query: ReturnType<typeof vi.fn>;
  let repository: PublicSchedulingRepository;

  beforeEach(async () => {
    query = vi.fn().mockResolvedValue({ rows: [] });
    const module = await Test.createTestingModule({
      providers: [
        PublicSchedulingRepository,
        { provide: DATABASE_POOL, useValue: { query } },
      ],
    }).compile();
    repository = module.get(PublicSchedulingRepository);
  });

  it('resolves only the public tenant and primary-location context by slug', async () => {
    const context = {
      businessId: '00000000-0000-4000-8000-000000000001',
      businessSlug: 'happy-pets-demo',
      locationId: '00000000-0000-4000-8000-000000000101',
      timezone: 'Asia/Jerusalem',
    };
    query.mockResolvedValue({ rows: [context] });

    await expect(repository.findBusinessBySlug(context.businessSlug)).resolves.toEqual(
      context,
    );
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('where b.slug = $1'),
      [context.businessSlug],
    );
    expect(query.mock.calls[0]?.[0]).not.toContain('password');
  });

  it('returns null for an unknown public slug', async () => {
    await expect(repository.findBusinessBySlug('missing')).resolves.toBeNull();
  });
});
