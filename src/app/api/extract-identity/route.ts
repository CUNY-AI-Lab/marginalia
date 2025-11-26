import { NextRequest, NextResponse } from 'next/server';
import { generateContent } from '@/lib/llm';
import { IDENTITY_EXTRACTION_PROMPT, parseIdentityLayerResponse } from '@/lib/prompts';

export async function POST(request: NextRequest) {
  try {
    const { text, title, author } = await request.json();

    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    const prompt = `${IDENTITY_EXTRACTION_PROMPT}

---

TEXT TO ANALYZE:
Title: ${title || 'Unknown'}
Author: ${author || 'Unknown'}

${text}`;

    const response = await generateContent(prompt);

    console.log('[extract-identity] Gemini response length:', response.length);
    console.log('[extract-identity] Response preview:', response.slice(0, 1000));

    const result = parseIdentityLayerResponse(response);

    if (!result) {
      console.error('[extract-identity] Parse failed. Full response:', response);
      return NextResponse.json(
        { error: 'Failed to parse identity layer from response' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      identityLayer: result.identityLayer,
      metadata: result.metadata,
    });
  } catch (error) {
    console.error('[extract-identity] Error:', error);
    console.error('[extract-identity] Error type:', error instanceof Error ? error.constructor.name : typeof error);
    console.error('[extract-identity] Error message:', error instanceof Error ? error.message : String(error));
    return NextResponse.json(
      { error: 'Failed to extract identity' },
      { status: 500 }
    );
  }
}
