import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { PublicAvailabilityController } from './public-availability.controller';
import { PublicAvailabilityService } from './public-availability.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';
import { SchedulingRepository } from './scheduling.repository';

@Module({
  imports: [DatabaseModule],
  controllers: [PublicAvailabilityController],
  providers: [
    SchedulingRepository,
    PublicSchedulingRepository,
    PublicAvailabilityService,
  ],
  exports: [SchedulingRepository, PublicAvailabilityService],
})
export class SchedulingModule {}
