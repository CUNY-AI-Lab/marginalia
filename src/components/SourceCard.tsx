'use client';

import { Source } from '@/lib/types';

interface SourceCardProps {
  source: Source;
  onDelete: (id: string) => void;
  compact?: boolean;
}

export default function SourceCard({ source, onDelete, compact = false }: SourceCardProps) {
  const hasIdentity = source.identityLayer !== null;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: source.color }}
        />
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{source.title}</div>
          <div className="text-xs text-gray-500 italic truncate">{source.author}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 bg-white">
      <div className="flex items-start gap-3">
        <div
          className="w-3 h-3 rounded-full mt-1 flex-shrink-0"
          style={{ backgroundColor: source.color }}
        />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 truncate">{source.title}</h3>
          <p className="text-sm text-gray-500 italic">{source.author}</p>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs px-2 py-0.5 bg-gray-100 rounded">
              {source.type}
            </span>
            {hasIdentity ? (
              <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                Identity extracted
              </span>
            ) : (
              <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded">
                Extracting identity...
              </span>
            )}
            <span className="text-xs text-gray-400">
              {Math.round(source.fullText.length / 1000)}k chars
            </span>
          </div>
        </div>
        <button
          onClick={() => onDelete(source.id)}
          className="text-gray-400 hover:text-red-500 p-1"
          title="Delete source"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {hasIdentity && source.identityLayer && (
        <details className="mt-3">
          <summary className="text-xs text-gray-500 cursor-pointer hover:text-gray-700">
            View identity layer
          </summary>
          <div className="mt-2 text-xs text-gray-600 space-y-2 pl-4 border-l-2 border-gray-200">
            <div>
              <strong>Core commitments:</strong>
              <p className="mt-1 line-clamp-3">{source.identityLayer.coreCommitments}</p>
            </div>
            <div>
              <strong>Vocabulary:</strong>
              <p className="mt-1">{source.identityLayer.vocabulary.slice(0, 10).join(', ')}</p>
            </div>
          </div>
        </details>
      )}
    </div>
  );
}
