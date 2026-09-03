import { Injectable } from '@nestjs/common';
import type { TenantTransaction } from '../database/tenant-database.service';
import { currentRequestId } from '../observability/request-context';

@Injectable()
export class OperatorAuditRepository {
  record(
    transaction: TenantTransaction,
    actorUserId: string,
    action: string,
    resourceType: string,
    resourceId: string | null,
    details: Readonly<Record<string, unknown>> = {},
  ): Promise<readonly never[]> {
    return transaction.query(
      `insert into operator_audit_events
         (business_id, actor_user_id, action, resource_type, resource_id, details, request_id)
       values ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
      [
        actorUserId,
        action,
        resourceType,
        resourceId,
        JSON.stringify(details),
        currentRequestId() ?? null,
      ],
    );
  }
}
