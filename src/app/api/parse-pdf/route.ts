import { NextRequest, NextResponse } from 'next/server';

const PDF_EXTRACTION_MODEL = 'google/gemini-2.5-flash';
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB limit

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENROUTER_API_KEY) {
      console.error('OPENROUTER_API_KEY is not configured');
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File too large. Maximum size is ${MAX_FILE_SIZE / 1024 / 1024}MB` },
        { status: 413 }
      );
    }

    const isPdfExtension = file.name.toLowerCase().endsWith('.pdf');
    const isPdfMimeType = file.type === 'application/pdf';

    if (!isPdfExtension && !isPdfMimeType) {
      return NextResponse.json(
        { error: 'Only PDF files are supported' },
        { status: 400 }
      );
    }

    // Convert file to base64 for OpenRouter
    const arrayBuffer = await file.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const filename = file.name;
    const title = filename.replace(/\.pdf$/i, '');

    // Send to OpenRouter with pdf-text plugin for faster extraction
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
        plugins: [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }],
        messages: [{
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Clean up and structure the text extracted from this PDF document.

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
      return NextResponse.json(
        { error: `PDF processing failed: ${response.status}` },
        { status: 500 }
      );
    }

    const result = await response.json();
    const extractedText = result.choices?.[0]?.message?.content || '';

    if (!extractedText.trim()) {
      console.error('PDF extraction returned empty text:', { filename: file.name });
      return NextResponse.json(
        { error: 'No text could be extracted from the PDF' },
        { status: 422 }
      );
    }

    // Parse the extracted text into structured paragraphs based on markdown markers
    const paragraphs = parseExtractedText(extractedText);

    return NextResponse.json({
      text: extractedText,
      title,
      paragraphs,
    });
  } catch (error) {
    console.error('PDF parsing failed:', error);
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
