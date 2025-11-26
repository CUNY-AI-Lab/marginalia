'use client';

import { useSources } from '@/hooks/useStorage';
import SourceCard from '@/components/SourceCard';
import SourceUpload from '@/components/SourceUpload';
import Link from 'next/link';

export default function SourcesPage() {
  const { sources, loading, addSource, updateSource, deleteSource } = useSources();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sources</h1>
            <p className="text-sm text-gray-500 mt-1">
              Add texts that will become your conversational agents
            </p>
          </div>
          <Link
            href="/"
            className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-gray-800"
          >
            Start Reading
          </Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-3">Add New Source</h2>
            <SourceUpload
              onAdd={addSource}
              onUpdate={updateSource}
            />
          </div>

          <div>
            <h2 className="text-sm font-medium text-gray-700 mb-3">
              Your Sources ({sources.length})
            </h2>
            {loading ? (
              <div className="text-sm text-gray-500">Loading...</div>
            ) : sources.length === 0 ? (
              <div className="border rounded-lg p-8 bg-white text-center">
                <p className="text-gray-500 text-sm">
                  No sources yet. Add a book, article, or chapter to get started.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {sources.map((source) => (
                  <SourceCard
                    key={source.id}
                    source={source}
                    onDelete={deleteSource}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
