import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { BookingRepository } from './booking.repository';
import { PublicAvailabilityController } from './public-availability.controller';
import { PublicAvailabilityService } from './public-availability.service';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [PublicAvailabilityController, PublicBookingController],
  providers: [
    SchedulingRepository,
    PublicSchedulingRepository,
    PublicAvailabilityService,
    BookingRepository,
    PublicBookingService,
  ],
  exports: [
    SchedulingRepository,
    PublicAvailabilityService,
    PublicBookingService,
  ],
})
export class SchedulingModule {}
