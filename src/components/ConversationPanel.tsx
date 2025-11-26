'use client';

import { useState } from 'react';
import { Source } from '@/lib/types';
import AgentMessage from './AgentMessage';

interface AgentResponseState {
  sourceId: string;
  content: string;
  done: boolean;
  replyTo?: string;
  question?: string;  // The user's question that prompted this response
}

interface ConversationPanelProps {
  sources: Source[];
  engagedSourceIds: string[]; // Sources that would engage with current paragraph
  responses: AgentResponseState[];
  loadingSourceId: string | null; // Which source is currently generating
  selectedParagraph: string | null;
  askingSource: string | null; // Which source is targeted for next question (null = broadcast)
  onSetAskingSource: (sourceId: string | null) => void;
  onGenerateResponse: (sourceId: string, replyToContent?: string) => void;
  onAsk: (question: string) => void;
  onDeleteSource: (id: string) => void;
  onClearAndRefresh?: () => void;
}

export default function ConversationPanel({
  sources,
  engagedSourceIds,
  responses,
  loadingSourceId,
  selectedParagraph,
  askingSource,
  onSetAskingSource,
  onGenerateResponse,
  onAsk,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDeleteSource,
  onClearAndRefresh,
}: ConversationPanelProps) {
  const [question, setQuestion] = useState('');
  // Reply chains disabled for now
  // const [expandedReply, setExpandedReply] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (question.trim()) {
      onAsk(question.trim());
      setQuestion('');
    }
  };

  const getSourceById = (id: string) => sources.find(s => s.id === id);

  // Split into engaged sources that haven't responded yet vs those that have
  const respondedSourceIds = new Set(responses.map(r => r.sourceId));
  const pendingEngagedSources = engagedSourceIds
    .filter(id => !respondedSourceIds.has(id))
    .map(id => getSourceById(id))
    .filter((s): s is Source => s !== null);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700">
      {/* Sources roster with engagement status */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700">
        <div className="text-xs uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-3">
          Sources
        </div>
        {sources.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No sources loaded.{' '}
            <a href="/sources" className="text-blue-600 dark:text-blue-400 hover:underline">
              Add sources
            </a>
          </p>
        ) : (
          <div className="space-y-1">
            {sources.map((source) => {
              const isEngaged = engagedSourceIds.includes(source.id);
              const hasResponded = respondedSourceIds.has(source.id);
              const isLoading = loadingSourceId === source.id;

              return (
                <div
                  key={source.id}
                  className="flex items-center gap-2 py-1"
                >
                  <div
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: source.color }}
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">
                    {source.title}
                  </span>
                  {selectedParagraph && (
                    <>
                      {hasResponded ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500">responded</span>
                      ) : isLoading ? (
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex items-center gap-1">
                          <span className="flex gap-0.5">
                            <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </span>
                          analyzing
                        </span>
                      ) : isEngaged ? (
                        <button
                          onClick={() => onGenerateResponse(source.id)}
                          className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded text-gray-700 dark:text-gray-300"
                        >
                          hear
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversation area */}
      <div className="flex-1 overflow-y-auto p-4">
        {!selectedParagraph ? (
          <div className="h-full flex items-center justify-center text-center text-gray-400 dark:text-gray-500 text-sm">
            <div>
              <p>Click a paragraph to see which sources are relevant</p>
            </div>
          </div>
        ) : responses.length === 0 && pendingEngagedSources.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-gray-400 dark:text-gray-500 text-sm">
            <div>
              <p>No relevant sources for this passage</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Clear & refresh option when there are responses */}
            {responses.length > 0 && onClearAndRefresh && (
              <div className="flex justify-end">
                <button
                  onClick={onClearAndRefresh}
                  disabled={loadingSourceId !== null}
                  className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-50"
                >
                  Clear & refresh
                </button>
              </div>
            )}

            {/* Pending sources that can respond */}
            {pendingEngagedSources.length > 0 && responses.length === 0 && (
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                <p className="mb-2">Relevant sources:</p>
                <div className="flex flex-wrap gap-2">
                  {pendingEngagedSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => onGenerateResponse(source.id)}
                      disabled={loadingSourceId !== null}
                      className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: source.color }}
                      />
                      {source.author?.split(' ').pop() || source.title.slice(0, 15)}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Responses */}
            {responses.map((response, idx) => {
              const source = getSourceById(response.sourceId);
              if (!source) return null;

              const isStreaming = loadingSourceId === source.id;

              return (
                <div key={`${response.sourceId}-${idx}`} className="group">
                  {/* Show user question if present */}
                  {response.question && (
                    <div className="mb-2 flex justify-end">
                      <div className="bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm px-3 py-2 rounded-lg max-w-[80%]">
                        {response.question}
                      </div>
                    </div>
                  )}

                  <AgentMessage
                    source={source}
                    content={response.content}
                    isStreaming={isStreaming}
                  />

                  {/* Ask followup button */}
                  {response.done && !isStreaming && (
                    <div className="mt-1 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => onSetAskingSource(source.id)}
                        className="text-xs text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                      >
                        Ask followup →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading indicator */}
            {loadingSourceId && !responses.some(r => r.sourceId === loadingSourceId) && (() => {
              const loadingSource = getSourceById(loadingSourceId);
              return (
                <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-100 dark:border-gray-600">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full animate-pulse"
                      style={{ backgroundColor: loadingSource?.color || '#888' }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        {loadingSource?.title || 'Source'}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-0.5">
                        <span>Analyzing passage</span>
                        <span className="flex gap-0.5 ml-1">
                          <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* More sources available */}
            {responses.length > 0 && pendingEngagedSources.length > 0 && (
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">More relevant sources:</p>
                <div className="flex flex-wrap gap-2">
                  {pendingEngagedSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => onGenerateResponse(source.id)}
                      disabled={loadingSourceId !== null}
                      className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 border border-gray-200 dark:border-gray-600 rounded-full text-xs text-gray-700 dark:text-gray-300 disabled:opacity-50"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{ backgroundColor: source.color }}
                      />
                      {source.author?.split(' ').pop() || source.title.slice(0, 15)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Input area for custom questions */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-700">
        {/* Show target source chip when asking a specific source */}
        {askingSource && (
          <div className="mb-2 flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Asking:</span>
            <span className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-full text-xs text-gray-700 dark:text-gray-300">
              <div
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: getSourceById(askingSource)?.color }}
              />
              {getSourceById(askingSource)?.title || 'Source'}
              <button
                type="button"
                onClick={() => onSetAskingSource(null)}
                className="ml-1 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ×
              </button>
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={askingSource ? `Query ${getSourceById(askingSource)?.title || 'source'}...` : "Query sources..."}
            disabled={sources.length === 0 || !selectedParagraph}
            className="flex-1 px-3 py-2 border border-gray-200 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-600 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-500"
          />
          <button
            type="submit"
            disabled={sources.length === 0 || !question.trim() || loadingSourceId !== null}
            className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm rounded-md hover:bg-gray-800 dark:hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
