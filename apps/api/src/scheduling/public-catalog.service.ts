import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantScope } from '../tenancy/tenant-scope';
import type { PublicCatalogResponseDto } from './dto/public-catalog-response.dto';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

@Injectable()
export class PublicCatalogService {
  constructor(
    private readonly directory: PublicSchedulingRepository,
    private readonly scheduling: SchedulingRepository,
  ) {}

  async get(businessSlug: string): Promise<PublicCatalogResponseDto> {
    const context = await this.directory.findBusinessBySlug(businessSlug);
    if (!context) {
      throw new NotFoundException({
        code: 'BUSINESS_NOT_FOUND',
        message: 'Business was not found',
      });
    }

    const services = await this.scheduling.listActiveServices(
      TenantScope.forBusiness(context.businessId),
    );

    return {
      business: {
        slug: context.businessSlug,
        name: context.businessName,
        locale: context.defaultLocale,
      },
      location: {
        name: context.locationName,
        address: context.address,
        timezone: context.timezone,
      },
      services: services.map((service) => ({ ...service })),
    };
  }
}
