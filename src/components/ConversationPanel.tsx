'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Source } from '@/lib/types';
import { EngagementEntry } from '@/lib/storage';
import AgentMessage from './AgentMessage';

interface AgentResponseState {
  sourceId: string;
  content: string;
  done: boolean;
  replyTo?: string;
  question?: string; // The reader's question that prompted this response
}

interface ConversationPanelProps {
  sources: Source[];
  engagedSourceIds: string[]; // Sources that would engage with the current paragraph
  engagements?: EngagementEntry[]; // How each engaged source engages
  checkingRelevance?: boolean;
  responses: AgentResponseState[];
  loadingSourceId: string | null; // Which source is currently generating
  selectedParagraph: string | null;
  askingSource: string | null; // Which source is targeted for the next question (null = all)
  onSetAskingSource: (sourceId: string | null) => void;
  onGenerateResponse: (sourceId: string, replyToContent?: string) => void;
  onAsk: (question: string) => void;
  onClearAndRefresh?: () => void;
}

// Display name for a source's author, without translator notes.
export function authorName(source: Pick<Source, 'author' | 'title'>): string {
  const author = (source.author || '').replace(/\s*\((?:trans|tr|ed)\.[^)]*\)/i, '').trim();
  if (!author || /^(unknown|extracting\.\.\.|upload failed|extraction failed)$/i.test(author)) return source.title;
  return author;
}

const ENGAGEMENT_LABEL: Record<string, string> = {
  affirms: 'Affirms',
  extends: 'Extends',
  challenges: 'Challenges',
  complicates: 'Complicates',
  evidence: 'Evidence',
  reframes: 'Reframes',
  contextualizes: 'Context',
};

function Dots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[0, 150, 300].map(delay => (
        <span key={delay} className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
      ))}
    </span>
  );
}

