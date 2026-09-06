import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import { PasswordService } from '../auth/password.service';
import { StaffingRepository } from './staffing.repository';
import { StaffingService } from './staffing.service';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const OWNER_ID = '00000000-0000-4000-8000-000000000201';
const STAFF_ID = '00000000-0000-4000-8000-000000000202';
const owner: AuthPrincipal = {
  sessionId: '00000000-0000-4000-8000-000000009001',
  userId: OWNER_ID,
  email: 'owner@example.test',
  firstName: 'Owner',
  lastName: 'User',
  phoneE164: null,
  businessId: BUSINESS_ID,
  businessSlug: 'happy-pets-demo',
  membershipId: '00000000-0000-4000-8000-000000000301',
  role: 'Owner',
  mustChangePassword: false,
};
const manager: AuthPrincipal = { ...owner, role: 'Manager' };
const provider = {
  userId: STAFF_ID,
  email: 'provider@example.test',
  firstName: 'Pat',
  lastName: 'Provider',
  phoneE164: null,
  role: 'Provider' as const,
  disabledAt: null,
  mustChangePassword: true,
  serviceIds: [],
};

describe('StaffingService', () => {
  let service: StaffingService;
  let repository: {
    list: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    updateMyProfile: ReturnType<typeof vi.fn>;
    updateRole: ReturnType<typeof vi.fn>;
    setActive: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    repository = {
      list: vi.fn().mockResolvedValue([provider]),
      find: vi.fn().mockResolvedValue(provider),
      create: vi.fn().mockResolvedValue(provider),
      updateMyProfile: vi.fn().mockResolvedValue(provider),
      updateRole: vi.fn().mockResolvedValue(provider),
      setActive: vi.fn().mockResolvedValue({ status: 'updated', staff: provider }),
    };
    const module = await Test.createTestingModule({
      providers: [
        StaffingService,
        { provide: StaffingRepository, useValue: repository },
        {
          provide: PasswordService,
          useValue: { hash: vi.fn().mockResolvedValue('$argon2id$temp-hash') },
        },
      ],
    }).compile();
    service = module.get(StaffingService);
  });

  it('creates a tenant-scoped provider with a hashed temporary password', async () => {
    await expect(
      service.create(manager, {
        email: provider.email,
        firstName: provider.firstName,
        lastName: provider.lastName,
        role: 'Provider',
        temporaryPassword: 'temporary password',
      }),
    ).resolves.toEqual(provider);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      OWNER_ID,
      expect.objectContaining({
        email: provider.email,
        passwordHash: '$argon2id$temp-hash',
      }),
    );
  });

  it('prevents managers from creating or managing managers', async () => {
    await expect(
      service.create(manager, {
        email: 'manager@example.test',
        firstName: 'New',
        lastName: 'Manager',
        role: 'Manager',
        temporaryPassword: 'temporary password',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not allow self-deactivation or owner deactivation', async () => {
    await expect(service.setActive(owner, OWNER_ID, false)).rejects.toBeInstanceOf(
      ConflictException,
    );
    repository.find.mockResolvedValue({ ...provider, role: 'Owner' });
    await expect(service.setActive(owner, STAFF_ID, false)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('requires future work to be reassigned before deactivation', async () => {
    repository.setActive.mockResolvedValue({ status: 'future_assignments' });
    await expect(service.setActive(owner, STAFF_ID, false)).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'STAFF_REASSIGNMENT_REQUIRED' },
    });
  });

  it('maps duplicate email constraints to a stable domain conflict', async () => {
    repository.create.mockRejectedValue({ code: '23505' });
    await expect(
      service.create(owner, {
        email: provider.email,
        firstName: provider.firstName,
        lastName: provider.lastName,
        role: 'Provider',
        temporaryPassword: 'temporary password',
      }),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      response: { code: 'STAFF_EMAIL_IN_USE' },
    });
  });
});
