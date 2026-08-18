import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BookingRepository } from './booking.repository';
import { PublicAvailabilityController } from './public-availability.controller';
import { PublicAvailabilityService } from './public-availability.service';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicCatalogController } from './public-catalog.controller';
import { PublicCatalogService } from './public-catalog.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [
    PublicCatalogController,
    PublicAvailabilityController,
    PublicBookingController,
  ],
  providers: [
    SchedulingRepository,
    PublicSchedulingRepository,
    PublicAvailabilityService,
    PublicCatalogService,
    BookingRepository,
    PublicBookingService,
  ],
  exports: [
    SchedulingRepository,
    PublicAvailabilityService,
    PublicCatalogService,
    PublicBookingService,
  ],
})
export class SchedulingModule {}
