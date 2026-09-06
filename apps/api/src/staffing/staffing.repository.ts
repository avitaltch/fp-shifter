import { Injectable } from '@nestjs/common';
import { OperatorAuditRepository } from '../audit/operator-audit.repository';
import {
  TenantDatabaseService,
  type TenantTransaction,
} from '../database/tenant-database.service';
import type { TenantScope } from '../tenancy/tenant-scope';
import type {
  CreateStaffInput,
  DeactivateStaffOutcome,
  StaffMember,
} from './staffing.types';

@Injectable()
export class StaffingRepository {
  constructor(
    private readonly database: TenantDatabaseService,
    private readonly audit: OperatorAuditRepository,
  ) {}

  list(scope: TenantScope): Promise<readonly StaffMember[]> {
    return this.database.query<StaffMember>(
      scope,
      `${STAFF_SELECT}
       where m.business_id = $1
       group by u.id, m.role, m.disabled_at
       order by m.disabled_at nulls first, u.first_name, u.last_name, u.id`,
    );
  }

  find(scope: TenantScope, userId: string): Promise<StaffMember | null> {
    return this.database
      .query<StaffMember>(
        scope,
        `${STAFF_SELECT}
         where m.business_id = $1 and m.user_id = $2
         group by u.id, m.role, m.disabled_at`,
        [userId],
      )
      .then(([staff]) => staff ?? null);
  }

  create(
    scope: TenantScope,
    actorUserId: string,
    input: CreateStaffInput,
  ): Promise<StaffMember> {
    return this.database.transaction(scope, async (transaction) => {
      const [user] = await transaction.query<{ userId: string }>(
        `insert into users
           (email, password_hash, first_name, last_name, phone_e164, must_change_password)
         select $2, $3, $4, $5, $6, true
         from businesses
         where id = $1
         returning id as "userId"`,
        [input.email, input.passwordHash, input.firstName, input.lastName, input.phoneE164],
      );
      if (!user) throw new Error('Staff user insert returned no row');
      await transaction.query(
        `insert into business_memberships (business_id, user_id, role)
         values ($1, $2, $3::membership_role)`,
        [user.userId, input.role],
      );
      await this.audit.record(
        transaction,
        actorUserId,
        'staff.created',
        'staff_membership',
        user.userId,
        { role: input.role },
      );
      const staff = await this.findInTransaction(transaction, user.userId);
      if (!staff) throw new Error('Created staff member was not found');
      return staff;
    });
  }

  updateMyProfile(
    scope: TenantScope,
    actorUserId: string,
    input: { firstName: string; lastName: string; phoneE164: string | null },
  ): Promise<StaffMember | null> {
    return this.database.transaction(scope, async (transaction) => {
      const [updated] = await transaction.query<{ userId: string }>(
        `update users u
         set first_name = $3, last_name = $4, phone_e164 = $5
         where u.id = $2
           and u.disabled_at is null
           and exists (
             select 1 from business_memberships m
             where m.business_id = $1 and m.user_id = u.id and m.disabled_at is null
           )
         returning u.id as "userId"`,
        [actorUserId, input.firstName, input.lastName, input.phoneE164],
      );
      if (!updated) return null;
      await this.audit.record(
        transaction,
        actorUserId,
        'staff.profile_updated',
        'staff_membership',
        actorUserId,
      );
      return this.findInTransaction(transaction, actorUserId);
    });
  }

  updateRole(
    scope: TenantScope,
    actorUserId: string,
    userId: string,
    role: 'Manager' | 'Provider',
  ): Promise<StaffMember | null> {
    return this.database.transaction(scope, async (transaction) => {
      const [updated] = await transaction.query<{ userId: string }>(
        `update business_memberships
         set role = $3::membership_role
         where business_id = $1 and user_id = $2 and role <> 'Owner'
         returning user_id as "userId"`,
        [userId, role],
      );
      if (!updated) return null;
      await this.audit.record(
        transaction,
        actorUserId,
        'staff.role_changed',
        'staff_membership',
        userId,
        { role },
      );
      return this.findInTransaction(transaction, userId);
    });
  }

  setActive(
    scope: TenantScope,
    actorUserId: string,
    userId: string,
    active: boolean,
  ): Promise<DeactivateStaffOutcome> {
    return this.database.transaction(scope, async (transaction) => {
      const [membership] = await transaction.query<{ role: string }>(
        `select role::text as role
         from business_memberships
         where business_id = $1 and user_id = $2
         for update`,
        [userId],
      );
      if (!membership || membership.role === 'Owner') return { status: 'not_found' };
      if (!active) {
        const [future] = await transaction.query<{ exists: boolean }>(
          `select exists (
             select 1 from appointment_steps
             where business_id = $1
               and provider_user_id = $2
               and status in ('Scheduled', 'InProgress')
               and ends_at > now()
           ) as exists`,
          [userId],
        );
        if (future?.exists) return { status: 'future_assignments' };
      }
      await transaction.query(
        `update business_memberships
         set disabled_at = case when $3::boolean then null else now() end
         where business_id = $1 and user_id = $2`,
        [userId, active],
      );
      if (!active) {
        await transaction.query(
          `update auth_sessions
           set revoked_at = coalesce(revoked_at, now())
           where business_id = $1 and user_id = $2 and revoked_at is null`,
          [userId],
        );
      }
      await this.audit.record(
        transaction,
        actorUserId,
        active ? 'staff.reactivated' : 'staff.deactivated',
        'staff_membership',
        userId,
      );
      const staff = await this.findInTransaction(transaction, userId);
      if (!staff) return { status: 'not_found' };
      return { status: 'updated', staff };
    });
  }

  private findInTransaction(
    transaction: TenantTransaction,
    userId: string,
  ): Promise<StaffMember | null> {
    return transaction
      .query<StaffMember>(
        `${STAFF_SELECT}
         where m.business_id = $1 and m.user_id = $2
         group by u.id, m.role, m.disabled_at`,
        [userId],
      )
      .then(([staff]) => staff ?? null);
  }
}

const STAFF_SELECT = `select u.id as "userId",
                             u.email::text as email,
                             u.first_name as "firstName",
                             u.last_name as "lastName",
                             u.phone_e164 as "phoneE164",
                             m.role,
                             coalesce(m.disabled_at, u.disabled_at) as "disabledAt",
                             u.must_change_password as "mustChangePassword",
                             coalesce(
                               array_agg(ps.service_id order by ps.service_id)
                                 filter (where ps.service_id is not null),
                               '{}'
                             ) as "serviceIds"
                      from business_memberships m
                      join users u on u.id = m.user_id
                      left join provider_skills ps
                        on ps.business_id = m.business_id
                       and ps.provider_user_id = m.user_id`;
