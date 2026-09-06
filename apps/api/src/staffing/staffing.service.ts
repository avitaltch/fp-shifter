import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { AuthPrincipal } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { TenantScope } from '../tenancy/tenant-scope';
import type {
  CreateStaffDto,
  UpdateMyProfileDto,
  UpdateStaffRoleDto,
} from './dto/staffing.dto';
import { StaffingRepository } from './staffing.repository';
import type { StaffMember } from './staffing.types';

interface PostgresError {
  code?: string;
}

@Injectable()
export class StaffingService {
  constructor(
    private readonly repository: StaffingRepository,
    private readonly passwords: PasswordService,
  ) {}

  list(principal: AuthPrincipal): Promise<readonly StaffMember[]> {
    return this.repository.list(this.scope(principal));
  }

  async create(
    principal: AuthPrincipal,
    request: CreateStaffDto,
  ): Promise<StaffMember> {
    this.assertCanManageRole(principal, request.role);
    try {
      return await this.repository.create(
        this.scope(principal),
        principal.userId,
        {
          email: request.email,
          passwordHash: await this.passwords.hash(request.temporaryPassword),
          firstName: request.firstName,
          lastName: request.lastName,
          phoneE164: request.phoneE164 ?? null,
          role: request.role,
        },
      );
    } catch (error) {
      if (isPostgresError(error, '23505')) {
        throw new ConflictException({
          code: 'STAFF_EMAIL_IN_USE',
          message: 'A staff account with this email already exists',
        });
      }
      throw error;
    }
  }

  async updateMyProfile(
    principal: AuthPrincipal,
    request: UpdateMyProfileDto,
  ): Promise<StaffMember> {
    const staff = await this.repository.updateMyProfile(
      this.scope(principal),
      principal.userId,
      {
        firstName: request.firstName,
        lastName: request.lastName,
        phoneE164: request.phoneE164 ?? null,
      },
    );
    if (!staff) throw staffNotFound();
    return staff;
  }

  async updateRole(
    principal: AuthPrincipal,
    userId: string,
    request: UpdateStaffRoleDto,
  ): Promise<StaffMember> {
    this.assertCanManageRole(principal, request.role);
    const current = await this.repository.find(this.scope(principal), userId);
    if (!current || current.role === 'Owner') throw staffNotFound();
    const staff = await this.repository.updateRole(
      this.scope(principal),
      principal.userId,
      userId,
      request.role,
    );
    if (!staff) throw staffNotFound();
    return staff;
  }

  async setActive(
    principal: AuthPrincipal,
    userId: string,
    active: boolean,
  ): Promise<StaffMember> {
    if (principal.userId === userId) {
      throw new ConflictException({
        code: 'SELF_DEACTIVATION_NOT_ALLOWED',
        message: 'You cannot deactivate your own membership',
      });
    }
    const current = await this.repository.find(this.scope(principal), userId);
    if (!current || current.role === 'Owner') throw staffNotFound();
    this.assertCanManageRole(principal, current.role);
    const result = await this.repository.setActive(
      this.scope(principal),
      principal.userId,
      userId,
      active,
    );
    if (result.status === 'not_found') throw staffNotFound();
    if (result.status === 'future_assignments') {
      throw new ConflictException({
        code: 'STAFF_REASSIGNMENT_REQUIRED',
        message: 'Reassign this provider’s future appointments before deactivation',
      });
    }
    return result.staff;
  }

  private assertCanManageRole(
    principal: AuthPrincipal,
    role: 'Manager' | 'Provider',
  ): void {
    if (principal.role !== 'Owner' && role !== 'Provider') {
      throw new ForbiddenException({
        code: 'ROLE_MANAGEMENT_FORBIDDEN',
        message: 'Only an owner can manage managers',
      });
    }
  }

  private scope(principal: AuthPrincipal): TenantScope {
    return TenantScope.forBusiness(principal.businessId);
  }
}

function staffNotFound(): NotFoundException {
  return new NotFoundException({
    code: 'STAFF_NOT_FOUND',
    message: 'Staff member was not found',
  });
}

function isPostgresError(error: unknown, code: string): error is PostgresError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as PostgresError).code === code
  );
}
