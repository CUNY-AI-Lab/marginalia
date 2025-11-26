'use client';

import { Source } from '@/lib/types';

interface AgentMessageProps {
  source: Source;
  content: string;
  isStreaming?: boolean;
}

export default function AgentMessage({ source, content, isStreaming = false }: AgentMessageProps) {
  return (
    <div className="group">
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{ backgroundColor: source.color }}
        />
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {source.title.length > 30 ? source.title.slice(0, 30) + '...' : source.title}
        </span>
        <span className="text-xs text-gray-400 dark:text-gray-500 italic">
          {source.author}
        </span>
      </div>
      <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed pl-4">
        {content || (isStreaming && (
          <span className="text-gray-400 dark:text-gray-500 italic flex items-center gap-1">
            Thinking
            <span className="flex gap-0.5 ml-1">
              <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1 h-1 bg-gray-400 dark:bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </span>
        ))}
        {content && isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 dark:bg-gray-500 ml-0.5 animate-pulse align-text-bottom" />
        )}
      </p>
    </div>
  );
}
