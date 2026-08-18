import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppointmentManagementRepository } from './appointment-management.repository';
import { AppointmentCancellationTooLateError } from './booking.errors';
import { ManagementTokenService } from './management-token.service';
import { PublicAppointmentManagementService } from './public-appointment-management.service';
import { PublicSchedulingRepository } from './public-scheduling.repository';

const BUSINESS_ID = '00000000-0000-4000-8000-000000000001';
const TOKEN = `sm_${'a'.repeat(43)}`;
const TOKEN_HASH = 'b'.repeat(64);
const managedAppointment = {
  appointmentId: '00000000-0000-4000-8000-000000000999',
  status: 'Confirmed' as const,
  startsAt: new Date('2030-01-07T12:00:00.000Z'),
  endsAt: new Date('2030-01-07T13:00:00.000Z'),
  totalPriceMinor: 20000,
  currency: 'ILS',
  customerFirstName: 'Ari',
  steps: [
    {
      sequenceNumber: 1,
      serviceId: '00000000-0000-4000-8000-000000000401',
      serviceName: 'Pet Trim',
      startsAt: new Date('2030-01-07T12:00:00.000Z'),
      endsAt: new Date('2030-01-07T13:00:00.000Z'),
    },
  ],
};

describe('PublicAppointmentManagementService', () => {
  let service: PublicAppointmentManagementService;
  let directory: { findBusinessBySlug: ReturnType<typeof vi.fn> };
  let appointments: {
    find: ReturnType<typeof vi.fn>;
    cancel: ReturnType<typeof vi.fn>;
  };
  let tokens: { hash: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    directory = {
      findBusinessBySlug: vi.fn().mockResolvedValue({
        businessId: BUSINESS_ID,
        businessName: 'Happy Pets Demo',
        timezone: 'Asia/Jerusalem',
      }),
    };
    appointments = {
      find: vi.fn().mockResolvedValue(managedAppointment),
      cancel: vi.fn().mockResolvedValue({
        ...managedAppointment,
        status: 'Cancelled',
      }),
    };
    tokens = { hash: vi.fn().mockReturnValue(TOKEN_HASH) };
    const module = await Test.createTestingModule({
      providers: [
        PublicAppointmentManagementService,
        { provide: PublicSchedulingRepository, useValue: directory },
        { provide: AppointmentManagementRepository, useValue: appointments },
        { provide: ManagementTokenService, useValue: tokens },
      ],
    }).compile();
    service = module.get(PublicAppointmentManagementService);
  });

  it('returns a serialized appointment without exposing provider or token data', async () => {
    const result = await service.get('happy-pets-demo', `Bearer ${TOKEN}`);

    expect(tokens.hash).toHaveBeenCalledWith(TOKEN);
    expect(appointments.find).toHaveBeenCalledWith(
      expect.objectContaining({ businessId: BUSINESS_ID }),
      TOKEN_HASH,
    );
    expect(result).toEqual({
      appointmentId: managedAppointment.appointmentId,
      status: 'Confirmed',
      startsAt: '2030-01-07T12:00:00.000Z',
      endsAt: '2030-01-07T13:00:00.000Z',
      totalPriceMinor: 20000,
      currency: 'ILS',
      timezone: 'Asia/Jerusalem',
      customerFirstName: 'Ari',
      steps: [
        {
          sequenceNumber: 1,
          serviceId: managedAppointment.steps[0]?.serviceId,
          serviceName: 'Pet Trim',
          startsAt: '2030-01-07T12:00:00.000Z',
          endsAt: '2030-01-07T13:00:00.000Z',
        },
      ],
    });
    expect(JSON.stringify(result)).not.toContain(BUSINESS_ID);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
    expect(JSON.stringify(result)).not.toContain('provider');
  });

  it.each([undefined, 'Basic abc', 'Bearer invalid'])(
    'returns the same not-found response for an invalid authorization header',
    async (authorization) => {
      const error = await service
        .get('happy-pets-demo', authorization)
        .catch((reason) => reason);

      expect(error).toBeInstanceOf(NotFoundException);
      expect(error.getResponse()).toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
      expect(directory.findBusinessBySlug).not.toHaveBeenCalled();
      expect(appointments.find).not.toHaveBeenCalled();
    },
  );

  it('does not allow a valid token to cross business boundaries', async () => {
    directory.findBusinessBySlug.mockResolvedValue({
      businessId: '00000000-0000-4000-8000-000000000002',
      businessName: 'Other Business',
      timezone: 'Asia/Jerusalem',
    });
    appointments.find.mockResolvedValue(null);

    const error = await service
      .get('other-business', `Bearer ${TOKEN}`)
      .catch((reason) => reason);

    expect(error).toBeInstanceOf(NotFoundException);
    expect(error.getResponse()).toMatchObject({ code: 'APPOINTMENT_NOT_FOUND' });
  });

  it('maps cancellation timing failures to a stable conflict response', async () => {
    appointments.cancel.mockRejectedValue(
      new AppointmentCancellationTooLateError('Appointment already started'),
    );

    const error = await service
      .cancel('happy-pets-demo', `Bearer ${TOKEN}`)
      .catch((reason) => reason);

    expect(error).toBeInstanceOf(ConflictException);
    expect(error.getResponse()).toMatchObject({
      code: 'CANCELLATION_NOT_ALLOWED',
    });
  });
});
