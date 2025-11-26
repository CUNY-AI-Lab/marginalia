import { NextRequest } from 'next/server';
import { Source } from '@/lib/types';
import { generateContent } from '@/lib/llm';

// Use a fast model for prefiltering
const PREFILTER_MODEL = 'google/gemini-2.5-flash';

export async function POST(request: NextRequest) {
  try {
    const { passage, sources } = await request.json() as {
      passage: string;
      sources: Source[];
    };

    if (!passage || !sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing passage or sources' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Build a concise summary of each source's concerns
    const sourceSummaries = sources.map(source => {
      const identity = source.identityLayer;
      if (!identity) {
        return `- ${source.id}: "${source.title}" by ${source.author}`;
      }
      // Extract just the triggers and core vocabulary
      const triggers = identity.triggers || '';
      const vocab = identity.vocabulary?.slice(0, 5).join(', ') || '';
      return `- ${source.id}: "${source.title}" - Key concerns: ${triggers.slice(0, 200)}. Vocabulary: ${vocab}`;
    }).join('\n');

    const prompt = `Given this passage being discussed in a seminar:

"${passage}"

And these sources with their key concerns:
${sourceSummaries}

Which sources would have something substantive to contribute to this discussion? Only include sources whose core commitments or concerns genuinely relate to the passage content.

Return ONLY a JSON array of source IDs that should respond. Example: ["source-1", "source-3"]
If none would have something substantive to add, return: []`;

    const text = await generateContent(prompt, undefined, PREFILTER_MODEL);

    // Parse the JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    const engagedSourceIds: string[] = jsonMatch ? JSON.parse(jsonMatch[0]) : [];

    return new Response(
      JSON.stringify({ engagedSourceIds }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Prefilter error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to prefilter sources' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
