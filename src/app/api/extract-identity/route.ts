import { NextRequest, NextResponse } from 'next/server';
import { generateContent } from '@/lib/gemini';
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
    const identityLayer = parseIdentityLayerResponse(response);

    if (!identityLayer) {
      return NextResponse.json(
        { error: 'Failed to parse identity layer from response' },
        { status: 500 }
      );
    }

    return NextResponse.json({ identityLayer });
  } catch (error) {
    console.error('Identity extraction error:', error);
    return NextResponse.json(
      { error: 'Failed to extract identity' },
      { status: 500 }
    );
  }
}
