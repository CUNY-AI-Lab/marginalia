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
        <span className="text-sm font-semibold text-gray-700">
          {source.title.length > 30 ? source.title.slice(0, 30) + '...' : source.title}
        </span>
        <span className="text-xs text-gray-400 italic">
          {source.author}
        </span>
      </div>
      <p className="text-sm text-gray-600 leading-relaxed pl-4">
        {content}
        {isStreaming && (
          <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse" />
        )}
      </p>
    </div>
  );
}
