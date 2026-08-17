import { Test } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('checks database connectivity with a minimal query', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] });
    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: DATABASE_POOL, useValue: { query, end: vi.fn() } },
      ],
    }).compile();

    await module.get(DatabaseService).ping();

    expect(query).toHaveBeenCalledWith('select 1');
  });

  it('closes the injected pool during application shutdown', async () => {
    const end = vi.fn().mockResolvedValue(undefined);
    const on = vi.fn();
    const off = vi.fn();
    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: DATABASE_POOL,
          useValue: { query: vi.fn(), end, on, off },
        },
      ],
    }).compile();
    const service = module.get(DatabaseService);

    service.onModuleInit();
    await service.onModuleDestroy();

    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
    expect(off).toHaveBeenCalledWith('error', expect.any(Function));
    expect(end).toHaveBeenCalledOnce();
  });

  it('logs idle pool failures instead of leaving the event unhandled', async () => {
    let errorListener: ((error: Error & { code?: string }) => void) | undefined;
    const loggerError = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => {});
    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: DATABASE_POOL,
          useValue: {
            query: vi.fn(),
            end: vi.fn(),
            on: vi.fn((_event: string, listener: typeof errorListener) => {
              errorListener = listener;
            }),
            off: vi.fn(),
          },
        },
      ],
    }).compile();

    module.get(DatabaseService).onModuleInit();
    errorListener?.(
      Object.assign(new Error('connection lost'), { code: 'ECONNRESET' }),
    );

    expect(loggerError).toHaveBeenCalledWith({
      event: 'database_pool_error',
      errorName: 'Error',
      errorMessage: 'connection lost',
      errorCode: 'ECONNRESET',
    });
  });
});
