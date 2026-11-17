// PDF text extraction in the browser. The file never leaves the person's machine; only the
// extracted text is later sent to a model. Structure (headings, paragraphs, notes) is recovered
// from the text layer's positions and font sizes.
import { BASE_PATH } from './api';
import type { StructuredParagraph } from './types';

export interface TextRun {
  str: string;
  x: number;
  y: number; // PDF user space: larger is higher on the page
  size: number;
  width: number;
}

export interface PageRuns {
  runs: TextRun[];
  height: number;
}

interface Line {
  text: string;
  x: number;
  y: number;
  size: number;
  width: number;
  page: number;
}

export class PdfTextError extends Error {}

const SENTENCE_END = /[.!?:;"”’)\]]$/;
const PAGE_NUMBER = /^(?:page\s+)?(?:\d{1,4}|[ivxlcdm]{1,7})$/i;

function buildLines(page: PageRuns, pageIndex: number): Line[] {
  const runs = page.runs.filter(run => run.str.length > 0).sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: Array<{ runs: TextRun[]; y: number; size: number }> = [];
  for (const run of runs) {
    const line = lines.find(candidate => Math.abs(candidate.y - run.y) < Math.max(candidate.size, run.size) * 0.5);
    if (line) {
      line.runs.push(run);
      line.size = Math.max(line.size, run.size);
    } else {
      lines.push({ runs: [run], y: run.y, size: run.size });
    }
  }
  return lines
    .map(line => {
      const ordered = line.runs.sort((a, b) => a.x - b.x);
      let text = '';
      let end = -Infinity;
      for (const run of ordered) {
        const gap = run.x - end;
        if (text && !text.endsWith(' ') && !run.str.startsWith(' ') && gap > run.size * 0.15) text += ' ';
        text += run.str;
        end = run.x + run.width;
      }
      // Size by characters, so a large drop cap or a stray symbol does not make a heading.
      const weights = new Map<number, number>();
      for (const run of ordered) {
        const key = Math.round(run.size * 2) / 2;
        weights.set(key, (weights.get(key) ?? 0) + run.str.trim().length);
      }
      const size = [...weights.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? line.size;
      return {
        text: text.replace(/\s+/g, ' ').trim(),
        x: ordered[0].x,
        y: line.y,
        size,
        width: end - ordered[0].x,
        page: pageIndex,
      };
    })
    .filter(line => line.text.length > 0)
    .sort((a, b) => b.y - a.y || a.x - b.x);
}

function mode(values: number[]): number {
  const counts = new Map<number, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const normalizeRepeated = (text: string) => text.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

function joinLine(paragraph: string, line: string): string {
  if (!paragraph) return line;
  // Rejoin a word hyphenated across a line break ("argu-" + "ment").
  if (/[A-Za-z]-$/.test(paragraph) && /^[a-z]/.test(line)) return paragraph.slice(0, -1) + line;
  return `${paragraph} ${line}`;
}

export function structureFromPages(pages: PageRuns[]): StructuredParagraph[] {
  const pageLines = pages.map(buildLines);
  const all = pageLines.flat();
  if (!all.length) return [];

  // Body size: the size carrying the most characters.
  const sizeChars = new Map<number, number>();
  for (const line of all) sizeChars.set(line.size, (sizeChars.get(line.size) ?? 0) + line.text.length);
  const body = [...sizeChars.entries()].sort((a, b) => b[1] - a[1])[0][0];

  // Running heads and footers: text at the top or bottom of many pages.
  const edgeCounts = new Map<string, number>();
  for (const lines of pageLines) {
    const edges = new Set([...lines.slice(0, 2), ...lines.slice(-2)].map(line => normalizeRepeated(line.text)));
    for (const key of edges) edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
  }
  const repeatedThreshold = Math.max(3, Math.ceil(pages.length * 0.4));
  const isEdge = (lines: Line[], index: number) => index < 2 || index >= lines.length - 2;

  const kept: Line[][] = [];
  const notes: Line[] = [];
  pageLines.forEach((lines, pageIndex) => {
    const height = pages[pageIndex].height || Math.max(...lines.map(l => l.y)) + body * 4;
    const keep: Line[] = [];
    lines.forEach((line, index) => {
      const runningHead = line.text.length <= 80 && (edgeCounts.get(normalizeRepeated(line.text)) ?? 0) >= repeatedThreshold;
      if (isEdge(lines, index) && (PAGE_NUMBER.test(line.text) || runningHead)) return;
      // Small type in the lower part of a page is a footnote; notes are gathered at the end so they
      // do not break paragraphs that run across pages.
      if (line.size < body * 0.88 && line.y < height * 0.3) {
        notes.push(line);
        return;
      }
      keep.push(line);
    });
    kept.push(keep);
  });

  const bodyLines = kept.flat().filter(line => Math.abs(line.size - body) < 0.5);
  const gaps: number[] = [];
  for (const lines of kept) {
    for (let i = 1; i < lines.length; i++) {
      const gap = lines[i - 1].y - lines[i].y;
      if (gap > 0 && Math.abs(lines[i].size - body) < 0.5 && Math.abs(lines[i - 1].size - body) < 0.5) gaps.push(gap);
    }
  }
  const lineGap = median(gaps) || body * 1.2;
  const leftMargin = mode(bodyLines.map(line => Math.round(line.x)));
  const fullWidth = median(bodyLines.map(line => line.width)) || 1;

  const levelOf = (line: Line): StructuredParagraph['type'] => {
    if (line.text.length > 200) return 'body';
    const ratio = line.size / body;
    if (ratio >= 1.5) return 'h1';
    if (ratio >= 1.25) return 'h2';
    if (ratio >= 1.12) return 'h3';
    return 'body';
  };

  const result: StructuredParagraph[] = [];
  let current: { type: StructuredParagraph['type']; content: string } | null = null;
  let previous: Line | null = null;
  const flush = () => {
    if (current && current.content.trim()) result.push({ type: current.type, content: current.content.trim() });
    current = null;
  };

  for (const lines of kept) {
    for (const line of lines) {
      const type = levelOf(line);
      let startNew = !current || current.type !== type;
      if (!startNew && previous && current) {
        if (type !== 'body') {
          // Consecutive heading lines of one level form one heading unless far apart.
          startNew = previous.page !== line.page || previous.y - line.y > line.size * 2;
        } else if (previous.page === line.page) {
          const gap = previous.y - line.y;
          const indented = line.x > leftMargin + body * 0.8;
          const shortEnd = previous.width < fullWidth * 0.75 && SENTENCE_END.test(previous.text);
          startNew = gap > lineGap * 1.45 || (indented && SENTENCE_END.test(previous.text)) || shortEnd;
        } else {
          // Across a page break, continue unless the last line ended a sentence and this one is indented.
          startNew = SENTENCE_END.test(previous.text) && line.x > leftMargin + body * 0.8;
        }
      }
      if (startNew) {
        flush();
        current = { type, content: line.text };
      } else if (current) {
        current.content = joinLine(current.content, line.text);
      }
      previous = line;
    }
  }
  flush();

  if (notes.length) {
    result.push({ type: 'h2', content: 'Notes' });
    let note = '';
    for (const line of notes) {
      // A note starts with its number or symbol.
      if (note && /^(?:\d{1,3}|[*†‡§])\s?\S/.test(line.text)) {
        result.push({ type: 'body', content: note });
        note = line.text;
      } else {
        note = joinLine(note, line.text);
      }
    }
    if (note) result.push({ type: 'body', content: note });
  }
  return result;
}

export function paragraphsToText(paragraphs: StructuredParagraph[]): string {
  const marks = { h1: '# ', h2: '## ', h3: '### ', body: '' } as const;
  return paragraphs.map(p => `${marks[p.type]}${p.content}`).join('\n\n');
}

export const MAX_PDF_BYTES = 50 * 1024 * 1024;

export async function extractPdf(file: File): Promise<{ paragraphs: StructuredParagraph[]; text: string; title: string | null }> {
  if (file.size > MAX_PDF_BYTES) throw new PdfTextError(`This PDF is larger than ${MAX_PDF_BYTES / 1024 / 1024} MB.`);
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = `${BASE_PATH}/pdf.worker.min.mjs`;
  const data = new Uint8Array(await file.arrayBuffer());
  const task = pdfjs.getDocument({ data });
  try {
    const pdf = await task.promise;
    const pages: PageRuns[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      const runs: TextRun[] = [];
      for (const item of content.items) {
        if (!('str' in item) || !item.str) continue;
        const [, , c, d, e, f] = item.transform as number[];
        runs.push({ str: item.str, x: e, y: f, size: Math.hypot(c, d) || item.height, width: item.width });
      }
      pages.push({ runs, height: viewport.height });
      page.cleanup();
    }
    const paragraphs = structureFromPages(pages);
    const text = paragraphsToText(paragraphs);
    if (text.replace(/\s/g, '').length < 200) {
      throw new PdfTextError('This PDF has little or no text layer (it may be a scan). Paste its text instead.');
    }
    const title = paragraphs.find(p => p.type === 'h1')?.content ?? null;
    return { paragraphs, text, title };
  } finally {
    await task.destroy();
  }
}
