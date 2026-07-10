import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAsyncData } from './useAsyncData';

describe('useAsyncData', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('fetches on mount and exposes the data', async () => {
    const fetchFn = vi.fn().mockResolvedValue([1, 2, 3]);
    const { result } = renderHook(() => useAsyncData(fetchFn));

    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data).toEqual([1, 2, 3]);
    expect(result.current.error).toBeNull();
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('sets the provided error message when the fetch fails', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() =>
      useAsyncData(fetchFn, { errorMessage: 'שגיאה מותאמת.' })
    );

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBe('שגיאה מותאמת.');
    expect(result.current.data).toBeNull();
  });

  it('falls back to a generic error message', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useAsyncData(fetchFn));

    await waitFor(() => expect(result.current.error).toBe('אירעה שגיאה בטעינת הנתונים.'));
  });

  it('does nothing while disabled, fetches once enabled', async () => {
    const fetchFn = vi.fn().mockResolvedValue('data');
    const { result, rerender } = renderHook(
      ({ enabled }) => useAsyncData(fetchFn, { enabled }),
      { initialProps: { enabled: false } }
    );

    expect(result.current.loading).toBe(false);
    expect(fetchFn).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.data).toBe('data'));
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('refetch reloads and clears a previous error', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('recovered');
    const { result } = renderHook(() => useAsyncData(fetchFn));

    await waitFor(() => expect(result.current.error).not.toBeNull());

    await act(() => result.current.refetch());
    expect(result.current.error).toBeNull();
    expect(result.current.data).toBe('recovered');
  });

  it('setData allows optimistic local updates', async () => {
    const fetchFn = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]);
    const { result } = renderHook(() => useAsyncData(fetchFn));
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.setData((prev) => prev.filter((x) => x.id !== 1)));
    expect(result.current.data).toEqual([{ id: 2 }]);
  });
});
