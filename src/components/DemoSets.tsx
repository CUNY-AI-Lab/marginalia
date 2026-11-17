'use client';

import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/api';
import { DemoSetSummary, importBundle, WorkspaceBundle } from '@/lib/bundles';

// Built-in public-domain reading sets. Each comes with its source profiles already written, so it
// can be read immediately; only the commentary itself calls a model.
export default function DemoSets({ compact = false }: { compact?: boolean }) {
  const [sets, setSets] = useState<DemoSetSummary[] | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${BASE_PATH}/demo/index.json`, { credentials: 'same-origin' })
      .then(res => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: DemoSetSummary[]) => setSets(Array.isArray(data) ? data : []))
      .catch(() => setSets([]));
  }, []);

  async function open(slug: string) {
    setLoading(slug);
    setError(null);
    try {
      const res = await fetch(`${BASE_PATH}/demo/${encodeURIComponent(slug)}.json`, { credentials: 'same-origin' });
      if (!res.ok) throw new Error(String(res.status));
      importBundle((await res.json()) as WorkspaceBundle);
      // A full load re-reads the library from storage everywhere.
      window.location.assign(`${BASE_PATH}/`);
    } catch {
      setError('That demo set could not be loaded. Try again.');
      setLoading(null);
    }
  }

  if (!sets || sets.length === 0) return null;
  return (
    <div className="text-left">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Try a demo set</h3>
      <div className={`grid gap-3 ${compact ? '' : 'sm:grid-cols-3'}`}>
        {sets.map(set => (
          <button
            key={set.slug}
            type="button"
            onClick={() => open(set.slug)}
            disabled={loading !== null}
            className="text-left p-4 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-500 bg-stone-50 dark:bg-gray-900 disabled:opacity-60 disabled:cursor-wait transition-colors"
          >
            <span className="block font-serif text-gray-900 dark:text-gray-100 mb-1">{set.name}</span>
            <span className="block text-xs text-gray-500 dark:text-gray-400 mb-2">{set.description}</span>
            <span className="block text-xs text-gray-400 dark:text-gray-500">
              {set.papers.map(p => p.author).filter((a, i, all) => all.indexOf(a) === i).join(' · ')}
            </span>
            {loading === set.slug && <span className="block text-xs text-blue-600 dark:text-blue-400 mt-2">Opening…</span>}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
      <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
        Public-domain texts. Opening a set adds it to your library in this browser.
      </p>
    </div>
  );
}
