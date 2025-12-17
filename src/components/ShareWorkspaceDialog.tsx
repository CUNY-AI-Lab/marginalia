'use client';

import { useState, useEffect, useRef } from 'react';
import { Paper, Workspace, PAPER_COLORS } from '@/lib/types';

interface ShareWorkspaceDialogProps {
  workspace: Workspace;
  papers: Paper[];
  isOpen: boolean;
  onClose: () => void;
}

type ShareState = 'preview' | 'creating' | 'success' | 'error';

export default function ShareWorkspaceDialog({
  workspace,
  papers,
  isOpen,
  onClose,
}: ShareWorkspaceDialogProps) {
  const [state, setState] = useState<ShareState>('preview');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setState('preview');
      setShareUrl(null);
      setError(null);
      setCopied(false);
    }
  }, [isOpen]);

  // Close on escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Close on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose]);

  // Get papers in this workspace
  const workspacePapers = papers.filter(p => workspace.paperIds.includes(p.id));

  async function handleCreateShare() {
    setState('creating');
    setError(null);

    try {
      const response = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspace: {
            name: workspace.name,
            description: workspace.description,
          },
          papers: workspacePapers.map(p => ({
            title: p.title,
            author: p.author,
            type: p.type,
            fullText: p.fullText,
            paragraphs: p.paragraphs,
            identityLayer: p.identityLayer,
          })),
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create share');
      }

      const data = await response.json();
      setShareUrl(data.url);
      setState('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share');
      setState('error');
    }
  }

  async function handleCopy() {
    if (shareUrl) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // Fallback: select the input text
        const input = document.querySelector('input[readonly]') as HTMLInputElement;
        if (input) {
          input.select();
        }
      }
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        ref={dialogRef}
        className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Share Workspace</h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <svg className="w-5 h-5 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {state === 'preview' && (
          <>
            <div className="p-4">
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Create a shareable link for <span className="text-gray-900 dark:text-white font-medium">{workspace.name}</span>
              </p>

              <div className="bg-gray-100 dark:bg-gray-700/50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {workspacePapers.length} {workspacePapers.length === 1 ? 'paper' : 'papers'} will be shared:
                </p>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {workspacePapers.map((paper, index) => (
                    <div key={paper.id} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: PAPER_COLORS[index % PAPER_COLORS.length] }}
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300 truncate">{paper.title}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Only extracted text and identity layers are shared. Original PDF files are not included.
                Students who open the link can import the workspace to their library.
              </p>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateShare}
                disabled={workspacePapers.length === 0}
                className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Create Share Link
              </button>
            </div>
          </>
        )}

        {state === 'creating' && (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-2 border-violet-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-500 dark:text-gray-400">Creating share link...</p>
          </div>
        )}

        {state === 'success' && shareUrl && (
          <>
            <div className="p-4">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-gray-900 dark:text-white font-medium">Share link created!</p>
              </div>

              <div className="flex items-center gap-2 bg-gray-100 dark:bg-gray-700 rounded-lg p-2">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="flex-1 bg-transparent text-sm text-gray-700 dark:text-gray-300 outline-none px-2"
                />
                <button
                  onClick={handleCopy}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    copied
                      ? 'bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400'
                      : 'bg-violet-600 text-white hover:bg-violet-500'
                  }`}
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400 mt-3 text-center">
                Anyone with this link can import the workspace to their library.
              </p>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <button
                onClick={onClose}
                className="w-full px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Done
              </button>
            </div>
          </>
        )}

        {state === 'error' && (
          <>
            <div className="p-4">
              <div className="text-center mb-4">
                <div className="w-12 h-12 bg-red-100 dark:bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </div>
                <p className="text-gray-900 dark:text-white font-medium mb-1">Failed to create share</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setState('preview')}
                className="flex-1 px-4 py-2.5 bg-violet-600 text-white rounded-lg hover:bg-violet-500 transition-colors font-medium"
              >
                Try Again
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
