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

export interface RateLimitRule {
  limiter: string;
  identity: string;
  limit: number;
  windowSeconds: number;
}

interface RateLimitError {
  code: string;
  message: string;
}

@Injectable()
export class RateLimiterService {
  private readonly secret: string;

  constructor(
    private readonly database: DatabaseService,
    config: ConfigService<ApplicationEnvironment, true>,
  ) {
    this.secret = config.get('MANAGEMENT_TOKEN_SECRET', { infer: true });
  }

  async assertAllowed(
    rules: readonly RateLimitRule[],
    error: RateLimitError,
  ): Promise<void> {
    const rows = await this.consume(rules);
    const ruleByLimiter = new Map(rules.map((rule) => [rule.limiter, rule]));
    const blocked = rows
      .map((row) => ({ row, rule: ruleByLimiter.get(row.limiter) }))
      .filter(
        (result): result is { row: RateLimitBucketRow; rule: RateLimitRule } =>
          result.rule !== undefined && result.row.requestCount > result.rule.limit,
      )
      .sort(
        (left, right) =>
          right.row.retryAfterSeconds - left.row.retryAfterSeconds,
      )[0];

    if (!blocked) return;
    throw new HttpException(
      { ...error, retryAfterSeconds: blocked.row.retryAfterSeconds },
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
         insert into rate_limit_buckets
           (limiter, bucket_hash, window_started_at, window_seconds,
            request_count, last_seen_at)
         select limiter, bucket_hash, now(), window_seconds, 1, now()
         from requested
         order by ordinal
         on conflict (limiter, bucket_hash) do update set
           request_count = case
             when rate_limit_buckets.window_started_at
                    <= now() - make_interval(secs => excluded.window_seconds)
               then 1
             else rate_limit_buckets.request_count + 1
           end,
           window_started_at = case
             when rate_limit_buckets.window_started_at
                    <= now() - make_interval(secs => excluded.window_seconds)
               then now()
             else rate_limit_buckets.window_started_at
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
