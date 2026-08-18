import { Inject, Injectable } from '@nestjs/common';
import type { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.constants';
import type { PublicBusinessSchedulingContext } from './scheduling.types';

@Injectable()
export class PublicSchedulingRepository {
  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async findBusinessBySlug(
    businessSlug: string,
  ): Promise<PublicBusinessSchedulingContext | null> {
    const result = await this.pool.query<PublicBusinessSchedulingContext>(
      `select b.id as "businessId",
              b.slug::text as "businessSlug",
              b.name as "businessName",
              b.default_locale as "defaultLocale",
              l.id as "locationId",
              l.name as "locationName",
              l.address,
              l.timezone
       from businesses b
       join locations l on l.business_id = b.id
       where b.slug = $1
       order by l.is_primary desc, l.created_at, l.id
       limit 1`,
      [businessSlug],
    );
    return result.rows[0] ?? null;
  }
}
