import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthPrincipal } from '../auth/auth.types';
import { AppointmentManagementRepository } from '../scheduling/appointment-management.repository';
import { OperationConflictError } from './operations.errors';
import { OperationsRepository } from './operations.repository';
import { OperationsService } from './operations.service';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID = '00000000-0000-4000-8000-000000000201';
const STEP_ID = '00000000-0000-4000-8000-000000000501';
const PROVIDER_ID = '00000000-0000-4000-8000-000000000202';

const owner: AuthPrincipal = {
  sessionId: '00000000-0000-4000-8000-000000009001',
  userId: USER_ID,
  email: 'owner@example.test',
  firstName: 'Owner',
  lastName: 'User',
  businessId: BUSINESS_ID,
  businessSlug: 'happy-pets-demo',
  membershipId: '00000000-0000-4000-8000-000000000301',
  role: 'Owner',
};

const provider: AuthPrincipal = {
  ...owner,
  userId: PROVIDER_ID,
  role: 'Provider',
};

function repositoryMock() {
  return {
    listAppointments: vi.fn().mockResolvedValue([]),
    listProviderSteps: vi.fn().mockResolvedValue([]),
    listReassignmentOptions: vi.fn().mockResolvedValue([]),
    reassignStep: vi.fn().mockResolvedValue({ id: STEP_ID }),
    updateStepStatus: vi.fn().mockResolvedValue({ id: STEP_ID }),
  };
}

function appointmentManagementMock() {
  return { cancelById: vi.fn().mockResolvedValue({ appointmentId: STEP_ID }) };
}

describe('OperationsService', () => {
  let operations: OperationsService;
  let repository: ReturnType<typeof repositoryMock>;
  let appointmentManagement: ReturnType<typeof appointmentManagementMock>;

  beforeEach(async () => {
    repository = repositoryMock();
    appointmentManagement = appointmentManagementMock();
    const module = await Test.createTestingModule({
      providers: [
        OperationsService,
        { provide: OperationsRepository, useValue: repository },
        { provide: AppointmentManagementRepository, useValue: appointmentManagement },
      ],
    }).compile();
    operations = module.get(OperationsService);
  });

  it('uses the authenticated tenant and a bounded calendar range', async () => {
    await operations.listAppointments(owner, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-08T00:00:00.000Z',
    });
    expect(repository.listAppointments).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      new Date('2026-09-01T00:00:00.000Z'),
      new Date('2026-09-08T00:00:00.000Z'),
      undefined,
    );

    expect(() =>
      operations.listAppointments(owner, {
        from: '2026-09-08T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
    expect(() =>
      operations.listAppointments(owner, {
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-09-01T00:00:00.000Z',
      }),
    ).toThrow(BadRequestException);
  });

  it('always scopes personal schedules and provider status changes to self', async () => {
    await operations.listMySteps(provider, {
      from: '2026-09-01T00:00:00.000Z',
      to: '2026-09-08T00:00:00.000Z',
    });
    expect(repository.listProviderSteps).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      PROVIDER_ID,
      expect.any(Date),
      expect.any(Date),
    );

    await operations.updateStepStatus(provider, STEP_ID, 'Completed');
    expect(repository.updateStepStatus).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      PROVIDER_ID,
      STEP_ID,
      'Completed',
      PROVIDER_ID,
    );

    await operations.updateStepStatus(owner, STEP_ID, 'Completed');
    expect(repository.updateStepStatus).toHaveBeenLastCalledWith(
      expect.anything(),
      USER_ID,
      STEP_ID,
      'Completed',
      undefined,
    );
  });

  it('maps absent tenant resources and safe scheduling conflicts', async () => {
    repository.listReassignmentOptions.mockResolvedValue(null);
    await expect(
      operations.listReassignmentOptions(owner, STEP_ID),
    ).rejects.toBeInstanceOf(NotFoundException);

    repository.reassignStep.mockRejectedValue(
      new OperationConflictError('PROVIDER_NOT_AVAILABLE', 'Provider unavailable'),
    );
    await expect(
      operations.reassignStep(owner, STEP_ID, PROVIDER_ID),
    ).rejects.toMatchObject({
      response: { code: 'PROVIDER_NOT_AVAILABLE' },
    });

    repository.updateStepStatus.mockRejectedValue({
      code: '23P01',
      constraint: 'appointment_steps_provider_no_overlap',
    });
    await expect(
      operations.updateStepStatus(owner, STEP_ID, 'InProgress'),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
