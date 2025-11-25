'use client';

import { useState, useRef, useCallback } from 'react';
import { Source, IdentityLayer } from '@/lib/types';

interface SourceUploadProps {
  onAdd: (source: Omit<Source, 'id' | 'createdAt' | 'color'>) => Source;
  onUpdateIdentity: (id: string, identityLayer: IdentityLayer) => void;
}

export default function SourceUpload({ onAdd, onUpdateIdentity }: SourceUploadProps) {
  const [mode, setMode] = useState<'upload' | 'paste'>('upload');
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [type, setType] = useState<Source['type']>('article');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(async (file: File) => {
    setLoading(true);
    setError(null);

    try {
      if (file.type === 'application/pdf') {
        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/parse-pdf', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) throw new Error('Failed to parse PDF');

        const data = await res.json();
        setText(data.text);
        if (data.title && !title) {
          setTitle(data.title);
        }
      } else {
        const content = await file.text();
        setText(content);
        if (!title) {
          setTitle(file.name.replace(/\.[^/.]+$/, ''));
        }
      }
    } catch (err) {
      setError('Failed to read file. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [title]);

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

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      setMode('upload');
      processFile(file);
    }
  }, [processFile]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!title.trim() || !text.trim()) {
      setError('Title and text are required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newSource = onAdd({
        title: title.trim(),
        author: author.trim() || 'Unknown',
        type,
        fullText: text,
        identityLayer: null,
      });

      setTitle('');
      setAuthor('');
      setText('');
      setType('article');
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }

      // Extract identity in background
      try {
        const res = await fetch('/api/extract-identity', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.slice(0, 100000),
            title: title.trim(),
            author: author.trim(),
          }),
        });

        if (res.ok) {
          const data = await res.json();
          onUpdateIdentity(newSource.id, data.identityLayer);
        }
      } catch (err) {
        console.error('Identity extraction failed:', err);
      }
    } catch (err) {
      setError('Failed to add source');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className={`border-2 rounded-lg p-4 bg-white transition-colors ${
        isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <div className="flex gap-2 mb-4">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={`px-3 py-1.5 text-sm rounded ${
            mode === 'upload'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Upload PDF
        </button>
        <button
          type="button"
          onClick={() => setMode('paste')}
          className={`px-3 py-1.5 text-sm rounded ${
            mode === 'paste'
              ? 'bg-gray-900 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Paste Text
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Algorithms of Oppression"
              className="w-full px-3 py-2 border rounded-md text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Author
            </label>
            <input
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g., Safiya Noble"
              className="w-full px-3 py-2 border rounded-md text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Type
          </label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as Source['type'])}
            className="w-full px-3 py-2 border rounded-md text-sm"
          >
            <option value="article">Article</option>
            <option value="book">Book</option>
            <option value="chapter">Chapter</option>
            <option value="other">Other</option>
          </select>
        </div>

        {mode === 'upload' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              File (PDF or TXT)
            </label>
            <div
              className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.txt,.md"
                onChange={handleFileChange}
                className="hidden"
              />
              <svg className="mx-auto h-10 w-10 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-600">
                {loading ? 'Processing...' : 'Drop a file here or click to browse'}
              </p>
              <p className="text-xs text-gray-400 mt-1">PDF, TXT, or MD</p>
            </div>
            {text && (
              <p className="mt-2 text-xs text-green-600">
                Loaded {Math.round(text.length / 1000)}k characters
              </p>
            )}
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Text *
            </label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste the full text of your source here..."
              rows={8}
              className="w-full px-3 py-2 border rounded-md text-sm font-mono"
              required
            />
            {text && (
              <p className="mt-1 text-xs text-gray-500">
                {Math.round(text.length / 1000)}k characters
              </p>
            )}
          </div>
        )}

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading || !text.trim()}
          className="w-full py-2 px-4 bg-gray-900 text-white rounded-md text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Processing...' : 'Add Source'}
        </button>
      </form>
    </div>
  );
}
