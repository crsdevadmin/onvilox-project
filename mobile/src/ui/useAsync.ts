import { useCallback, useEffect, useState } from 'react';

/** Load data on mount, with pull-to-refresh and an error message. */
export function useAsync<T>(fn: () => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(async (isRefresh = false) => {
    isRefresh ? setRefreshing(true) : setLoading(true);
    try {
      setData(await fn());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fn]);

  useEffect(() => { void run(); }, [run]);
  return { data, error, loading, refreshing, reload: () => run(true) };
}
