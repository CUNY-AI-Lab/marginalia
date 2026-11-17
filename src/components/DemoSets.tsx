'use client';

import { useEffect, useState } from 'react';
import { BASE_PATH } from '@/lib/api';
import { DemoSetSummary, importBundle, WorkspaceBundle } from '@/lib/bundles';

// Built-in public-domain reading sets. Each comes with its source profiles already written, so it
// can be read immediately; only the commentary itself calls a model.
// The card shows what the texts argue; the provenance note is said once below the cards.
const summary = (description: string) => description.replace(/\s*Public-domain texts[^.]*(?:\.[^.]*)?\.\s*$/, '');

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
      <h2 className={`${compact ? 'text-sm font-medium text-gray-700 dark:text-gray-300' : 'text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400'} mb-3`}>
        {compact ? 'Demo sets' : 'Start with a demo set'}
      </h2>
      <div className={`grid gap-4 ${compact ? '' : 'md:grid-cols-3'}`}>
        {sets.map(set => (
          <button
            key={set.slug}
            type="button"
            onClick={() => open(set.slug)}
            disabled={loading !== null}
            className="group flex flex-col text-left p-5 rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-600 dark:hover:border-blue-400 hover:shadow-[0_8px_24px_rgba(0,45,114,0.08)] disabled:opacity-60 disabled:cursor-wait transition-all"
          >
            <span className={`block font-display ${compact ? 'text-base' : 'text-xl'} font-semibold leading-snug text-gray-900 dark:text-gray-50`}>{set.name}</span>
            <span className="mt-2 block text-sm leading-relaxed text-gray-600 dark:text-gray-300">{summary(set.description)}</span>
            <span className="mt-4 block text-xs text-gray-500 dark:text-gray-400">
              {set.papers.map(p => p.author.replace(/\s*\((?:trans|ed)\.[^)]*\)/, '')).filter((a, i, all) => all.indexOf(a) === i).join(' · ')}
            </span>
            <span className="mt-auto pt-4 text-sm font-medium text-blue-700 dark:text-blue-300">
              {loading === set.slug ? 'Opening…' : `Read ${set.papers.length} texts →`}
            </span>
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400 mt-2">{error}</p>}
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">
        Public-domain texts, some excerpted, with source profiles already written. Opening a set adds it to your library in this browser.
      </p>
    </div>
  );
}
