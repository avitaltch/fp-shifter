import { Inject, Injectable } from '@nestjs/common';
import type { Pool, QueryResultRow } from 'pg';
import type { TenantScope } from '../tenancy/tenant-scope';
import { DATABASE_POOL } from './database.constants';

const TENANT_PARAMETER_PATTERN = /\$1(?!\d)/;

@Injectable()
export class TenantDatabaseService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async query<Row extends QueryResultRow>(
    scope: TenantScope,
    text: string,
    values: readonly unknown[] = [],
  ): Promise<readonly Row[]> {
    if (!TENANT_PARAMETER_PATTERN.test(text)) {
      throw new Error('Tenant queries must reference business_id through $1');
    }
    const result = await this.pool.query<Row>(text, [
      scope.businessId,
      ...values,
    ]);
    return result.rows;
  }
}
