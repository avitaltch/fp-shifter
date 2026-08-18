import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import type { ApplicationEnvironment } from '../config/environment';
import { DatabaseService } from '../database/database.service';

interface RateLimitBucketRow {
  limiter: string;
  requestCount: number;
  retryAfterSeconds: number;
}

interface RateLimitRule {
  limiter: string;
  identity: string;
  limit: number;
  windowSeconds: number;
}

@Injectable()
export class PublicBookingRateLimiter {
  private readonly secret: string;

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService<ApplicationEnvironment, true>,
  ) {
    this.secret = this.config.get('MANAGEMENT_TOKEN_SECRET', { infer: true });
  }

  async assertAllowed(input: {
    businessSlug: string;
    clientAddress: string;
    phoneE164: string;
  }): Promise<void> {
    const rules: RateLimitRule[] = [
      {
        limiter: 'public-booking-business-ip',
        identity: `${input.businessSlug}:${input.clientAddress}`,
        limit: this.config.get('PUBLIC_BOOKING_IP_LIMIT', { infer: true }),
        windowSeconds: this.config.get('PUBLIC_BOOKING_IP_WINDOW_SECONDS', {
          infer: true,
        }),
      },
      {
        limiter: 'public-booking-business-contact',
        identity: `${input.businessSlug}:${input.phoneE164}`,
        limit: this.config.get('PUBLIC_BOOKING_CONTACT_LIMIT', { infer: true }),
        windowSeconds: this.config.get(
          'PUBLIC_BOOKING_CONTACT_WINDOW_SECONDS',
          { infer: true },
        ),
      },
    ];
    const rows = await this.consume(rules);
    const ruleByLimiter = new Map(rules.map((rule) => [rule.limiter, rule]));
    const blocked = rows
      .map((row) => ({ row, rule: ruleByLimiter.get(row.limiter) }))
      .filter(
        (result): result is { row: RateLimitBucketRow; rule: RateLimitRule } =>
          result.row !== undefined &&
          result.rule !== undefined &&
          result.row.requestCount > result.rule.limit,
      )
      .sort(
        (left, right) =>
          right.row.retryAfterSeconds - left.row.retryAfterSeconds,
      )[0];

    if (!blocked) return;
    throw new HttpException(
      {
        code: 'PUBLIC_BOOKING_RATE_LIMITED',
        message: 'Too many booking attempts. Please try again later.',
        retryAfterSeconds: blocked.row.retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private consume(
    rules: readonly RateLimitRule[],
  ): Promise<readonly RateLimitBucketRow[]> {
    return this.database.query<RateLimitBucketRow>(
      `with requested as (
         select *
         from unnest($1::text[], $2::text[], $3::integer[]) with ordinality
           as input(limiter, bucket_hash, window_seconds, ordinal)
       ), consumed as (
         insert into public_rate_limit_buckets
           (limiter, bucket_hash, window_started_at, window_seconds,
            request_count, last_seen_at)
         select limiter, bucket_hash, now(), window_seconds, 1, now()
         from requested
         order by ordinal
         on conflict (limiter, bucket_hash) do update set
           request_count = case
             when public_rate_limit_buckets.window_started_at
                    <= now() - make_interval(secs => excluded.window_seconds)
               then 1
             else public_rate_limit_buckets.request_count + 1
           end,
           window_started_at = case
             when public_rate_limit_buckets.window_started_at
                    <= now() - make_interval(secs => excluded.window_seconds)
               then now()
             else public_rate_limit_buckets.window_started_at
           end,
           window_seconds = excluded.window_seconds,
           last_seen_at = now()
         returning limiter, request_count, window_started_at, window_seconds
       )
       select limiter,
              request_count as "requestCount",
              greatest(
                1,
                ceil(extract(epoch from (
                  window_started_at + make_interval(secs => window_seconds) - now()
                )))::integer
              ) as "retryAfterSeconds"
       from consumed
       order by array_position($1::text[], limiter)`,
      [
        rules.map((rule) => rule.limiter),
        rules.map((rule) => this.hashIdentity(rule.limiter, rule.identity)),
        rules.map((rule) => rule.windowSeconds),
      ],
    );
  }

  private hashIdentity(limiter: string, identity: string): string {
    return createHmac('sha256', this.secret)
      .update(`rate-limit:${limiter}:${identity}`)
      .digest('hex');
  }
}
