import { useState, useCallback, useMemo, useRef } from 'react';
import { friendlyError } from '../lib/errors';

// The mutation lifecycle every page repeats: clear the previous message,
// mark the acted-on row busy, translate failures via friendlyError, and
// optionally run an error side-effect (e.g. refetch after a lost race).
// `run` never throws — callers branch on the returned `ok` flag.
export function useAction({ onError } = {}) {
  const [pendingCounts, setPendingCounts] = useState(() => new Map());
  const [message, setMessage] = useState(null);
  const latestActionIdRef = useRef(0);

  const run = useCallback(
    async (key, fn, { success, errorFallback } = {}) => {
      const actionId = ++latestActionIdRef.current;
      setMessage(null);
      setPendingCounts((previous) => {
        const next = new Map(previous);
        next.set(key, (next.get(key) ?? 0) + 1);
        return next;
      });
      try {
        const result = await fn();
        if (success && actionId === latestActionIdRef.current) {
          setMessage({ type: 'success', text: success });
        }
        return { ok: true, result };
      } catch (err) {
        console.error(err);
        if (actionId === latestActionIdRef.current) {
          setMessage({ type: 'error', text: friendlyError(err, errorFallback) });
        }
        onError?.(err);
        return { ok: false, error: err };
      } finally {
        setPendingCounts((previous) => {
          const next = new Map(previous);
          const remaining = (next.get(key) ?? 1) - 1;
          if (remaining > 0) next.set(key, remaining);
          else next.delete(key);
          return next;
        });
      }
    },
    [onError]
  );

  const busyKeys = useMemo(() => new Set(pendingCounts.keys()), [pendingCounts]);
  const isBusy = useCallback((key) => busyKeys.has(key), [busyKeys]);
  const busyKey = pendingCounts.size === 1 ? pendingCounts.keys().next().value : null;

  return { busyKey, busyKeys, isBusy, message, setMessage, run };
}
