'use client';

import { Document, Source, ParagraphType } from '@/lib/types';

// Typography styles for different paragraph types
const paragraphStyles: Record<ParagraphType, string> = {
  h1: 'text-3xl font-bold font-serif text-gray-900 dark:text-gray-100 mt-8 mb-4',
  h2: 'text-2xl font-semibold font-serif text-gray-900 dark:text-gray-100 mt-6 mb-3',
  h3: 'text-xl font-medium font-serif text-gray-800 dark:text-gray-200 mt-4 mb-2',
  body: 'text-base leading-7 text-gray-800 dark:text-gray-200 font-serif',
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
  engagements: Map<number, string[]>; // Map of paragraph index -> engaged source IDs
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

  const getSourceById = (id: string) => sources.find(s => s.id === id);

  return (
    <div className="p-8 lg:p-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-serif text-gray-900 dark:text-gray-100 mb-2">{document.title}</h1>
      {document.author && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">{document.author}</p>
      )}

      <div className="space-y-1">
        {document.paragraphs.map((para, index) => {
          const engagedSourceIds = engagements.get(index) || [];
          const isLoading = loadingEngagement === index;
          const isSelected = selectedParagraph === index;

          // Get the appropriate HTML element and styles for this paragraph type
          const Element = paragraphElements[para.type] || 'p';
          const typeStyles = paragraphStyles[para.type] || paragraphStyles.body;

          return (
            <div
              key={index}
              onClick={() => onSelectParagraph(index)}
              className={`relative py-3 px-4 -ml-4 rounded cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-gray-100 dark:bg-gray-800'
                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
              }`}
            >
              {/* Source indicators in margin - only show engaged sources */}
              <div className="absolute left-0 top-4 flex flex-col gap-1.5 -translate-x-5">
                {isLoading ? (
                  // Loading indicator
                  <div className="w-2 h-2 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse" />
                ) : engagedSourceIds.length > 0 ? (
                  // Show dots for engaged sources
                  engagedSourceIds.map((sourceId) => {
                    const source = getSourceById(sourceId);
                    if (!source) return null;
                    return (
                      <button
                        key={sourceId}
                        onClick={(e) => {
                          e.stopPropagation();
                          onClickSourceFlag(index, sourceId);
                        }}
                        className="w-2.5 h-2.5 rounded-full hover:scale-125 transition-transform cursor-pointer"
                        style={{ backgroundColor: source.color }}
                        title={`${source.title} — relevant passage`}
                      />
                    );
                  })
                ) : isSelected ? (
                  // Show empty state when selected but no sources engaged
                  <div className="w-2 h-2 rounded-full bg-gray-200 dark:bg-gray-700" title="No relevant sources" />
                ) : null}
              </div>

              <Element className={typeStyles}>
                {para.content}
              </Element>
            </div>
          );
        })}
      </div>
    </div>
  );
}
