import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import type { OpportunitiesResponse } from '../types';

export function useOpportunities() {
  const [data, setData] = useState<OpportunitiesResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number>(0);
  const timer = useRef<number | null>(null);
  const intervalRef = useRef(5000);

  const load = useCallback(async () => {
    try {
      const d = await api.opportunities();
      setData(d);
      setError(null);
      setLastFetch(Date.now());
      intervalRef.current = Math.min(15_000, Math.max(3000, (d.config.scanIntervalSec * 1000) / 2));
    } catch (e) {
      setError((e as Error).message || 'Сервер недоступний');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      if (document.visibilityState === 'visible' || !data) await load();
      if (!cancelled) timer.current = window.setTimeout(tick, intervalRef.current);
    };
    void tick();
    return () => {
      cancelled = true;
      if (timer.current) window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  return { data, error, loading, lastFetch, reload: load };
}
