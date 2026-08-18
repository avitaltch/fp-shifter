import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BookingRepository } from './booking.repository';
import { CustomerRepository } from './customer.repository';
import { AppointmentManagementRepository } from './appointment-management.repository';
import { ManagementTokenService } from './management-token.service';
import { PublicAvailabilityController } from './public-availability.controller';
import { PublicAvailabilityService } from './public-availability.service';
import { PublicAppointmentManagementController } from './public-appointment-management.controller';
import { PublicAppointmentManagementService } from './public-appointment-management.service';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicActionRateLimiter } from './public-booking-rate-limiter.service';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { PublicWaitlistController } from './public-waitlist.controller';
import { PublicWaitlistService } from './public-waitlist.service';
import { SchedulingRepository } from './scheduling.repository';
import { WaitlistRepository } from './waitlist.repository';
import { WaitlistOfferTokenService } from './waitlist-offer-token.service';
import { WaitlistWorkerService } from './waitlist-worker.service';

@Module({
  imports: [DatabaseModule, NotificationsModule],
  controllers: [
    PublicCatalogController,
    PublicAvailabilityController,
    PublicBookingController,
    PublicAppointmentManagementController,
    PublicWaitlistController,
  ],
  providers: [
    SchedulingRepository,
    PublicSchedulingRepository,
    PublicAvailabilityService,
    PublicCatalogService,
    BookingRepository,
    CustomerRepository,
    AppointmentManagementRepository,
    ManagementTokenService,
    PublicBookingService,
    PublicActionRateLimiter,
    PublicAppointmentManagementService,
    WaitlistRepository,
    PublicWaitlistService,
    WaitlistOfferTokenService,
    WaitlistWorkerService,
  ],
  exports: [
    SchedulingRepository,
    PublicAvailabilityService,
    PublicCatalogService,
    PublicBookingService,
    WaitlistWorkerService,
  ],
})
export class SchedulingModule {}
