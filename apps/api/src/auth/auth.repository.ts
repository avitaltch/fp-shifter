import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, PoolClient, QueryResultRow } from 'pg';
import type { ApplicationEnvironment } from '../config/environment';
import { DATABASE_POOL } from '../database/database.constants';
import { currentRequestId } from '../observability/request-context';
import type {
  AuthPrincipal,
  LoginCandidate,
  MembershipRole,
} from './auth.types';

interface LoginCandidateRow extends QueryResultRow {
  userId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  disabledAt: Date | null;
  businessId: string;
  businessSlug: string;
  membershipId: string;
  role: MembershipRole;
  mustChangePassword: boolean;
}

interface SessionPrincipalRow extends QueryResultRow {
  sessionId: string;
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  phoneE164: string | null;
  businessId: string;
  businessSlug: string;
  membershipId: string;
  role: MembershipRole;
  mustChangePassword: boolean;
  refreshTokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface IssuedRefreshSession {
  principal: AuthPrincipal;
  refreshToken: string;
  expiresAt: Date;
}

export type RefreshRotationResult =
  | { status: 'rotated'; session: IssuedRefreshSession }
  | { status: 'invalid' | 'reused' };

@Injectable()
export class AuthRepository {
  private readonly refreshTtlDays: number;
  private readonly identitySecret: string;

  constructor(
    @Inject(DATABASE_POOL) private readonly pool: Pool,
    config: ConfigService<ApplicationEnvironment, true>,
  ) {
    this.refreshTtlDays = config.get('AUTH_REFRESH_TOKEN_TTL_DAYS', {
      infer: true,
    });
    this.identitySecret = config.get('AUTH_TOKEN_SECRET', { infer: true });
  }

  async findLoginCandidates(
    email: string,
    businessSlug?: string,
  ): Promise<readonly LoginCandidate[]> {
    const result = await this.pool.query<LoginCandidateRow>(
      `select u.id as "userId",
              u.email::text as email,
              u.password_hash as "passwordHash",
              u.first_name as "firstName",
              u.last_name as "lastName",
              u.phone_e164 as "phoneE164",
              u.disabled_at as "disabledAt",
              b.id as "businessId",
              b.slug as "businessSlug",
              m.id as "membershipId",
              m.role,
              u.must_change_password as "mustChangePassword"
       from users u
       join business_memberships m on m.user_id = u.id
       join businesses b on b.id = m.business_id
       where u.email = $1::citext
         and ($2::text is null or b.slug = $2)
         and m.disabled_at is null
       order by b.slug`,
      [email, businessSlug ?? null],
    );
    return result.rows
      .filter((row) => row.disabledAt === null)
      .map(({ disabledAt: _disabledAt, ...candidate }) => candidate);
  }

  async createSession(candidate: LoginCandidate): Promise<IssuedRefreshSession> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const session = await this.insertSession(client, candidate);
      await this.insertEvent(client, 'login_succeeded', {
        userId: candidate.userId,
        businessId: candidate.businessId,
        identityHash: this.hashIdentity(candidate.email),
      });
      await client.query('commit');
      return session;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async recordFailedLogin(email: string): Promise<void> {
    await this.pool.query(
      `insert into auth_events (event, identity_hash, request_id)
       values ('login_failed', $1, $2)`,
      [this.hashIdentity(email), currentRequestId() ?? null],
    );
  }

  async rotate(refreshToken: string): Promise<RefreshRotationResult> {
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query<SessionPrincipalRow>(
        `${this.sessionPrincipalSelect()}
         where s.refresh_token_hash = $1
           and u.disabled_at is null
           and m.disabled_at is null
         for update of s`,
        [refreshTokenHash],
      );
      const current = result.rows[0];
      if (!current) {
        await client.query('rollback');
        return { status: 'invalid' };
      }
      if (current.revokedAt) {
        await client.query(
          `update auth_sessions
           set revoked_at = coalesce(revoked_at, now())
           where user_id = $1 and revoked_at is null`,
          [current.userId],
        );
        await this.insertEvent(client, 'refresh_reuse_detected', {
          userId: current.userId,
          businessId: current.businessId,
        });
        await client.query('commit');
        return { status: 'reused' };
      }
      if (current.expiresAt.getTime() <= Date.now()) {
        await client.query(
          `update auth_sessions set revoked_at = now() where id = $1`,
          [current.sessionId],
        );
        await client.query('commit');
        return { status: 'invalid' };
      }

      const candidate = this.toLoginCandidate(current);
      const rotated = await this.insertSession(client, candidate);
      await client.query(
        `update auth_sessions
         set revoked_at = now(), rotated_to_session_id = $2, last_used_at = now()
         where id = $1`,
        [current.sessionId, rotated.principal.sessionId],
      );
      await this.insertEvent(client, 'refresh_rotated', {
        userId: current.userId,
        businessId: current.businessId,
      });
      await client.query('commit');
      return { status: 'rotated', session: rotated };
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    const result = await this.pool.query<{
      userId: string;
      businessId: string;
    }>(
      `update auth_sessions
       set revoked_at = coalesce(revoked_at, now()), last_used_at = now()
       where refresh_token_hash = $1
       returning user_id as "userId", business_id as "businessId"`,
      [this.hashRefreshToken(refreshToken)],
    );
    const session = result.rows[0];
    if (!session) return;
    await this.pool.query(
      `insert into auth_events
         (event, user_id, business_id, request_id)
       values ('logout', $1, $2, $3)`,
      [session.userId, session.businessId, currentRequestId() ?? null],
    );
  }

