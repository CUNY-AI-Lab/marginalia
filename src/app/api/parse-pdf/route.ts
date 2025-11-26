import { NextRequest, NextResponse } from 'next/server';

const PDF_EXTRACTION_MODEL = 'google/gemini-2.5-flash';

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to base64 for OpenRouter
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const filename = file.name;
    const title = filename.replace(/\.pdf$/i, '');

    console.log(`[parse-pdf] Processing ${filename} (${(arrayBuffer.byteLength / 1024).toFixed(1)} KB)`);

    const startTime = Date.now();

    // Send to OpenRouter with Gemini's native PDF handling
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://marginalia.app',
        'X-Title': 'Marginalia',
      },
      body: JSON.stringify({
        model: PDF_EXTRACTION_MODEL,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract all text from this PDF document.

IMPORTANT FORMATTING RULES:
1. Preserve paragraph structure - keep logical paragraph breaks
2. FOOTNOTES: Keep footnote reference numbers inline (e.g., "text continues here.¹²") but move the actual footnote text to the end of each page or section, formatted as:
   [1] Footnote text here.
   [2] Another footnote.
3. HEADINGS: Preserve heading hierarchy by adding markdown-style markers:
   # for main titles
   ## for major sections
   ### for subsections
4. Remove page headers/footers and page numbers
5. Join hyphenated words that were split across lines

Output the clean, well-structured text.`
            },
            {
              type: 'file',
              file: {
                filename: filename,
                file_data: `data:application/pdf;base64,${base64}`
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[parse-pdf] OpenRouter error:', response.status, errorText);
      return NextResponse.json(
        { error: `PDF processing failed: ${response.status}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content || '';

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`[parse-pdf] Extracted ${extractedText.length} chars in ${elapsed}s`);

    // Parse the extracted text into structured paragraphs based on markdown markers
    const paragraphs = parseExtractedText(extractedText);

    return NextResponse.json({
      text: extractedText,
      title,
      paragraphs,
    });
  } catch (error) {
    console.error('PDF parsing error:', error);
    return NextResponse.json(
      { error: 'Failed to parse PDF' },
      { status: 500 }
    );
  }
}

interface StructuredParagraph {
  type: 'h1' | 'h2' | 'h3' | 'body';
  content: string;
}

function parseExtractedText(text: string): StructuredParagraph[] {
  const paragraphs: StructuredParagraph[] = [];
  const lines = text.split('\n');
  let currentParagraph = '';

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      // Empty line - flush current paragraph
      if (currentParagraph.trim()) {
        paragraphs.push({ type: 'body', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      continue;
    }

    // Check for markdown headings
    if (trimmed.startsWith('### ')) {
      if (currentParagraph.trim()) {
        paragraphs.push({ type: 'body', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      paragraphs.push({ type: 'h3', content: trimmed.slice(4) });
    } else if (trimmed.startsWith('## ')) {
      if (currentParagraph.trim()) {
        paragraphs.push({ type: 'body', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      paragraphs.push({ type: 'h2', content: trimmed.slice(3) });
    } else if (trimmed.startsWith('# ')) {
      if (currentParagraph.trim()) {
        paragraphs.push({ type: 'body', content: currentParagraph.trim() });
        currentParagraph = '';
      }
      paragraphs.push({ type: 'h1', content: trimmed.slice(2) });
    } else {
      // Regular text - accumulate into paragraph
      currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
    }
  }

  // Flush any remaining paragraph
  if (currentParagraph.trim()) {
    paragraphs.push({ type: 'body', content: currentParagraph.trim() });
  }

  return paragraphs;
}
