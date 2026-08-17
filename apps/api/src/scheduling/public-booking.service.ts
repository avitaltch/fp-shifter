import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TenantScope } from '../tenancy/tenant-scope';
import {
  InvalidBookingDateError,
  InvalidServiceSelectionError,
  PlanNoLongerAvailableError,
} from './booking.errors';
import { BookingRepository } from './booking.repository';
import type { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import type { PublicBookingResponseDto } from './dto/public-booking-response.dto';
import { PublicSchedulingRepository } from './public-scheduling.repository';

@Injectable()
export class PublicBookingService {
  constructor(
    private readonly directory: PublicSchedulingRepository,
    private readonly bookings: BookingRepository,
  ) {}

  async create(
    businessSlug: string,
    request: CreatePublicBookingDto,
  ): Promise<PublicBookingResponseDto> {
    const context = await this.directory.findBusinessBySlug(businessSlug);
    if (!context) {
      throw new NotFoundException({
        code: 'BUSINESS_NOT_FOUND',
        message: 'Business was not found',
      });
    }

    try {
      const booking = await this.bookings.create(
        TenantScope.forBusiness(context.businessId),
        context,
        {
          date: request.date,
          startsAt: new Date(request.startsAt),
          serviceIds: request.serviceIds,
          customer: request.customer,
          notes: request.notes,
        },
      );
      return {
        appointmentId: booking.appointmentId,
        status: booking.status,
        startsAt: booking.startsAt.toISOString(),
        endsAt: booking.endsAt.toISOString(),
        totalPriceMinor: booking.totalPriceMinor,
        currency: booking.currency,
        steps: booking.steps.map((step) => ({
          sequenceNumber: step.sequenceNumber,
          serviceId: step.serviceId,
          startsAt: step.startsAt.toISOString(),
          endsAt: step.endsAt.toISOString(),
        })),
      };
    } catch (error) {
      if (
        error instanceof InvalidBookingDateError ||
        error instanceof InvalidServiceSelectionError
      ) {
        throw new BadRequestException({
          code:
            error instanceof InvalidBookingDateError
              ? 'INVALID_BOOKING_DATE'
              : 'INVALID_SERVICE_SELECTION',
          message: error.message,
        });
      }
      if (error instanceof PlanNoLongerAvailableError || isExclusionError(error)) {
        throw new ConflictException({
          code: 'PLAN_NO_LONGER_AVAILABLE',
          message: 'The selected booking time is no longer available',
        });
      }
      throw error;
    }
  }
}

function isExclusionError(error: unknown): error is { code: '23P01' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === '23P01'
  );
}
