'use client';

import { Document, Source } from '@/lib/types';

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
      <div className="flex items-center justify-center h-full text-gray-400">
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
      <h1 className="text-2xl font-serif text-gray-900 mb-2">{document.title}</h1>
      {document.author && (
        <p className="text-sm text-gray-500 mb-8">{document.author}</p>
      )}

      <div className="space-y-1">
        {document.paragraphs.map((para, index) => {
          const engagedSourceIds = engagements.get(index) || [];
          const isLoading = loadingEngagement === index;
          const isSelected = selectedParagraph === index;

          return (
            <div
              key={index}
              onClick={() => onSelectParagraph(index)}
              className={`relative py-3 px-4 -ml-4 rounded cursor-pointer transition-colors ${
                isSelected
                  ? 'bg-gray-100'
                  : 'hover:bg-gray-50'
              }`}
            >
              {/* Source indicators in margin - only show engaged sources */}
              <div className="absolute left-0 top-4 flex flex-col gap-1.5 -translate-x-5">
                {isLoading ? (
                  // Loading indicator
                  <div className="w-2 h-2 rounded-full bg-gray-300 animate-pulse" />
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
                        title={`${source.title} has something to say`}
                      />
                    );
                  })
                ) : isSelected ? (
                  // Show empty state when selected but no sources engaged
                  <div className="w-2 h-2 rounded-full bg-gray-200" title="No sources have comments" />
                ) : null}
              </div>

              <p className="text-base leading-7 text-gray-800 font-serif">
                {para}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
