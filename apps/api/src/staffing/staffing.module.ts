import { Module } from '@nestjs/common';
import { OperatorAuditModule } from '../audit/operator-audit.module';
import { AuthModule } from '../auth/auth.module';
import { DatabaseModule } from '../database/database.module';
import { StaffingController } from './staffing.controller';
import { StaffingRepository } from './staffing.repository';
import { StaffingService } from './staffing.service';

@Module({
  imports: [AuthModule, DatabaseModule, OperatorAuditModule],
  controllers: [StaffingController],
  providers: [StaffingRepository, StaffingService],
})
export class StaffingModule {}
