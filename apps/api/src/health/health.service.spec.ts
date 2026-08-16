import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { DatabaseService } from '../database/database.service';
import { HealthService } from './health.service';

describe('HealthService', () => {
  async function createService(ping = vi.fn().mockResolvedValue(undefined)) {
    const module = await Test.createTestingModule({
      providers: [
        HealthService,
        { provide: DatabaseService, useValue: { ping } },
      ],
    }).compile();

    return { service: module.get(HealthService), ping };
  }

  it('reports liveness without touching the database', async () => {
    const { service, ping } = await createService();

    expect(service.liveness()).toMatchObject({
      status: 'ok',
      service: 'shiftsync-api',
    });
    expect(ping).not.toHaveBeenCalled();
  });

  it('reports readiness after the database responds', async () => {
    const { service, ping } = await createService();

    await expect(service.readiness()).resolves.toMatchObject({
      status: 'ok',
      checks: { database: 'up' },
    });
    expect(ping).toHaveBeenCalledOnce();
  });

  it('returns a sanitized service-unavailable error when the database fails', async () => {
    const { service } = await createService(
      vi.fn().mockRejectedValue(new Error('password leaked in driver error')),
    );

    await expect(service.readiness()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    await expect(service.readiness()).rejects.not.toThrow('password leaked');
  });
});
