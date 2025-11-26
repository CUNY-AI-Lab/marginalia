'use client';

import { useState, useEffect } from 'react';
import { needsMigration } from '@/lib/storage';
import { runMigration, MigrationResult } from '@/lib/migration';

export default function MigrationBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [result, setResult] = useState<MigrationResult | null>(null);

  useEffect(() => {
    setShowBanner(needsMigration());
  }, []);

  const handleMigrate = async () => {
    setMigrating(true);
    const migrationResult = runMigration();
    setResult(migrationResult);
    setMigrating(false);

    if (migrationResult.success) {
      // Reload after successful migration
      setTimeout(() => window.location.reload(), 2000);
    }
  };

  const handleSkip = () => {
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div className="bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800 px-4 py-3">
      {result ? (
        result.success ? (
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M5 13l4 4L19 7"
              />
            </svg>
            <span>
              Migration complete! Migrated {result.migratedSources} sources and{' '}
              {result.migratedDocuments} documents into {result.createdWorkspaces} workspace.
              Reloading...
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            <span>Migration failed: {result.error}</span>
            <button
              onClick={handleSkip}
              className="ml-4 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 underline"
            >
              Dismiss
            </button>
          </div>
        )
      ) : (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              We&apos;ve updated Marginalia with workspace support. Your existing data needs to be
              migrated.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleSkip}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
              disabled={migrating}
            >
              Skip
            </button>
            <button
              onClick={handleMigrate}
              disabled={migrating}
              className="px-3 py-1 bg-blue-600 dark:bg-blue-500 text-white text-sm rounded hover:bg-blue-700 dark:hover:bg-blue-600 disabled:opacity-50"
            >
              {migrating ? 'Migrating...' : 'Migrate Now'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
