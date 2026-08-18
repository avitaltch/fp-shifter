import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogService } from './public-catalog.service';

describe('PublicCatalogController', () => {
  it('delegates the validated business slug to the catalog service', async () => {
    const response = {
      business: { slug: 'happy-pets-demo', name: 'Happy Pets', locale: 'he-IL' },
      location: {
        name: 'Tel Aviv',
        address: null,
        timezone: 'Asia/Jerusalem',
      },
      services: [],
    };
    const get = vi.fn().mockResolvedValue(response);
    const module = await Test.createTestingModule({
      controllers: [PublicCatalogController],
      providers: [{ provide: PublicCatalogService, useValue: { get } }],
    }).compile();
    const controller = module.get(PublicCatalogController);

    await expect(
      controller.get({ businessSlug: 'happy-pets-demo' }),
    ).resolves.toEqual(response);
    expect(get).toHaveBeenCalledWith('happy-pets-demo');
  });
});
