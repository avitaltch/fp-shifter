import { useState, useCallback } from 'react';
import { friendlyError } from '../lib/errors';

// The mutation lifecycle every page repeats: clear the previous message,
// mark the acted-on row busy, translate failures via friendlyError, and
// optionally run an error side-effect (e.g. refetch after a lost race).
// `run` never throws — callers branch on the returned `ok` flag.
export function useAction({ onError } = {}) {
  const [busyKey, setBusyKey] = useState(null);
  const [message, setMessage] = useState(null);

  const run = useCallback(
    async (key, fn, { success, errorFallback } = {}) => {
      setMessage(null);
      setBusyKey(key);
      try {
        const result = await fn();
        if (success) setMessage({ type: 'success', text: success });
        return { ok: true, result };
      } catch (err) {
        console.error(err);
        setMessage({ type: 'error', text: friendlyError(err, errorFallback) });
        onError?.(err);
        return { ok: false, error: err };
      } finally {
        setBusyKey(null);
      }
    },
    [onError]
  );

  return { busyKey, message, setMessage, run };
}
