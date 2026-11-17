'use client';

import Markdown from 'react-markdown';
import { Source } from '@/lib/types';

interface AgentMessageProps {
  source: Source;
  name?: string;
  content: string;
  isStreaming?: boolean;
}

// One source's comment, set like a marginal note: the source's color as a rule, its name, then the note.
export default function AgentMessage({ source, name, content, isStreaming = false }: AgentMessageProps) {
  const failed = !isStreaming && /^(Failed to generate response|The model|The request|The response|Sign in|Your sign-in)/.test(content);
  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden" style={{ borderLeft: `3px solid ${source.color}` }}>
      <div className="px-4 pt-3 pb-1 flex items-baseline gap-2 min-w-0">
        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex-shrink-0">{name || source.author}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 truncate" title={source.title}>{source.title}</span>
      </div>
      <div className={`px-4 pb-3 font-serif text-[0.95rem] leading-relaxed ${failed ? 'text-red-700 dark:text-red-300' : 'text-gray-800 dark:text-gray-200'}`}>
        {content ? (
          <Markdown
            components={{
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              a: ({ children }) => <span className="underline">{children}</span>,
              img: () => null,
            }}
          >
            {content}
          </Markdown>
        ) : isStreaming ? (
          <span className="font-sans text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1.5">
            Reading the passage
            <span className="inline-flex gap-0.5" aria-hidden="true">
              {[0, 150, 300].map(delay => (
                <span key={delay} className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
              ))}
            </span>
          </span>
        ) : null}
        {content && isStreaming && <span className="inline-block w-1.5 h-4 bg-blue-600/60 ml-0.5 animate-pulse align-text-bottom" aria-hidden="true" />}
      </div>
    </div>
  );
}
