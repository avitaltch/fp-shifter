import { Module } from '@nestjs/common';
import { OperatorAuditRepository } from './operator-audit.repository';

@Module({
  providers: [OperatorAuditRepository],
  exports: [OperatorAuditRepository],
})
export class OperatorAuditModule {}
