'use client';

import { useState } from 'react';
import { Source } from '@/lib/types';
import AgentMessage from './AgentMessage';

interface AgentResponseState {
  sourceId: string;
  content: string;
  done: boolean;
  replyTo?: string;
}

interface ConversationPanelProps {
  sources: Source[];
  engagedSourceIds: string[]; // Sources that would engage with current paragraph
  responses: AgentResponseState[];
  loadingSourceId: string | null; // Which source is currently generating
  selectedParagraph: string | null;
  onGenerateResponse: (sourceId: string, replyToContent?: string) => void;
  onAsk: (question: string) => void;
  onDeleteSource: (id: string) => void;
}

export default function ConversationPanel({
  sources,
  engagedSourceIds,
  responses,
  loadingSourceId,
  selectedParagraph,
  onGenerateResponse,
  onAsk,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDeleteSource,
}: ConversationPanelProps) {
  const [question, setQuestion] = useState('');
  const [expandedReply, setExpandedReply] = useState<string | null>(null);

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
    <div className="flex flex-col h-full bg-white border-l border-gray-200">
      {/* Sources roster with engagement status */}
      <div className="p-4 border-b border-gray-100">
        <div className="text-xs uppercase tracking-wide text-gray-400 mb-3">
          Sources
        </div>
        {sources.length === 0 ? (
          <p className="text-sm text-gray-500">
            No sources loaded.{' '}
            <a href="/sources" className="text-blue-600 hover:underline">
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
                  <span className="text-sm text-gray-700 truncate flex-1">
                    {source.title}
                  </span>
                  {selectedParagraph && (
                    <>
                      {hasResponded ? (
                        <span className="text-xs text-gray-400">responded</span>
                      ) : isLoading ? (
                        <span className="text-xs text-gray-400">writing...</span>
                      ) : isEngaged ? (
                        <button
                          onClick={() => onGenerateResponse(source.id)}
                          className="text-xs px-2 py-0.5 bg-gray-100 hover:bg-gray-200 rounded"
                        >
                          hear
                        </button>
                      ) : (
                        <span className="text-xs text-gray-300">—</span>
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
          <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm">
            <div>
              <p>Click a paragraph to see which sources have comments</p>
            </div>
          </div>
        ) : responses.length === 0 && pendingEngagedSources.length === 0 ? (
          <div className="h-full flex items-center justify-center text-center text-gray-400 text-sm">
            <div>
              <p>No sources have comments on this passage</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Pending sources that can respond */}
            {pendingEngagedSources.length > 0 && responses.length === 0 && (
              <div className="text-sm text-gray-500 mb-4">
                <p className="mb-2">Sources with something to say:</p>
                <div className="flex flex-wrap gap-2">
                  {pendingEngagedSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => onGenerateResponse(source.id)}
                      disabled={loadingSourceId !== null}
                      className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full text-xs disabled:opacity-50"
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
                  <AgentMessage
                    source={source}
                    content={response.content}
                    isStreaming={isStreaming}
                  />

                  {/* Reply options - show when done and not already replying */}
                  {response.done && !isStreaming && (
                    <div className="mt-2 ml-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      {expandedReply === response.sourceId ? (
                        <div className="flex flex-wrap gap-1">
                          {sources
                            .filter(s => s.id !== response.sourceId && !responses.some(r => r.replyTo === response.content && r.sourceId === s.id))
                            .map((s) => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  onGenerateResponse(s.id, response.content);
                                  setExpandedReply(null);
                                }}
                                disabled={loadingSourceId !== null}
                                className="inline-flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded disabled:opacity-50"
                              >
                                <div
                                  className="w-1.5 h-1.5 rounded-full"
                                  style={{ backgroundColor: s.color }}
                                />
                                reply
                              </button>
                            ))}
                          <button
                            onClick={() => setExpandedReply(null)}
                            className="text-xs text-gray-400 hover:text-gray-600 px-1"
                          >
                            cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setExpandedReply(response.sourceId)}
                          className="text-xs text-gray-400 hover:text-gray-600"
                        >
                          let another source respond...
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Loading indicator */}
            {loadingSourceId && !responses.some(r => r.sourceId === loadingSourceId) && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <div className="animate-spin w-4 h-4 border-2 border-gray-300 border-t-gray-600 rounded-full" />
                <span>
                  {getSourceById(loadingSourceId)?.title || 'Source'} is responding...
                </span>
              </div>
            )}

            {/* More sources available */}
            {responses.length > 0 && pendingEngagedSources.length > 0 && (
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-400 mb-2">More sources with comments:</p>
                <div className="flex flex-wrap gap-2">
                  {pendingEngagedSources.map((source) => (
                    <button
                      key={source.id}
                      onClick={() => onGenerateResponse(source.id)}
                      disabled={loadingSourceId !== null}
                      className="inline-flex items-center gap-1.5 px-2 py-1 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-full text-xs disabled:opacity-50"
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
            disabled={sources.length === 0 || !question.trim() || loadingSourceId !== null}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
