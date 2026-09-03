import { Module } from '@nestjs/common';
import { OperatorAuditModule } from '../audit/operator-audit.module';
import { DatabaseModule } from '../database/database.module';
import { SchedulingModule } from '../scheduling/scheduling.module';
import { OperationsController } from './operations.controller';
import { OperationsRepository } from './operations.repository';
import { OperationsService } from './operations.service';

@Module({
  imports: [
    DatabaseModule,
    OperatorAuditModule,
    SchedulingModule,
  ],
  controllers: [OperationsController],
  providers: [OperationsRepository, OperationsService],
})
export class OperationsModule {}
