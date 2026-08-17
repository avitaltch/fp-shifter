import { Inject, Injectable } from '@nestjs/common';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { TenantScope } from '../tenancy/tenant-scope';
import { DATABASE_POOL } from './database.constants';

const TENANT_PARAMETER_PATTERN = /\$1(?!\d)/;

export interface TenantTransaction {
  query<Row extends QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<readonly Row[]>;
}

class ScopedQueryExecutor implements TenantTransaction {
  constructor(
    private readonly businessId: string,
    private readonly client: Pick<PoolClient, 'query'>,
  ) {}

  async query<Row extends QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<readonly Row[]> {
    assertTenantParameter(text);
    const result = await this.client.query<Row>(text, [this.businessId, ...values]);
    return result.rows;
  }
}

@Injectable()
export class TenantDatabaseService {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async query<Row extends QueryResultRow>(
    scope: TenantScope,
    text: string,
    values: readonly unknown[] = [],
  ): Promise<readonly Row[]> {
    return new ScopedQueryExecutor(scope.businessId, this.pool).query<Row>(
      text,
      values,
    );
  }

  async transaction<Result>(
    scope: TenantScope,
    work: (transaction: TenantTransaction) => Promise<Result>,
  ): Promise<Result> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(
        new ScopedQueryExecutor(scope.businessId, client),
      );
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }
}

function assertTenantParameter(text: string): void {
  if (!TENANT_PARAMETER_PATTERN.test(text)) {
    throw new Error('Tenant queries must reference business_id through $1');
  }
}
