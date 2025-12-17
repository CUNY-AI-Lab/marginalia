'use client';

import { useCallback } from 'react';
import Markdown from 'react-markdown';
import { Document, Source, ParagraphType } from '@/lib/types';
import { EngagementEntry } from '@/lib/storage';

// Typography styles for different paragraph types (defined outside component to prevent recreation)
const paragraphStyles: Record<ParagraphType, string> = {
  h1: 'text-2xl sm:text-3xl font-bold font-serif text-gray-900 dark:text-gray-100 mt-10 mb-4',
  h2: 'text-xl sm:text-2xl font-semibold font-serif text-gray-900 dark:text-gray-100 mt-8 mb-3',
  h3: 'text-lg sm:text-xl font-medium font-serif text-gray-900 dark:text-gray-100 mt-6 mb-2',
  body: 'text-base leading-7 text-gray-700 dark:text-gray-300 font-serif',
};

// HTML element for each paragraph type
const paragraphElements: Record<ParagraphType, 'h1' | 'h2' | 'h3' | 'p'> = {
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  body: 'p',
};

interface ReadingPaneProps {
  document: Document | null;
  sources: Source[];
  selectedParagraph: number | null;
  engagements: Map<number, EngagementEntry[]>; // Map of paragraph index -> engagement entries
  loadingEngagement: number | null; // Which paragraph is loading engagement check
  onSelectParagraph: (index: number) => void;
  onClickSourceFlag: (paragraphIndex: number, sourceId: string) => void;
}

export default function ReadingPane({
  document,
  sources,
  selectedParagraph,
  engagements,
  loadingEngagement,
  onSelectParagraph,
  onClickSourceFlag,
}: ReadingPaneProps) {
  // Memoize source lookup
  const getSourceById = useCallback(
    (id: string) => sources.find(s => s.id === id),
    [sources]
  );

  // Handle keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        onSelectParagraph(index);
      }
    },
    [onSelectParagraph]
  );

  if (!document) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
        <div className="text-center">
          <p className="mb-2">No document selected</p>
          <p className="text-sm">Upload or paste a document to start reading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 lg:p-12 max-w-2xl mx-auto overflow-x-hidden">
      {document.author && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{document.author}</p>
      )}

      <div className="space-y-4">
        {document.paragraphs.map((para, index) => {
          const entries = engagements.get(index) || [];
          const engagedSourceIds = entries.map(e => e.sourceId);
          const isLoading = loadingEngagement === index;
          const isSelected = selectedParagraph === index;

          // Get the appropriate HTML element and styles for this paragraph type
          const Element = paragraphElements[para.type] || 'p';
          const typeStyles = paragraphStyles[para.type] || paragraphStyles.body;

          return (
            <div
              key={index}
              role="button"
              tabIndex={0}
              onClick={() => onSelectParagraph(index)}
              onKeyDown={(e) => handleKeyDown(e, index)}
              aria-pressed={isSelected}
              aria-label={`Paragraph ${index + 1}${engagedSourceIds.length > 0 ? `, ${engagedSourceIds.length} sources have commentary` : ''}`}
              className={`relative py-3 px-4 -ml-4 rounded cursor-pointer transition-colors break-words focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${
                isSelected
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              {/* Source indicators in margin - responsive positioning */}
              <div className="absolute left-0 top-4 flex flex-col gap-1.5 -translate-x-3 sm:-translate-x-5">
                {isLoading ? (
                  // Loading indicator
                  <div className="w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
                ) : engagedSourceIds.length > 0 ? (
                  // Show dots for engaged sources
                  entries.map((entry) => {
                    const source = getSourceById(entry.sourceId);
                    if (!source) return null;
                    // Build tooltip with engagement info
                    const tooltip = entry.angle
                      ? `${source.title} — ${entry.type}: ${entry.angle}`
                      : `${source.title} — ${entry.type}`;
                    return (
                      <button
                        key={entry.sourceId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClickSourceFlag(index, entry.sourceId);
                        }}
                        aria-label={`Show commentary from ${source.title}`}
                        className="w-3 h-3 sm:w-2.5 sm:h-2.5 rounded-full hover:scale-125 transition-transform cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-1"
                        style={{ backgroundColor: source.color }}
                        title={tooltip}
                      />
                    );
                  })
                ) : isSelected ? (
                  // Show empty state when selected but no sources engaged
                  <div className="w-2.5 h-2.5 sm:w-2 sm:h-2 rounded-full bg-gray-200 dark:bg-gray-700" title="No relevant sources" />
                ) : null}
              </div>

              <Markdown
                components={{
                  // Override default paragraph to use our Element type with styles
                  p: ({ children }) => <Element className={typeStyles}>{children}</Element>,
                  // Override headings in case markdown contains heading syntax
                  h1: ({ children }) => <h1 className={paragraphStyles.h1}>{children}</h1>,
                  h2: ({ children }) => <h2 className={paragraphStyles.h2}>{children}</h2>,
                  h3: ({ children }) => <h3 className={paragraphStyles.h3}>{children}</h3>,
                  h4: ({ children }) => <h4 className={paragraphStyles.h3}>{children}</h4>,
                  h5: ({ children }) => <h5 className={paragraphStyles.h3}>{children}</h5>,
                  h6: ({ children }) => <h6 className={paragraphStyles.h3}>{children}</h6>,
                  // Style inline elements
                  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                  em: ({ children }) => <em className="italic">{children}</em>,
                  // Handle superscript for footnotes
                  sup: ({ children }) => <sup className="text-xs align-super ml-0.5">{children}</sup>,
                  // Links - with word breaking for long URLs
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 break-all"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {children}
                    </a>
                  ),
                  // Inline code
                  code: ({ children }) => (
                    <code className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded text-sm font-mono break-all">
                      {children}
                    </code>
                  ),
                  // Code blocks
                  pre: ({ children }) => (
                    <pre className="p-4 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded overflow-x-auto text-sm font-mono my-4">
                      {children}
                    </pre>
                  ),
                  // Blockquotes
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-gray-300 dark:border-gray-600 pl-4 italic text-gray-600 dark:text-gray-400 my-4">
                      {children}
                    </blockquote>
                  ),
                  // Lists
                  ul: ({ children }) => <ul className="list-disc list-inside my-2 space-y-1 text-gray-700 dark:text-gray-300">{children}</ul>,
                  ol: ({ children }) => <ol className="list-decimal list-inside my-2 space-y-1 text-gray-700 dark:text-gray-300">{children}</ol>,
                  li: ({ children }) => <li>{children}</li>,
                  // Horizontal rule
                  hr: () => <hr className="my-8 border-gray-200 dark:border-gray-700" />,
                }}
              >
                {para.content}
              </Markdown>
            </div>
          );
        })}
      </div>
    </div>
  );
}
