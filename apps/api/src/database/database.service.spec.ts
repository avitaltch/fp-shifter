import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';
import { DATABASE_POOL } from './database.constants';
import { DatabaseService } from './database.service';

describe('DatabaseService', () => {
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
    const module = await Test.createTestingModule({
      providers: [
        DatabaseService,
        { provide: DATABASE_POOL, useValue: { query: vi.fn(), end } },
      ],
    }).compile();
    const service = module.get(DatabaseService);

    await service.onModuleDestroy();

    expect(end).toHaveBeenCalledOnce();
  });
});
