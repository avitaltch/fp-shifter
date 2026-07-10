import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAction } from './useAction';

describe('useAction', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('marks the key busy while running and returns ok + result', async () => {
    const { result } = renderHook(() => useAction());

    let resolve;
    const pending = new Promise((r) => { resolve = r; });
    let outcome;
    act(() => {
      outcome = result.current.run('row-1', () => pending);
    });

    expect(result.current.busyKey).toBe('row-1');
    await act(async () => {
      resolve('done');
      await pending;
    });

    expect(result.current.busyKey).toBeNull();
    await expect(outcome).resolves.toEqual({ ok: true, result: 'done' });
  });

  it('sets a success message when configured', async () => {
    const { result } = renderHook(() => useAction());

    await act(() => result.current.run('k', async () => {}, { success: 'הצליח!' }));
    expect(result.current.message).toEqual({ type: 'success', text: 'הצליח!' });
  });

  it('translates errors via friendlyError and reports ok=false', async () => {
    const { result } = renderHook(() => useAction());

    let outcome;
    await act(async () => {
      outcome = await result.current.run(
        'k',
        async () => { throw new Error('SHIFT_TAKEN'); },
        { errorFallback: 'נפילה כללית.' }
      );
    });

    expect(outcome.ok).toBe(false);
    expect(result.current.message.type).toBe('error');
    // SHIFT_TAKEN has a dedicated friendly message, not the fallback
    expect(result.current.message.text).not.toBe('נפילה כללית.');
    expect(result.current.busyKey).toBeNull();
  });

  it('uses the fallback for unknown errors and calls onError', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() => useAction({ onError }));

    await act(() =>
      result.current.run('k', async () => { throw new Error('weird'); }, {
        errorFallback: 'נפילה כללית.',
      })
    );

    expect(result.current.message).toEqual({ type: 'error', text: 'נפילה כללית.' });
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('clears the previous message when a new action starts', async () => {
    const { result } = renderHook(() => useAction());

    await act(() => result.current.run('a', async () => {}, { success: 'ראשון' }));
    expect(result.current.message).not.toBeNull();

    let resolve;
    const pending = new Promise((r) => { resolve = r; });
    act(() => { result.current.run('b', () => pending); });
    expect(result.current.message).toBeNull();
    await act(async () => { resolve(); await pending; });
  });

  it('exposes setMessage for local validation messages', () => {
    const { result } = renderHook(() => useAction());
    act(() => result.current.setMessage({ type: 'error', text: 'ולידציה' }));
    expect(result.current.message).toEqual({ type: 'error', text: 'ולידציה' });
  });
});
