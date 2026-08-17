import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { SchedulingRepository } from './scheduling.repository';

@Module({
  imports: [DatabaseModule],
  providers: [SchedulingRepository],
  exports: [SchedulingRepository],
})
export class SchedulingModule {}
