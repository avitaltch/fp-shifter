import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingRepository } from './booking.repository';
import { AppointmentManagementRepository } from './appointment-management.repository';
import { ManagementTokenService } from './management-token.service';
import { PublicAvailabilityController } from './public-availability.controller';
import { PublicAvailabilityService } from './public-availability.service';
import { PublicAppointmentManagementController } from './public-appointment-management.controller';
import { PublicAppointmentManagementService } from './public-appointment-management.service';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicBookingRateLimiter } from './public-booking-rate-limiter.service';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [
    PublicCatalogController,
    PublicAvailabilityController,
    PublicBookingController,
    PublicAppointmentManagementController,
  ],
  providers: [
    SchedulingRepository,
    PublicSchedulingRepository,
    PublicAvailabilityService,
    PublicCatalogService,
    BookingRepository,
    AppointmentManagementRepository,
    ManagementTokenService,
    PublicBookingService,
    PublicBookingRateLimiter,
    PublicAppointmentManagementService,
  ],
  exports: [
    SchedulingRepository,
    PublicAvailabilityService,
    PublicCatalogService,
    PublicBookingService,
  ],
})
export class SchedulingModule {}
