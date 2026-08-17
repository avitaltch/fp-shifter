import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantScope } from '../tenancy/tenant-scope';
import { findCompoundAppointmentPlans, localDateRangeToInstants, SchedulerInputError } from './domain/compound-scheduler';
import type { SearchPublicAvailabilityDto } from './dto/search-public-availability.dto';
import type { PublicAvailabilityResponseDto } from './dto/public-availability-response.dto';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

@Injectable()
export class PublicAvailabilityService {
  constructor(
    private readonly directory: PublicSchedulingRepository,
    private readonly scheduling: SchedulingRepository,
  ) {}

  async search(
    businessSlug: string,
    request: SearchPublicAvailabilityDto,
  ): Promise<PublicAvailabilityResponseDto> {
    const context = await this.directory.findBusinessBySlug(businessSlug);
    if (!context) {
      throw new NotFoundException({
        code: 'BUSINESS_NOT_FOUND',
        message: 'Business was not found',
      });
    }
    const scope = TenantScope.forBusiness(context.businessId);
    const activeServices = await this.scheduling.listActiveServices(scope);
    const serviceById = new Map(activeServices.map((service) => [service.id, service]));
    const selectedServices = request.serviceIds.map((serviceId) =>
      serviceById.get(serviceId),
    );
    if (selectedServices.some((service) => service === undefined)) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE_SELECTION',
        message: 'One or more selected services are unavailable',
      });
    }
    const services = selectedServices.flatMap((service) =>
      service
        ? [{ serviceId: service.id, durationMinutes: service.durationMinutes }]
        : [],
    );
    const currencies = new Set(selectedServices.map((service) => service?.currency));
    if (currencies.size !== 1) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE_CONFIGURATION',
        message: 'Selected services must use one currency',
      });
    }

    let range: { rangeStart: Date; rangeEnd: Date };
    try {
      range = localDateRangeToInstants(request.date, context.timezone);
    } catch (error) {
      if (!(error instanceof SchedulerInputError)) throw error;
      throw new BadRequestException({
        code: 'INVALID_DATE',
        message: error.message,
      });
    }

    const uniqueServiceIds = [...new Set(request.serviceIds)];
    const [businessHours, providerSkills, providerAvailability, reservations] =
      await Promise.all([
        this.scheduling.listBusinessHours(scope, context.locationId),
        this.scheduling.listProviderSkills(scope, uniqueServiceIds),
        this.scheduling.listAvailability(
          scope,
          context.locationId,
          range.rangeStart,
          range.rangeEnd,
        ),
        this.scheduling.listActiveAppointmentSteps(
          scope,
          context.locationId,
          range.rangeStart,
          range.rangeEnd,
        ),
      ]);
    const result = findCompoundAppointmentPlans({
      timezone: context.timezone,
      rangeStart: range.rangeStart,
      rangeEnd: range.rangeEnd,
      services,
      businessHours,
      providerSkills,
      providerAvailability,
      reservations,
    });

    return {
      businessSlug: context.businessSlug,
      date: request.date,
      serviceCount: services.length,
      totalDurationMinutes: services.reduce(
        (sum, service) => sum + service.durationMinutes,
        0,
      ),
      totalPriceMinor: selectedServices.reduce(
        (sum, service) => sum + (service?.priceMinor ?? 0),
        0,
      ),
      currency: selectedServices[0]?.currency ?? 'ILS',
      slots: result.plans.map((plan) => ({
        startsAt: plan.startsAt.toISOString(),
        endsAt: plan.endsAt.toISOString(),
      })),
      diagnostics: result.diagnostics.map((diagnostic) => ({ ...diagnostic })),
    };
  }
}
