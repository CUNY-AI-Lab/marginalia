import { NextRequest } from 'next/server';
import { Source, EngagementType } from '@/lib/types';
import { generateContent } from '@/lib/llm';

// Use a fast model for prefiltering
const PREFILTER_MODEL = 'google/gemini-2.5-flash';

// Valid engagement types for validation
const VALID_ENGAGEMENT_TYPES: EngagementType[] = [
  'affirms', 'extends', 'challenges', 'complicates', 'evidence', 'reframes', 'contextualizes'
];

interface EngagementResult {
  sourceId: string;
  type: EngagementType;
  angle: string;
}

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

Which sources would have something substantive to contribute to this discussion? For each source that would engage, identify HOW it would engage.

Engagement types:
- affirms: agrees with the passage's point
- extends: builds on or adds to the idea
- challenges: disagrees or pushes back
- complicates: agrees but with significant caveats
- evidence: has relevant case study or data
- reframes: would approach the question differently
- contextualizes: adds background or theoretical framing

Return a JSON array with engagement details. The "angle" should be a brief (5-15 word) description of the specific way the source engages:
[
  { "sourceId": "...", "type": "challenges", "angle": "resists the technological determinism implied here" },
  { "sourceId": "...", "type": "evidence", "angle": "case study of library automation illustrates this" }
]

If none would have something substantive to add, return: []`;

    const text = await generateContent(prompt, undefined, PREFILTER_MODEL);

    // Parse the JSON array from the response
    const jsonMatch = text.match(/\[[\s\S]*?\]/);
    let engagements: EngagementResult[] = [];
    let engagedSourceIds: string[] = [];

    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);

        // Handle both old format (string array) and new format (object array)
        if (Array.isArray(parsed)) {
          if (parsed.length > 0 && typeof parsed[0] === 'string') {
            // Old format: just IDs - convert with default type
            engagedSourceIds = parsed;
            engagements = parsed.map((id: string) => ({
              sourceId: id,
              type: 'contextualizes' as EngagementType,
              angle: 'has relevant perspective'
            }));
          } else {
            // New format: objects with type and angle
            engagements = parsed
              .filter((e: { sourceId?: string; type?: string; angle?: string }) =>
                e.sourceId &&
                e.type &&
                VALID_ENGAGEMENT_TYPES.includes(e.type as EngagementType)
              )
              .map((e: { sourceId: string; type: string; angle?: string }) => ({
                sourceId: e.sourceId,
                type: e.type as EngagementType,
                angle: e.angle || 'has relevant perspective'
              }));
            engagedSourceIds = engagements.map(e => e.sourceId);
          }
        }
      } catch {
        // Invalid JSON from LLM response, return empty arrays
      }
    }

    return new Response(
      JSON.stringify({
        engagedSourceIds,  // For backwards compatibility
        engagements        // New: includes type and angle
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to prefilter sources' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
