'use client';

import { useCallback, useEffect, useRef } from 'react';
import { usePapers, useWorkspaces } from '@/hooks/useStorage';
import PaperUpload from '@/components/PaperUpload';
import MigrationBanner from '@/components/MigrationBanner';
import Link from 'next/link';
import { Paper, Workspace } from '@/lib/types';
import { PDF_PROCESSING_TEXT, PDF_FAILED_TEXT } from '@/lib/constants';

export default function LibraryPage() {
  const { papers, loading, addPaper, updatePaper, deletePaper } = usePapers();

  // Track papers currently being extracted
  const extractingPapersRef = useRef<Set<string>>(new Set());

  // Warn before page refresh if extraction in progress
  useEffect(() => {
    const currentRef = extractingPapersRef.current;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentRef.size > 0) {
        e.preventDefault();
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Cleanup tracking set on unmount to prevent memory leaks
      currentRef.clear();
    };
  }, []);
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    addPaperToWorkspace,
    removePaperFromWorkspace,
    setActivePaper,
    switchWorkspace,
  } = useWorkspaces();

  // Get which workspaces each paper is in
  const getPaperWorkspaces = (paperId: string): Workspace[] => {
    return workspaces.filter(w => w.paperIds.includes(paperId));
  };

  const handleAddToActiveWorkspace = (paperId: string) => {
    if (activeWorkspaceId) {
      addPaperToWorkspace(activeWorkspaceId, paperId);
    }
  };

  const handleRemoveFromActiveWorkspace = (paperId: string) => {
    if (activeWorkspaceId) {
      removePaperFromWorkspace(activeWorkspaceId, paperId);
    }
  };

  const handleSetAsReading = (paperId: string) => {
    if (activeWorkspaceId) {
      // First add to workspace if not there
      if (!activeWorkspace?.paperIds.includes(paperId)) {
        addPaperToWorkspace(activeWorkspaceId, paperId);
      }
      setActivePaper(activeWorkspaceId, paperId);
    }
  };

  // Async metadata extraction
  const extractMetadataAsync = useCallback(
    async (paperId: string, text: string, currentTitle: string) => {
      // Track this extraction
      extractingPapersRef.current.add(paperId);

      try {
        const res = await fetch('/api/extract-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.slice(0, 100000),
            title: currentTitle,
            author: 'Unknown',
          }),
        });

        if (!res.ok) {
          throw new Error('Failed to extract identity');
        }

        const data = await res.json();

        // Update paper with extracted metadata
        updatePaper(paperId, {
          title: data.metadata?.title || currentTitle,
          author: data.metadata?.author || 'Unknown',
          identityLayer: data.identityLayer,
          status: 'ready',
        });

        // Done extracting
        extractingPapersRef.current.delete(paperId);
      } catch (error) {
        // Done extracting (even on error)
        extractingPapersRef.current.delete(paperId);
        // Don't mark as error if the request was aborted (e.g., page refresh)
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('Extraction aborted (likely page refresh)');
          return;
        }
        console.error('Metadata extraction failed:', error);
        // Mark as error but keep the paper
        updatePaper(paperId, {
          status: 'error',
          author: 'Extraction failed',
        });
      }
    },
    [updatePaper]
  );

  // Handle paper addition with async metadata extraction
  const handleAddPaper = useCallback(
    (paperData: Omit<Paper, 'id' | 'createdAt' | 'updatedAt' | 'color' | 'paragraphs'>) => {
      const newPaper = addPaper(paperData);

      // If paper was added with processing status and has real text, start async extraction
      // Skip if it's a PDF placeholder waiting for parsing
      if (newPaper.status === 'processing' && newPaper.fullText !== PDF_PROCESSING_TEXT) {
        // Fire and forget - don't await
        extractMetadataAsync(newPaper.id, newPaper.fullText, newPaper.title);
      }

      return newPaper;
    },
    [addPaper, extractMetadataAsync]
  );

  // Handle paper updates from async processes (like PDF parsing)
  const handleUpdatePaper = useCallback(
    (id: string, updates: Partial<Paper>, title?: string) => {
      updatePaper(id, updates);

      // If PDF parsing just completed (fullText was updated), trigger identity extraction
      // Title is passed from PaperUpload to avoid stale closure issues
      if (updates.fullText && updates.fullText !== PDF_PROCESSING_TEXT && updates.fullText !== PDF_FAILED_TEXT && title) {
        extractMetadataAsync(id, updates.fullText, title);
      }
    },
    [updatePaper, extractMetadataAsync]
  );

  // Retry extraction for failed papers
  const handleRetryExtraction = useCallback(
    (paper: Paper) => {
      // Only retry if the paper has actual text (not a failed PDF parse)
      if (paper.fullText === PDF_FAILED_TEXT) {
        // Can't retry - need to re-upload
        return;
      }
      // Reset status to processing
      updatePaper(paper.id, { status: 'processing', author: 'Extracting...' });
      // Re-run extraction
      extractMetadataAsync(paper.id, paper.fullText, paper.title);
    },
    [updatePaper, extractMetadataAsync]
  );

  // Sort papers: active workspace papers first, then by creation date
  const sortedPapers = [...papers].sort((a, b) => {
    const aInActive = activeWorkspace?.paperIds.includes(a.id) ? 1 : 0;
    const bInActive = activeWorkspace?.paperIds.includes(b.id) ? 1 : 0;
    if (aInActive !== bInActive) return bInActive - aInActive;
    return b.createdAt - a.createdAt;
  });

  // Count processing papers for warning banner
  const processingCount = papers.filter(p => p.status === 'processing').length;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <MigrationBanner />

      {/* Processing warning banner */}
      {processingCount > 0 && (
        <div className="bg-yellow-50 dark:bg-yellow-900/30 border-b border-yellow-200 dark:border-yellow-800 px-4 py-3">
          <div className="max-w-5xl mx-auto flex items-center gap-3">
            <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <span className="text-sm text-yellow-800 dark:text-yellow-200">
              <strong>{processingCount} {processingCount === 1 ? 'paper' : 'papers'}</strong> processing &mdash; don&apos;t refresh or you&apos;ll lose progress
            </span>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">Paper Library</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              All your papers. Add them to workspaces to use as reading targets or commentators.
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md hover:bg-gray-800 dark:hover:bg-gray-200"
          >
            Back to Reading
          </Link>
        </div>

        {activeWorkspace && (
          <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-sm">
                Active workspace: <strong>{activeWorkspace.name}</strong> ({activeWorkspace.paperIds.length} papers)
              </span>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Add New Paper</h2>
            <PaperUpload onAdd={handleAddPaper} onUpdate={handleUpdatePaper} />
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Your Papers ({papers.length})</h2>
            {loading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            ) : papers.length === 0 ? (
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-8 bg-white dark:bg-gray-800 text-center">
                <p className="text-gray-700 dark:text-gray-300 font-medium mb-2">
                  Your library is empty
                </p>
                <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                  Upload PDFs, text files, or paste content. Each paper can serve as either
                  your reading target or a commentator that responds to passages.
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-xs">
                  Tip: Add 2-3 papers on related topics to see them in dialogue.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sortedPapers.map(paper => {
                  const paperWorkspaces = getPaperWorkspaces(paper.id);
                  const isInActiveWorkspace = activeWorkspace?.paperIds.includes(paper.id);
                  const isActivePaper = activeWorkspace?.activePaperId === paper.id;
                  const isProcessing = paper.status === 'processing';
                  const hasError = paper.status === 'error';

                  return (
                    <div
                      key={paper.id}
                      className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 ${
                        isProcessing ? 'border-yellow-200 dark:border-yellow-700 bg-yellow-50/50 dark:bg-yellow-900/20' : ''
                      } ${hasError ? 'border-red-200 dark:border-red-700 bg-red-50/50 dark:bg-red-900/20' : ''}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className="relative mt-1 flex-shrink-0">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: paper.color }}
                          />
                          {isProcessing && (
                            <div className="absolute -top-0.5 -left-0.5 w-4 h-4 border-2 border-yellow-400 dark:border-yellow-500 border-t-transparent rounded-full animate-spin" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{paper.title}</h3>
                          <p className={`text-sm italic ${isProcessing ? 'text-yellow-600 dark:text-yellow-400' : hasError ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            {paper.author}
                          </p>
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                              {paper.type}
                            </span>
                            {isProcessing ? (
                              <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300 rounded flex items-center gap-1">
                                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                </svg>
                                Analyzing...
                              </span>
                            ) : hasError ? (
                              <>
                                <span className="text-xs px-2 py-0.5 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 rounded">
                                  Error
                                </span>
                                {paper.fullText !== PDF_FAILED_TEXT && (
                                  <button
                                    onClick={() => handleRetryExtraction(paper)}
                                    className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                                  >
                                    Retry
                                  </button>
                                )}
                              </>
                            ) : paper.identityLayer ? (
                              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded">
                                Identity extracted
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded">
                                No identity
                              </span>
                            )}
                            <span className="text-xs text-gray-400 dark:text-gray-500">
                              {Math.round(paper.fullText.length / 1000)}k chars
                            </span>
                          </div>

                          {/* Workspace membership */}
                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <div className="flex items-center flex-wrap gap-2">
                              {paperWorkspaces.length > 0 ? (
                                <>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">In:</span>
                                  {paperWorkspaces.map(ws => (
                                    <span
                                      key={ws.id}
                                      className={`text-xs px-2 py-0.5 rounded ${
                                        ws.id === activeWorkspaceId
                                          ? 'bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300'
                                          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300'
                                      }`}
                                    >
                                      {ws.name}
                                      {ws.activePaperId === paper.id && ' (reading)'}
                                    </span>
                                  ))}
                                </>
                              ) : (
                                <span className="text-xs text-gray-400 dark:text-gray-500">Not in any workspace</span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col gap-1">
                          {activeWorkspace && !isProcessing && (
                            <>
                              {isInActiveWorkspace ? (
                                <>
                                  {!isActivePaper && (
                                    <button
                                      onClick={() => handleSetAsReading(paper.id)}
                                      className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900"
                                      title="Set as reading target"
                                    >
                                      Read
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleRemoveFromActiveWorkspace(paper.id)}
                                    className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                                    title="Remove from workspace"
                                  >
                                    Remove
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleAddToActiveWorkspace(paper.id)}
                                  className="text-xs px-2 py-1 bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900"
                                  title="Add to workspace"
                                >
                                  + Add
                                </button>
                              )}
                            </>
                          )}
                          <button
                            onClick={() => deletePaper(paper.id)}
                            className="text-xs px-2 py-1 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                            title="Delete paper"
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {/* Identity layer details */}
                      {paper.identityLayer && (
                        <details className="mt-3">
                          <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
                            View identity layer
                          </summary>
                          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-2 pl-4 border-l-2 border-gray-200 dark:border-gray-700">
                            <div>
                              <strong>Core commitments:</strong>
                              <p className="mt-1 line-clamp-3">
                                {paper.identityLayer.coreCommitments}
                              </p>
                            </div>
                            <div>
                              <strong>Vocabulary:</strong>
                              <p className="mt-1">
                                {paper.identityLayer.vocabulary.slice(0, 10).join(', ')}
                              </p>
                            </div>
                          </div>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* All workspaces section */}
        {workspaces.length > 0 && (
          <div className="mt-12">
            <h2 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-4">Workspaces</h2>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {workspaces.map(ws => {
                const isActive = ws.id === activeWorkspaceId;
                return (
                  <button
                    key={ws.id}
                    onClick={() => switchWorkspace(ws.id)}
                    className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 text-left transition-all ${
                      isActive
                        ? 'ring-2 ring-blue-500 border-blue-300 dark:border-blue-600'
                        : 'hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100">{ws.name}</h3>
                      {isActive && (
                        <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {ws.paperIds.length} paper{ws.paperIds.length !== 1 ? 's' : ''}
                    </p>
                    {ws.activePaperId && (
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 truncate">
                        Reading: {papers.find(p => p.id === ws.activePaperId)?.title || 'Unknown'}
                      </p>
                    )}
                    {!isActive && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                        Click to switch
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
            <Link
              href="/workspaces"
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 mt-4 inline-block"
            >
              Manage workspaces →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
