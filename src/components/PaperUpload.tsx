'use client';

import { useState, useRef, useCallback } from 'react';
import { Paper, StructuredParagraph } from '@/lib/types';

interface PaperUploadProps {
  onAdd: (paper: Omit<Paper, 'id' | 'createdAt' | 'updatedAt' | 'color' | 'paragraphs'> & { paragraphs?: StructuredParagraph[] }) => Paper;
}

type UploadStatus = 'idle' | 'reading' | 'processing' | 'done';

export default function PaperUpload({ onAdd }: PaperUploadProps) {
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>('idle');
  const [uploadFileName, setUploadFileName] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isUploading = uploadStatus !== 'idle';

  const processFile = useCallback(
    async (file: File) => {
      setUploadFileName(file.name);
      setUploadStatus('reading');
      setError(null);

      try {
        let text: string;

        const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
        let structuredParagraphs: StructuredParagraph[] | undefined;

        if (isPDF) {
          setUploadStatus('processing');
          const formData = new FormData();
          formData.append('file', file);

          const res = await fetch('/api/parse-pdf', {
            method: 'POST',
            body: formData,
          });

          if (!res.ok) throw new Error('Failed to parse PDF');
          const data = await res.json();
          text = data.text;
          structuredParagraphs = data.paragraphs;
        } else {
          text = await file.text();
        }

        // Extract title from filename (remove extension)
        const title = file.name.replace(/\.(pdf|txt|md)$/i, '');

        // Add paper immediately with processing status
        // The parent will handle async LLM extraction
        onAdd({
          title,
          author: 'Extracting...',
          type: 'article',
          fullText: text,
          identityLayer: null,
          status: 'processing',
          paragraphs: structuredParagraphs,
        });

        // Reset for next upload
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (err) {
        setError('Failed to read file. Please try again.');
        console.error(err);
      } finally {
        setUploadStatus('idle');
        setUploadFileName('');
      }
    },
    [onAdd]
  );

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const file = e.dataTransfer.files?.[0];
      if (file) {
        processFile(file);
      }
    },
    [processFile]
  );

  const handlePasteSubmit = () => {
    if (!pastedText.trim()) {
      setError('Please paste some text');
      return;
    }

    // Add paper with processing status
    onAdd({
      title: 'Pasted text',
      author: 'Extracting...',
      type: 'article',
      fullText: pastedText,
      identityLayer: null,
      status: 'processing',
    });

    // Reset
    setPastedText('');
    setShowPasteArea(false);
  };

  return (
    <div className="space-y-3">
      {/* Main drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 bg-white dark:bg-gray-800 transition-colors ${
          isDragging
            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30'
            : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
        } ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="text-center">
          <svg
            className="mx-auto h-10 w-10 text-gray-400 dark:text-gray-500 mb-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
            />
          </svg>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
            {uploadStatus === 'idle' && 'Drop a file here'}
            {uploadStatus === 'reading' && 'Reading file...'}
            {uploadStatus === 'processing' && (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Processing PDF...
              </span>
            )}
          </p>
          {uploadStatus === 'processing' && uploadFileName && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-3 truncate max-w-[200px] mx-auto">
              {uploadFileName}
            </p>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,.md"
            onChange={handleFileChange}
            className="hidden"
            disabled={isUploading}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-md hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Browse files
          </button>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">PDF, TXT, or MD</p>
        </div>
      </div>

      {/* Paste text option */}
      {!showPasteArea ? (
        <button
          type="button"
          onClick={() => setShowPasteArea(true)}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 underline"
        >
          Or paste text
        </button>
      ) : (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Paste text</span>
            <button
              type="button"
              onClick={() => {
                setShowPasteArea(false);
                setPastedText('');
              }}
              className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <textarea
            value={pastedText}
            onChange={e => setPastedText(e.target.value)}
            placeholder="Paste the full text of your paper here..."
            rows={6}
            className="w-full px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md text-sm font-mono bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
          />
          {pastedText && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {Math.round(pastedText.length / 1000)}k characters
            </p>
          )}
          <button
            onClick={handlePasteSubmit}
            disabled={!pastedText.trim()}
            className="w-full py-2 px-4 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm font-medium hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Add Paper
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
