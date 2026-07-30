import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Data-fetching hook with the three things every page here needs:
 * loading state, error surface, and a `reload()` that pages call after a
 * mutation. Deliberately tiny — no cache, no dedupe. With a handful of screens
 * and an explicit reload after every write, a cache would only create a way
 * for the UI to disagree with the server, which is the last thing a planner
 * that argues about time should do.
 */
export function useApi(fn, deps = [], { immediate = true } = {}) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(immediate);
  const mounted = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fnRef.current();
      if (mounted.current) setData(result);
      return result;
    } catch (err) {
      if (err.name === "AbortError") return undefined;
      if (mounted.current) setError(err);
      return undefined;
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (immediate) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload: run, setData };
}

/** Wraps a mutation so buttons can show a pending state and errors surface. */
export function useMutation(fn, { onSuccess, onError } = {}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);

  const mutate = useCallback(
    async (...args) => {
      setPending(true);
      setError(null);
      try {
        const res = await fn(...args);
        onSuccess?.(res);
        return res;
      } catch (err) {
        setError(err);
        onError?.(err);
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn, onSuccess, onError]
  );

  return { mutate, pending, error };
}
