import { useState, useEffect, useCallback, useRef } from 'react';

// The fetch-on-mount lifecycle every list page repeats: loading flag,
// Hebrew error message, refetch, and setData for optimistic updates.
// fetchFn MUST be referentially stable (wrap it in useCallback) —
// a new function per render would refetch in a loop.
export function useAsyncData(fetchFn, { enabled = true, errorMessage } = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);
  const requestIdRef = useRef(0);
  const mountedRef = useRef(true);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    const requestId = ++requestIdRef.current;
    try {
      setLoading(true);
      setError(null);
      const nextData = await fetchFn();
      if (mountedRef.current && requestId === requestIdRef.current) {
        setData(nextData);
      }
      return nextData;
    } catch (err) {
      if (mountedRef.current && requestId === requestIdRef.current) {
        console.error(err);
        setError(errorMessage || 'אירעה שגיאה בטעינת הנתונים.');
      }
    } finally {
      if (mountedRef.current && requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [fetchFn, enabled, errorMessage]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      requestIdRef.current += 1;
      setLoading(false);
      return undefined;
    }
    refetch();
    return () => {
      requestIdRef.current += 1;
    };
  }, [enabled, refetch]);

  return { data, setData, loading, error, refetch };
}
