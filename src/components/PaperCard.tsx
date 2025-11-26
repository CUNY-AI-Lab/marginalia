'use client';

import { Paper } from '@/lib/types';

interface PaperCardProps {
  paper: Paper;
  onDelete?: (id: string) => void;
  onSetActive?: (id: string) => void;
  isActive?: boolean;
  isInWorkspace?: boolean;
  compact?: boolean;
  showWorkspaceActions?: boolean;
  onAddToWorkspace?: (id: string) => void;
  onRemoveFromWorkspace?: (id: string) => void;
}

export default function PaperCard({
  paper,
  onDelete,
  onSetActive,
  isActive = false,
  isInWorkspace = true,
  compact = false,
  showWorkspaceActions = false,
  onAddToWorkspace,
  onRemoveFromWorkspace,
}: PaperCardProps) {
  const hasIdentity = paper.identityLayer !== null;

  if (compact) {
    return (
      <div
        className={`flex items-center gap-2 px-2 py-1 rounded cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700 ${
          isActive ? 'bg-blue-50 dark:bg-blue-900/30' : ''
        }`}
        onClick={() => onSetActive?.(paper.id)}
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: paper.color }}
        />
        <div className="min-w-0 flex-1">
          <div className={`text-sm font-medium truncate ${isActive ? 'text-blue-700 dark:text-blue-400' : 'text-gray-900 dark:text-gray-100'}`}>
            {paper.title}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 italic truncate">{paper.author}</div>
        </div>
        {isActive && (
          <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded">Reading</span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 ${isActive ? 'ring-2 ring-blue-500 dark:ring-blue-400' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div
          className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
          style={{ backgroundColor: paper.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">{paper.title}</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">{paper.author}</p>
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">{paper.type}</span>
            {hasIdentity ? (
              <span className="text-xs px-2 py-0.5 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded">
                Identity extracted
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 rounded">
                Extracting identity...
              </span>
            )}
            <span className="text-xs text-gray-400 dark:text-gray-500">
              {Math.round(paper.fullText.length / 1000)}k chars
            </span>
            {isActive && (
              <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded">
                Currently reading
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {showWorkspaceActions && !isInWorkspace && onAddToWorkspace && (
            <button
              onClick={() => onAddToWorkspace(paper.id)}
              className="text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 p-1"
              title="Add to workspace"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
            </button>
          )}
          {showWorkspaceActions && isInWorkspace && onRemoveFromWorkspace && (
            <button
              onClick={() => onRemoveFromWorkspace(paper.id)}
              className="text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 p-1"
              title="Remove from workspace"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M20 12H4"
                />
              </svg>
            </button>
          )}
          {onSetActive && !isActive && (
            <button
              onClick={() => onSetActive(paper.id)}
              className="text-gray-400 dark:text-gray-500 hover:text-blue-500 dark:hover:text-blue-400 p-1"
              title="Set as reading target"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                />
              </svg>
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(paper.id)}
              className="text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 p-1"
              title="Delete paper"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      </div>

      {hasIdentity && paper.identityLayer && (
        <details className="mt-3">
          <summary className="text-xs text-gray-500 dark:text-gray-400 cursor-pointer hover:text-gray-700 dark:hover:text-gray-300">
            View identity layer
          </summary>
          <div className="mt-2 text-xs text-gray-600 dark:text-gray-400 space-y-2 pl-4 border-l-2 border-gray-200 dark:border-gray-600">
            <div>
              <strong>Core commitments:</strong>
              <p className="mt-1 line-clamp-3">{paper.identityLayer.coreCommitments}</p>
            </div>
            <div>
              <strong>Vocabulary:</strong>
              <p className="mt-1">{paper.identityLayer.vocabulary.slice(0, 10).join(', ')}</p>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
