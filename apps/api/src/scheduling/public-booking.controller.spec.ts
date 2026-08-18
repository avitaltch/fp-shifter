import { Test } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CreatePublicBookingDto } from './dto/create-public-booking.dto';
import { PublicBookingController } from './public-booking.controller';
import { PublicBookingService } from './public-booking.service';

const idempotencyKey = '00000000-0000-4000-8000-000000000444';
const bookingRequest: CreatePublicBookingDto = {
  date: '2030-01-07',
  startsAt: '2030-01-07T12:00:00.000Z',
  serviceIds: ['00000000-0000-4000-8000-000000000401'],
  customer: {
    firstName: 'Ari',
    lastName: 'Cohen',
    phoneE164: '+972501234567',
  },
};

describe('PublicBookingController', () => {
  let controller: PublicBookingController;
  let bookings: { create: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    bookings = {
      create: vi.fn().mockResolvedValue({
        appointmentId: '00000000-0000-4000-8000-000000000999',
      }),
    };
    const module = await Test.createTestingModule({
      controllers: [PublicBookingController],
      providers: [{ provide: PublicBookingService, useValue: bookings }],
    }).compile();
    controller = module.get(PublicBookingController);
  });

  it('passes the validated idempotency key to the booking service', async () => {
    await controller.create(
      { businessSlug: 'happy-pets-demo' },
      bookingRequest,
      idempotencyKey,
      '203.0.113.10',
    );

    expect(bookings.create).toHaveBeenCalledWith(
      'happy-pets-demo',
      bookingRequest,
      idempotencyKey,
      '203.0.113.10',
    );
  });
});
