'use client';

import { useState } from 'react';
import { Source } from '@/lib/types';
import AgentMessage from './AgentMessage';
import SourceCard from './SourceCard';

interface AgentResponseState {
  sourceId: string;
  content: string;
  done: boolean;
}

interface ConversationPanelProps {
  sources: Source[];
  responses: AgentResponseState[];
  isLoading: boolean;
  selectedParagraph: string | null;
  onAsk: (question: string) => void;
  onDeleteSource: (id: string) => void;
}

export default function ConversationPanel({
  sources,
  responses,
  isLoading,
  selectedParagraph,
  onAsk,
  onDeleteSource,
}: ConversationPanelProps) {
  const [question, setQuestion] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      onAsk(question.trim());
      setQuestion('');
    }
  };

  const getSourceById = (id: string) => sources.find(s => s.id === id);

  return (
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Sources roster */}
      <div className="p-4 border-b border-gray-100">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
          In this conversation
        </div>
        {sources.length === 0 ? (
          <p className="text-sm text-gray-500">
            No sources loaded.{' '}
            <a href="/sources" className="text-blue-600 hover:underline">
              Add sources
            </a>
          </p>
        ) : (
          <div className="space-y-2">
            {sources.map((source) => (
              <SourceCard
                key={source.id}
                source={source}
                onDelete={onDeleteSource}
                compact
              />
            ))}
          </div>
        )}
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedParagraph && responses.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm">
            <div>
              <p>Click a paragraph to hear from your sources</p>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {selectedParagraph && responses.length === 0 && !isLoading && (
              <div className="text-sm text-gray-500 italic">
                &quot;{selectedParagraph.slice(0, 100)}...&quot;
              </div>
            )}

            {responses.map((response) => {
              const source = getSourceById(response.sourceId);
              if (!source) return null;

              return (
                <AgentMessage
                  key={response.sourceId}
                  source={source}
                  content={response.content}
                  isStreaming={!response.done}
                />
              );
            })}

            {isLoading && responses.length === 0 && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                <span>Sources are responding...</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area */}
      <div className="p-4 border-t border-gray-100">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask your sources..."
            disabled={sources.length === 0 || !selectedParagraph}
            className="flex-1 px-3 py-2 border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-200 disabled:bg-gray-50 disabled:text-gray-400"
          />
          <button
            type="submit"
            disabled={sources.length === 0 || !question.trim() || isLoading}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
