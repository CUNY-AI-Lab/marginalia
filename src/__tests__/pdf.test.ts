import { describe, expect, it } from 'vitest';
import { structureFromPages, paragraphsToText, type PageRuns, type TextRun } from '@/lib/pdf';

// Builds a page from [text, x, y, size] lines; one run per line, like many PDF text layers.
function page(lines: Array<[string, number, number, number?]>, height = 800): PageRuns {
  const runs: TextRun[] = lines.map(([str, x, y, size = 10]) => ({ str, x, y, size, width: str.length * size * 0.5 }));
  return { runs, height };
}

const body = (text: string) => ({ type: 'body' as const, content: text });

describe('structureFromPages', () => {
  it('recovers headings, paragraphs and hyphenated words', () => {
    const pages = [
      page([
        ['Signs of the Times', 72, 740, 20],
        ['Mechanism', 72, 700, 13],
        ['Were we required to characterise this age of ours by any single epithet, we should be', 72, 680],
        ['tempted to call it, not an Heroical, Devotional, Philosophical, or Moral Age, but, above', 72, 668],
        ['all others, the Mechanical Age. It is the Age of Ma-', 72, 656],
        ['chinery, in every outward and inward sense.', 72, 644],
        ['Nothing is now done directly, or by hand; all is by rule and calculated contri-', 86, 632],
        ['vance and the end.', 72, 620],
      ]),
    ];
    expect(structureFromPages(pages)).toEqual([
      { type: 'h1', content: 'Signs of the Times' },
      { type: 'h2', content: 'Mechanism' },
      body('Were we required to characterise this age of ours by any single epithet, we should be tempted to call it, not an Heroical, Devotional, Philosophical, or Moral Age, but, above all others, the Mechanical Age. It is the Age of Machinery, in every outward and inward sense.'),
      body('Nothing is now done directly, or by hand; all is by rule and calculated contrivance and the end.'),
    ]);
  });

  it('drops running heads and page numbers and continues paragraphs across pages', () => {
    const line = 'a line of ordinary body text that runs across the full measure of the page and keeps';
    const pages = [1, 2, 3].map(n =>
      page([
        ['THE EDINBURGH REVIEW', 200, 770, 8],
        [`${line} going ${['alpha', 'beta', 'gamma'][n - 1]}`, 72, 700],
        [`${line} on until ${['one', 'two', 'three'][n - 1]}`, 72, 688],
        [String(n), 300, 40, 8],
      ]),
    );
    const result = structureFromPages(pages);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('body');
    expect(result[0].content).not.toContain('EDINBURGH');
    expect(result[0].content.match(/on until/g)).toHaveLength(3);
  });

  it('gathers footnotes at the end so they do not split a paragraph', () => {
    const pages = [
      page([
        ['The argument continues here and the sentence does not end on this page but', 72, 700],
        ['1 Edinburgh Review, 1829.', 72, 60, 8],
      ]),
      page([['carries on to the next page where it ends.', 72, 700]]),
    ];
    expect(structureFromPages(pages)).toEqual([
      body('The argument continues here and the sentence does not end on this page but carries on to the next page where it ends.'),
      { type: 'h2', content: 'Notes' },
      body('1 Edinburgh Review, 1829.'),
    ]);
  });

  it('writes headings as markdown in the plain text', () => {
    expect(paragraphsToText([{ type: 'h1', content: 'T' }, body('p'), { type: 'h3', content: 'S' }])).toBe('# T\n\np\n\n### S');
  });
});