  async readPasswordHash(userId: string): Promise<string | null> {
    const result = await this.pool.query<{ passwordHash: string }>(
      `select password_hash as "passwordHash"
       from users
       where id = $1 and disabled_at is null`,
      [userId],
    );
    return result.rows[0]?.passwordHash ?? null;
  }

  async replacePassword(
    principal: AuthPrincipal,
    expectedHash: string,
    newHash: string,
  ): Promise<boolean> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await client.query(
        `update users u
         set password_hash = $1, must_change_password = false
         where u.id = $2
           and u.password_hash = $3
           and u.disabled_at is null
           and exists (
             select 1
             from business_memberships m
             where m.business_id = $4
               and m.user_id = u.id
               and m.disabled_at is null
           )`,
        [newHash, principal.userId, expectedHash, principal.businessId],
      );
      if (result.rowCount !== 1) {
        await client.query('rollback');
        return false;
      }
      await client.query(
        `update auth_sessions
         set revoked_at = coalesce(revoked_at, now())
         where user_id = $1 and id <> $2 and revoked_at is null`,
        [principal.userId, principal.sessionId],
      );
      await this.insertEvent(client, 'password_changed', {
        userId: principal.userId,
        businessId: principal.businessId,
      });
      await client.query('commit');
      return true;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async resolvePrincipal(input: {
    sessionId: string;
    userId: string;
    businessId: string;
  }): Promise<AuthPrincipal | null> {
    const result = await this.pool.query<SessionPrincipalRow>(
      `${this.sessionPrincipalSelect()}
       where s.id = $1
         and s.user_id = $2
         and s.business_id = $3
         and s.revoked_at is null
         and s.expires_at > now()
         and u.disabled_at is null
         and m.disabled_at is null`,
      [input.sessionId, input.userId, input.businessId],
    );
    const row = result.rows[0];
    return row ? this.toPrincipal(row) : null;
  }

  private async insertSession(
    client: PoolClient,
    candidate: LoginCandidate,
  ): Promise<IssuedRefreshSession> {
    const sessionId = randomUUID();
    const refreshToken = `rt_${randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + this.refreshTtlDays * 86_400_000);
    await client.query(
      `insert into auth_sessions
         (id, user_id, business_id, membership_id, refresh_token_hash, expires_at)
       values ($1, $2, $3, $4, $5, $6)`,
      [
        sessionId,
        candidate.userId,
        candidate.businessId,
        candidate.membershipId,
        this.hashRefreshToken(refreshToken),
        expiresAt,
      ],
    );
    return {
      refreshToken,
      expiresAt,
      principal: {
        sessionId,
        userId: candidate.userId,
        email: candidate.email,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        phoneE164: candidate.phoneE164,
        businessId: candidate.businessId,
        businessSlug: candidate.businessSlug,
        membershipId: candidate.membershipId,
        role: candidate.role,
        mustChangePassword: candidate.mustChangePassword,
      },
    };
  }

  private insertEvent(
    client: PoolClient,
    event: string,
    input: { userId?: string; businessId?: string; identityHash?: string },
  ): Promise<unknown> {
    return client.query(
      `insert into auth_events
         (event, user_id, business_id, identity_hash, request_id)
       values ($1, $2, $3, $4, $5)`,
      [
        event,
        input.userId ?? null,
        input.businessId ?? null,
        input.identityHash ?? null,
        currentRequestId() ?? null,
      ],
    );
  }

  private sessionPrincipalSelect(): string {
    return `select s.id as "sessionId",
                   s.user_id as "userId",
                   u.email::text as email,
                   u.first_name as "firstName",
                   u.last_name as "lastName",
                   u.phone_e164 as "phoneE164",
                   s.business_id as "businessId",
                   b.slug as "businessSlug",
                   s.membership_id as "membershipId",
                   m.role,
                   u.must_change_password as "mustChangePassword",
                   s.refresh_token_hash as "refreshTokenHash",
                   s.expires_at as "expiresAt",
                   s.revoked_at as "revokedAt"
            from auth_sessions s
            join users u on u.id = s.user_id
            join business_memberships m
              on m.id = s.membership_id
             and m.business_id = s.business_id
             and m.user_id = s.user_id
            join businesses b on b.id = s.business_id`;
  }

  private toPrincipal(row: SessionPrincipalRow): AuthPrincipal {
    return {
      sessionId: row.sessionId,
      userId: row.userId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phoneE164: row.phoneE164,
      businessId: row.businessId,
      businessSlug: row.businessSlug,
      membershipId: row.membershipId,
      role: row.role,
      mustChangePassword: row.mustChangePassword,
    };
  }

  private toLoginCandidate(row: SessionPrincipalRow): LoginCandidate {
    return {
      userId: row.userId,
      email: row.email,
      firstName: row.firstName,
      lastName: row.lastName,
      phoneE164: row.phoneE164,
      businessId: row.businessId,
      businessSlug: row.businessSlug,
      membershipId: row.membershipId,
      role: row.role,
      mustChangePassword: row.mustChangePassword,
      passwordHash: '',
    };
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private hashIdentity(email: string): string {
    return createHmac('sha256', this.identitySecret)
      .update(`auth-identity:${email.trim().toLowerCase()}`)
      .digest('hex');
  }
}