export default function ConversationPanel({
  sources,
  engagedSourceIds,
  engagements = [],
  checkingRelevance = false,
  responses,
  loadingSourceId,
  selectedParagraph,
  askingSource,
  onSetAskingSource,
  onGenerateResponse,
  onAsk,
  onClearAndRefresh,
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
  const engagementFor = (id: string) => engagements.find(e => e.sourceId === id);
  const respondedSourceIds = new Set(responses.map(r => r.sourceId));
  const busy = loadingSourceId !== null;

  // Engaged sources first (in the model's order), then the rest.
  const orderedSources = [
    ...engagedSourceIds.map(getSourceById).filter((s): s is Source => !!s),
    ...sources.filter(s => !engagedSourceIds.includes(s.id)),
  ];
  const asking = askingSource ? getSourceById(askingSource) : undefined;

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
      <div className="px-5 pt-5 pb-3 border-b border-gray-100 dark:border-gray-800">
        <h2 className="font-display text-lg font-semibold text-gray-900 dark:text-gray-50">In the margins</h2>
        {selectedParagraph ? (
          <blockquote className="mt-2 border-l-2 border-blue-600 dark:border-blue-400 pl-3 font-serif text-sm italic text-gray-600 dark:text-gray-300 line-clamp-3">
            {selectedParagraph}
          </blockquote>
        ) : (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {sources.length === 0 ? 'Add another text to this workspace to hear it respond.' : 'Select a passage in the text.'}
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Sources */}
        <section className="px-5 py-4 border-b border-gray-100 dark:border-gray-800" aria-label="Sources">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
              Sources{sources.length > 0 ? ` (${sources.length})` : ''}
            </span>
            {checkingRelevance && (
              <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                Finding who would respond <Dots />
              </span>
            )}
          </div>

          {sources.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No other texts in this workspace.{' '}
              <Link href="/library" className="text-blue-600 dark:text-blue-400 underline-offset-2 hover:underline">
                Add some from your library
              </Link>
              .
            </p>
          ) : (
            <ul className="space-y-1">
              {orderedSources.map(source => {
                const engagement = engagementFor(source.id);
                const isEngaged = engagedSourceIds.includes(source.id);
                const hasResponded = respondedSourceIds.has(source.id);
                const isLoading = loadingSourceId === source.id;
                const quiet = selectedParagraph && !checkingRelevance && !isEngaged;
                return (
                  <li
                    key={source.id}
                    className={`rounded-lg px-3 py-2.5 ${isEngaged ? 'bg-gray-50 dark:bg-gray-800/60' : ''} ${quiet ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: source.color }} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{authorName(source)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 truncate" title={source.title}>{source.title}</div>
                        {selectedParagraph && engagement && (
                          <p className="mt-1.5 text-xs text-gray-700 dark:text-gray-300">
                            <span className="font-semibold text-blue-700 dark:text-blue-300">{ENGAGEMENT_LABEL[engagement.type] ?? engagement.type}</span>
                            {engagement.angle && engagement.angle !== 'has relevant perspective' ? ` — ${engagement.angle}` : ''}
                          </p>
                        )}
                      </div>
                      {selectedParagraph && (
                        <div className="flex-shrink-0 pt-0.5">
                          {isLoading ? (
                            <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                              Reading <Dots />
                            </span>
                          ) : hasResponded ? (
                            <span className="text-xs text-gray-400 dark:text-gray-500">Responded</span>
                          ) : (
                            <button
                              onClick={() => onGenerateResponse(source.id)}
                              disabled={busy || checkingRelevance}
                              className={`text-xs font-medium rounded-md px-2.5 py-1 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                isEngaged
                                  ? 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400'
                                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800'
                              }`}
                              title={isEngaged ? 'Hear what this text says about the passage' : 'Ask this text anyway'}
                            >
                              {isEngaged ? 'Hear' : 'Ask anyway'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          {selectedParagraph && !checkingRelevance && sources.length > 0 && engagedSourceIds.length === 0 && (
            <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">None of your sources has much to say about this passage.</p>
          )}
        </section>

        {/* Comments */}
        <section className="px-5 py-4 space-y-4" aria-label="Comments" aria-live="polite">
          {!selectedParagraph && sources.length > 0 && (
            <ol className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
              {[
                'Click any paragraph in the text.',
                'Marginalia checks which of your other texts would respond, and how.',
                'Hear a source, or ask them all a question about the passage.',
              ].map((step, i) => (
                <li key={step} className="flex gap-3">
                  <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 text-xs font-semibold flex items-center justify-center">
                    {i + 1}
                  </span>
                  {step}
                </li>
              ))}
            </ol>
          )}

          {responses.length > 0 && onClearAndRefresh && (
            <div className="flex justify-end -mb-2">
              <button
                onClick={onClearAndRefresh}
                disabled={busy}
                className="text-xs text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200 disabled:opacity-50"
              >
                Clear comments
              </button>
            </div>
          )}

          {responses.map((response, idx) => {
            const source = getSourceById(response.sourceId);
            if (!source) return null;
            const isStreaming = loadingSourceId === source.id && !response.done;
            return (
              <div key={`${response.sourceId}-${idx}`} className="group">
                {response.question && (
                  <div className="mb-2 flex justify-end">
                    <div className="bg-blue-600 text-white text-sm px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%]">{response.question}</div>
                  </div>
                )}
                <AgentMessage source={source} name={authorName(source)} content={response.content} isStreaming={isStreaming} />
                {response.done && !isStreaming && (
                  <button
                    onClick={() => onSetAskingSource(source.id)}
                    className="mt-1 ml-1 text-xs text-gray-500 hover:text-blue-700 dark:text-gray-400 dark:hover:text-blue-300"
                  >
                    Ask {authorName(source)} a follow-up
                  </button>
                )}
              </div>
            );
          })}
        </section>
      </div>

      {/* Questions */}
      <div className="p-4 border-t border-gray-100 dark:border-gray-800">
        {asking && (
          <div className="mb-2 flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300">
            Asking only
            <span className="inline-flex items-center gap-1.5 pl-2 pr-1 py-0.5 bg-gray-100 dark:bg-gray-800 rounded-full">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: asking.color }} />
              {authorName(asking)}
              <button
                type="button"
                onClick={() => onSetAskingSource(null)}
                className="ml-0.5 w-4 h-4 rounded-full text-gray-500 hover:bg-gray-200 hover:text-gray-800 dark:hover:bg-gray-700 dark:hover:text-white"
                aria-label="Ask all sources instead"
              >
                ×
              </button>
            </span>
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex gap-2">
          <label htmlFor="marginalia-question" className="sr-only">Question about the passage</label>
          <input
            id="marginalia-question"
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder={!selectedParagraph ? 'Select a passage first' : asking ? `Ask ${authorName(asking)}…` : 'Ask the sources about this passage…'}
            disabled={sources.length === 0 || !selectedParagraph}
            className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15 disabled:bg-gray-50 dark:disabled:bg-gray-900 disabled:cursor-not-allowed"
          />
          <button
            type="submit"
            disabled={sources.length === 0 || !question.trim() || busy}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Ask
          </button>
        </form>
      </div>
    </div>
  );
}
