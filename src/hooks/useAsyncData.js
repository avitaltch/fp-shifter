import { useState, useEffect, useCallback } from 'react';

// The fetch-on-mount lifecycle every list page repeats: loading flag,
// Hebrew error message, refetch, and setData for optimistic updates.
// fetchFn MUST be referentially stable (wrap it in useCallback) —
// a new function per render would refetch in a loop.
export function useAsyncData(fetchFn, { enabled = true, errorMessage } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    try {
      setLoading(true);
      setError(null);
      setData(await fetchFn());
    } catch (err) {
      console.error(err);
      setError(errorMessage || 'אירעה שגיאה בטעינת הנתונים.');
    } finally {
      setLoading(false);
    }
  }, [fetchFn, enabled, errorMessage]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { data, setData, loading, error, refetch };
}
