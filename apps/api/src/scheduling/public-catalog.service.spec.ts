import { NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PublicCatalogService } from './public-catalog.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const SERVICE_ID = '00000000-0000-4000-8000-000000000401';

describe('PublicCatalogService', () => {
  let service: PublicCatalogService;
  let directory: { findBusinessBySlug: ReturnType<typeof vi.fn> };
  let scheduling: { listActiveServices: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    directory = {
      findBusinessBySlug: vi.fn().mockResolvedValue({
        businessId: BUSINESS_ID,
        businessSlug: 'happy-pets-demo',
        businessName: 'Happy Pets Demo',
        defaultLocale: 'he-IL',
        locationId: '00000000-0000-4000-8000-000000000101',
        locationName: 'Happy Pets — Tel Aviv',
        address: '1 Example Street, Tel Aviv',
        timezone: 'Asia/Jerusalem',
      }),
    };
    scheduling = {
      listActiveServices: vi.fn().mockResolvedValue([
        {
          id: SERVICE_ID,
          name: 'Pet Trim',
          description: 'Full pet grooming and trim',
          durationMinutes: 45,
          priceMinor: 12000,
          currency: 'ILS',
        },
      ]),
    };
    const module = await Test.createTestingModule({
      providers: [
        PublicCatalogService,
        { provide: PublicSchedulingRepository, useValue: directory },
        { provide: SchedulingRepository, useValue: scheduling },
      ],
    }).compile();
    service = module.get(PublicCatalogService);
  });

  it('returns public business context and tenant-owned active services', async () => {
    const result = await service.get('happy-pets-demo');

    expect(result).toEqual({
      business: {
        slug: 'happy-pets-demo',
        name: 'Happy Pets Demo',
        locale: 'he-IL',
      },
      location: {
        name: 'Happy Pets — Tel Aviv',
        address: '1 Example Street, Tel Aviv',
        timezone: 'Asia/Jerusalem',
      },
      services: [
        {
          id: SERVICE_ID,
          name: 'Pet Trim',
          description: 'Full pet grooming and trim',
          durationMinutes: 45,
          priceMinor: 12000,
          currency: 'ILS',
        },
      ],
    });
    expect(scheduling.listActiveServices).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
    );
    expect(JSON.stringify(result)).not.toContain(BUSINESS_ID);
    expect(JSON.stringify(result)).not.toContain('locationId');
  });

  it('rejects an unknown business before reading tenant services', async () => {
    directory.findBusinessBySlug.mockResolvedValue(null);

    const error = await service.get('missing-business').catch((reason) => reason);
    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: 'BUSINESS_NOT_FOUND' });
    expect(scheduling.listActiveServices).not.toHaveBeenCalled();
  });
});
