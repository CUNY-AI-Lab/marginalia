'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { WorkspaceBundle } from '@/lib/r2';
import {
  getPapers,
  savePapers,
  getWorkspaces,
  saveWorkspaces,
  setActiveWorkspaceId,
  generateId,
} from '@/lib/storage';
import { Paper, Workspace, PAPER_COLORS } from '@/lib/types';

type ImportState = 'loading' | 'preview' | 'importing' | 'success' | 'error';

export default function SharePage() {
  const params = useParams();
  const router = useRouter();
  const shareId = params.id as string;

  const [state, setState] = useState<ImportState>('loading');
  const [bundle, setBundle] = useState<WorkspaceBundle | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch the share bundle
  useEffect(() => {
    async function fetchBundle() {
      try {
        const response = await fetch(`/api/share?id=${encodeURIComponent(shareId)}`);

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to load shared workspace');
        }

        const data = await response.json();
        setBundle(data);
        setState('preview');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load shared workspace');
        setState('error');
      }
    }

    if (shareId) {
      fetchBundle();
    }
  }, [shareId]);

  // Import the workspace into localStorage
  function handleImport() {
    if (!bundle) return;

    setState('importing');

    try {
      // Get existing papers and workspaces
      const existingPapers = getPapers();
      const existingWorkspaces = getWorkspaces();

      // Get next color index based on existing papers
      let colorIndex = existingPapers.length % PAPER_COLORS.length;

      // Create papers from bundle
      const now = Date.now();
      const newPaperIds: string[] = [];
      const newPapers: Paper[] = bundle.papers.map((bundlePaper) => {
        const paperId = generateId();
        newPaperIds.push(paperId);
        const paper: Paper = {
          id: paperId,
          title: bundlePaper.title,
          author: bundlePaper.author,
          type: bundlePaper.type,
          fullText: bundlePaper.fullText,
          paragraphs: bundlePaper.paragraphs,
          identityLayer: bundlePaper.identityLayer || null,
          color: PAPER_COLORS[colorIndex++ % PAPER_COLORS.length],
          createdAt: now,
          updatedAt: now,
          status: 'ready',
        };
        return paper;
      });

      // Create workspace
      const workspaceId = generateId();
      const workspace: Workspace = {
        id: workspaceId,
        name: bundle.workspace.name,
        description: bundle.workspace.description,
        paperIds: newPaperIds,
        activePaperId: newPaperIds[0] || null,
        createdAt: now,
        updatedAt: now,
      };

      // Save to localStorage
      savePapers([...existingPapers, ...newPapers]);
      saveWorkspaces([...existingWorkspaces, workspace]);
      setActiveWorkspaceId(workspaceId);

      setState('success');

      // Redirect to main page after short delay
      setTimeout(() => {
        router.push('/');
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import workspace');
      setState('error');
    }
  }

  // Loading state
  if (state === 'loading') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Loading shared workspace...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (state === 'error') {
    const isNotFound = error?.includes('not found') || error?.includes('Not found');
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-4xl mb-4">:(</div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
            {isNotFound ? 'Share Not Found' : 'Unable to Load Share'}
          </h1>
          <p className="text-gray-500 dark:text-gray-400 mb-6">{error || 'This share link may have expired or is invalid.'}</p>
          <button
            onClick={() => router.push('/')}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors"
          >
            Go to Home
          </button>
        </div>
      </div>
    );
  }

  // Success state
  if (state === 'success') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4 text-green-600 dark:text-green-400">✓</div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">Workspace Imported!</h1>
          <p className="text-gray-500 dark:text-gray-400">Redirecting to your library...</p>
        </div>
      </div>
    );
  }

  // Importing state
  if (state === 'importing') {
    return (
      <div className="min-h-screen bg-stone-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500 dark:text-gray-400">Importing workspace...</p>
        </div>
      </div>
    );
  }

  // Preview state
  return (
    <div className="min-h-screen bg-stone-50 dark:bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-lg">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">Shared Workspace</p>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">{bundle?.workspace.name}</h1>
          {bundle?.workspace.description && (
            <p className="text-gray-500 dark:text-gray-400 mt-2">{bundle.workspace.description}</p>
          )}
        </div>

        {/* Papers list */}
        <div className="p-6">
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
            {bundle?.papers.length} {bundle?.papers.length === 1 ? 'paper' : 'papers'} included:
          </p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {bundle?.papers.map((paper, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 bg-gray-100 dark:bg-gray-700/50 rounded-lg"
              >
                <div
                  className="w-2 h-2 rounded-full mt-2 flex-shrink-0"
                  style={{ backgroundColor: PAPER_COLORS[index % PAPER_COLORS.length] }}
                />
                <div className="min-w-0">
                  <p className="text-gray-900 dark:text-white font-medium truncate">{paper.title}</p>
                  <p className="text-gray-500 dark:text-gray-400 text-sm truncate">{paper.author}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="p-6 border-t border-gray-200 dark:border-gray-700 flex gap-3">
          <button
            onClick={() => router.push('/')}
            className="flex-1 px-4 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            className="flex-1 px-4 py-3 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors font-medium"
          >
            Import to My Library
          </button>
        </div>

        {/* Footer note */}
        <div className="px-6 pb-6">
          <p className="text-xs text-gray-400 dark:text-gray-500 text-center">
            Shared {bundle?.sharedAt ? new Date(bundle.sharedAt).toLocaleDateString() : 'recently'}
          </p>
        </div>
      </div>
    </div>
  );
}
