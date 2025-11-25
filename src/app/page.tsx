'use client';

import { useState, useCallback } from 'react';
import { useSources, useDocuments } from '@/hooks/useStorage';
import ReadingPane from '@/components/ReadingPane';
import ConversationPanel from '@/components/ConversationPanel';
import DocumentUpload from '@/components/DocumentUpload';
import Link from 'next/link';

interface AgentResponseState {
  sourceId: string;
  content: string;
  done: boolean;
}

export default function Home() {
  const { sources, deleteSource } = useSources();
  const { documents, addDocument } = useDocuments();

  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null);
  const [responses, setResponses] = useState<AgentResponseState[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDocUpload, setShowDocUpload] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const selectedDoc = documents.find(d => d.id === selectedDocId) || documents[0] || null;
  const selectedParagraph = selectedDoc && selectedParagraphIndex !== null
    ? selectedDoc.paragraphs[selectedParagraphIndex]
    : null;

  const fetchAgentResponses = useCallback(async (passage: string, question?: string) => {
    if (sources.length === 0) return;

    setIsLoading(true);
    setResponses(sources.map(s => ({ sourceId: s.id, content: '', done: false })));

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passage,
          question,
          sources,
        }),
      });

      if (!res.ok) throw new Error('Failed to fetch responses');

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === 'chunk') {
                setResponses(prev =>
                  prev.map(r =>
                    r.sourceId === data.sourceId
                      ? { ...r, content: r.content + data.content }
                      : r
                  )
                );
              } else if (data.type === 'done') {
                setResponses(prev =>
                  prev.map(r =>
                    r.sourceId === data.sourceId
                      ? { ...r, done: true }
                      : r
                  )
                );
              } else if (data.type === 'error') {
                setResponses(prev =>
                  prev.map(r =>
                    r.sourceId === data.sourceId
                      ? { ...r, content: 'Failed to generate response', done: true }
                      : r
                  )
                );
              }
            } catch {
              // Ignore parse errors
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching responses:', error);
    } finally {
      setIsLoading(false);
    }
  }, [sources]);

  const handleSelectParagraph = useCallback((index: number) => {
    setSelectedParagraphIndex(index);
    setPanelOpen(true);

    if (selectedDoc) {
      const passage = selectedDoc.paragraphs[index];
      fetchAgentResponses(passage);
    }
  }, [selectedDoc, fetchAgentResponses]);

  const handleAsk = useCallback((question: string) => {
    if (selectedParagraph) {
      fetchAgentResponses(selectedParagraph, question);
    }
  }, [selectedParagraph, fetchAgentResponses]);

  const handleAddDocument = useCallback((doc: Parameters<typeof addDocument>[0]) => {
    const newDoc = addDocument(doc);
    setSelectedDocId(newDoc.id);
    setSelectedParagraphIndex(null);
    setResponses([]);
    return newDoc;
  }, [addDocument]);

  return (
    <div className="h-screen flex flex-col bg-stone-50">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-serif font-medium text-gray-900">Marginalia</h1>

            {/* Document selector */}
            <select
              value={selectedDocId || ''}
              onChange={(e) => {
                setSelectedDocId(e.target.value || null);
                setSelectedParagraphIndex(null);
                setResponses([]);
              }}
              className="text-sm border rounded px-2 py-1"
            >
              {documents.length === 0 && (
                <option value="">No documents</option>
              )}
              {documents.map(doc => (
                <option key={doc.id} value={doc.id}>{doc.title}</option>
              ))}
            </select>

            <button
              onClick={() => setShowDocUpload(true)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              + Add document
            </button>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {panelOpen ? 'Hide panel' : 'Show panel'}
            </button>
            <Link
              href="/sources"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Manage sources ({sources.length})
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Reading pane */}
        <div
          className={`flex-1 overflow-y-auto transition-all duration-300 ${
            panelOpen ? 'w-3/5' : 'w-full'
          }`}
        >
          <ReadingPane
            document={selectedDoc}
            sources={sources}
            selectedParagraph={selectedParagraphIndex}
            onSelectParagraph={handleSelectParagraph}
          />
        </div>

        {/* Conversation panel */}
        {panelOpen && (
          <div className="w-2/5 flex-shrink-0">
            <ConversationPanel
              sources={sources}
              responses={responses}
              isLoading={isLoading}
              selectedParagraph={selectedParagraph}
              onAsk={handleAsk}
              onDeleteSource={deleteSource}
            />
          </div>
        )}
      </div>

      {/* Document upload modal */}
      {showDocUpload && (
        <DocumentUpload
          onAdd={handleAddDocument}
          onClose={() => setShowDocUpload(false)}
        />
      )}

      {/* Empty state */}
      {documents.length === 0 && sources.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto">
            <h2 className="text-xl font-serif text-gray-700 mb-4">Get Started</h2>
            <p className="text-gray-500 mb-6 max-w-md">
              First, add some sources (books, articles) that will become your conversational agents.
              Then add a document to read with their commentary.
            </p>
            <div className="flex gap-4 justify-center">
              <Link
                href="/sources"
                className="px-4 py-2 bg-gray-900 text-white rounded-md text-sm hover:bg-gray-800"
              >
                Add Sources
              </Link>
              <button
                onClick={() => setShowDocUpload(true)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-50"
              >
                Add Document
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
