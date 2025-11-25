'use client';

import { Document, Source } from '@/lib/types';

interface ReadingPaneProps {
  document: Document | null;
  sources: Source[];
  selectedParagraph: number | null;
  onSelectParagraph: (index: number) => void;
}

export default function ReadingPane({
  document,
  sources,
  selectedParagraph,
  onSelectParagraph,
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

  return (
    <div className="p-8 lg:p-12 max-w-2xl mx-auto">
      <h1 className="text-2xl font-serif text-gray-900 mb-2">{document.title}</h1>
      {document.author && (
        <p className="text-sm text-gray-500 mb-8">{document.author}</p>
      )}

      <div className="space-y-1">
        {document.paragraphs.map((para, index) => (
          <div
            key={index}
            onClick={() => onSelectParagraph(index)}
            className={`relative py-3 px-4 -ml-4 rounded cursor-pointer transition-colors ${
              selectedParagraph === index
                ? 'bg-gray-100'
                : 'hover:bg-gray-50'
            }`}
          >
            {/* Source indicators in margin */}
            <div className="absolute left-0 top-4 flex flex-col gap-1 -translate-x-4">
              {sources.map((source) => (
                <div
                  key={source.id}
                  className="w-1.5 h-1.5 rounded-full opacity-60"
                  style={{ backgroundColor: source.color }}
                  title={source.title}
                />
              ))}
            </div>

            <p className="text-base leading-7 text-gray-800 font-serif">
              {para}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
