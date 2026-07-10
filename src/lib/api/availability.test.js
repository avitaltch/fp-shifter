import { describe, it, expect, vi, beforeEach } from 'vitest';
import { supabase } from '../supabase';
import { addAvailabilityBulk } from './availability';

vi.mock('../supabase', () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

function createQuery(result) {
  const query = {};
  const methods = [
    'select', 'insert', 'update', 'delete',
    'eq', 'neq', 'is', 'not', 'gte', 'lte', 'order', 'single',
  ];
  for (const m of methods) {
    query[m] = vi.fn(() => query);
  }
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return query;
}

describe('addAvailabilityBulk', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('inserts an array of rows and returns the created rows', async () => {
    const entries = [
      {
        user_id: 'user-1',
        available_date: '2026-07-12',
        start_time: '08:00',
        end_time: '16:00',
      },
      {
        user_id: 'user-1',
        available_date: '2026-07-13',
        start_time: '08:00',
        end_time: '16:00',
      },
    ];
    const created = entries.map((e, i) => ({ id: `a${i + 1}`, ...e }));
    const query = createQuery({ data: created, error: null });
    supabase.from.mockReturnValue(query);

    await expect(addAvailabilityBulk(entries)).resolves.toEqual(created);
    expect(supabase.from).toHaveBeenCalledWith('availabilities');
    expect(query.insert).toHaveBeenCalledWith(entries);
    expect(query.select).toHaveBeenCalled();
    expect(query.single).not.toHaveBeenCalled();
  });

  it('propagates insert errors', async () => {
    const query = createQuery({ data: null, error: new Error('insert failed') });
    supabase.from.mockReturnValue(query);

    await expect(
      addAvailabilityBulk([
        {
          user_id: 'user-1',
          available_date: '2026-07-12',
          start_time: '08:00',
          end_time: '16:00',
        },
      ])
    ).rejects.toThrow('insert failed');
  });
});
