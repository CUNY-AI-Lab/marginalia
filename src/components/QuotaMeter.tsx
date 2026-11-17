'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiJSON } from '@/lib/api';

// The Gateway's delayed estimate of the person's model allowance (microdollars). It is for display
// only and never blocks a call; the Gateway enforces the actual limit.
interface Quota {
  limit: number;
  estimated_used: number;
  used_percent: number;
  window_seconds: number;
  calculated_at: number;
}

const SPEND_EVENT = 'marginalia:spend';

// Call after model work so the meter re-reads the estimate (debounced, since it lags).
export function notifySpend() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(SPEND_EVENT));
}

const dollars = (micro: number) => `$${(micro / 1_000_000).toFixed(micro < 1_000_000 ? 3 : 2)}`;

function windowLabel(seconds: number): string {
  const days = Math.round(seconds / 86400);
  if (days === 1) return 'today';
  if (days === 7) return 'this week';
  if (days >= 28 && days <= 31) return 'this month';
  return days > 1 ? `in ${days} days` : 'in this window';
}

export default function QuotaMeter() {
  const [quota, setQuota] = useState<Quota | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    try {
      setQuota(await apiJSON<Quota>('/api/quota'));
      setUnavailable(false);
    } catch {
      setUnavailable(true);
    }
  }, []);

  useEffect(() => {
    load();
    const onSpend = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(load, 4000);
    };
    window.addEventListener(SPEND_EVENT, onSpend);
    return () => {
      window.removeEventListener(SPEND_EVENT, onSpend);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  if (unavailable) {
    return <span className="shrink-0 whitespace-nowrap text-xs text-gray-400 dark:text-gray-500" title="The allowance estimate is unavailable right now.">Allowance: —</span>;
  }
  if (!quota) return null;
  const percent = Math.min(100, Math.max(0, quota.used_percent));
  const tone = percent >= 90 ? 'bg-red-500' : percent >= 70 ? 'bg-amber-500' : 'bg-emerald-500';
  const title = `Estimated ${dollars(quota.estimated_used)} of ${dollars(quota.limit)} used ${windowLabel(quota.window_seconds)}. This is your CUNY AI Lab model allowance, shared across Lab tools; the estimate can lag by a few minutes.`;
  return (
    <div className="flex items-center gap-2 shrink-0 whitespace-nowrap" title={title} aria-label={title}>
      <span className="hidden xl:inline text-xs text-gray-500 dark:text-gray-400">Allowance</span>
      <div className="w-14 lg:w-20 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percent)}>
        <div className={`h-full ${tone}`} style={{ width: `${percent}%` }} />
      </div>
      <span className="text-xs tabular-nums text-gray-500 dark:text-gray-400">{Math.round(percent)}%</span>
    </div>
  );
}
