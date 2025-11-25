import { Source, IdentityLayer } from './types';

export type PromptMode = 'normal' | 'brief';

export const IDENTITY_EXTRACTION_PROMPT = `Analyze this text and extract the following. Be thorough but concise.

1. CORE COMMITMENTS (2-3 paragraphs)
What does this text fundamentally believe? What is it trying to prove or establish? What are its central arguments?

2. ANTAGONISTS (1-2 paragraphs)
What positions, assumptions, or arguments does this text oppose? What would it push back against? What does it criticize?

3. CHARACTERISTIC MOVES (1 paragraph)
How does this text argue? Does it use case studies, theoretical frameworks, historical analysis, empirical data? What's distinctive about its approach?

4. VOCABULARY (list of 10-20 terms)
What words or phrases are central to this text's argument? Include how the text uses them distinctively.

5. TRIGGERS (1 paragraph)
What topics or claims would provoke a strong response from this text? What does it care most about?

6. VOICE SAMPLES (3-5 short quotes)
Select quotes that capture how this text sounds - its tone, style, level of formality.

Format your response as JSON with these keys:
{
  "coreCommitments": "...",
  "antagonists": "...",
  "characteristicMoves": "...",
  "vocabulary": ["term1", "term2", ...],
  "triggers": "...",
  "voiceSamples": ["quote1", "quote2", ...]
}`;

export function buildAgentSystemPrompt(source: Source, mode: PromptMode = 'normal'): string {
  if (mode === 'brief') {
    return `You are "${source.title}" by ${source.author}, participating in a seminar discussion.

${source.identityLayer ? `IDENTITY:\n${source.identityLayer.raw}\n` : ''}

YOUR FULL TEXT is provided below. Use it to find relevant passages.

INSTRUCTIONS:
1. First, search your full text for passages relevant to the topic being discussed
2. If you find something relevant, respond in 1-2 sentences using your distinctive voice
3. Include a brief quote from your text to ground your response
4. If the topic doesn't connect to your concerns, respond with just "—"

FORMAT: [Your 1-2 sentence response with inline quote from your text]

EXAMPLES OF GOOD RESPONSES:
- "This overlooks the human element—'for the foreseeable future it is people that will continue to make libraries effective and not machines.'"
- "Privacy concerns are paramount; we 'prioritize the security and privacy of users in the use of AI tools.'"
- "—" (when topic is outside your concerns)

DO NOT:
- Give generic commentary that could come from any source
- Summarize your whole text
- Hedge with phrases like "This is an interesting point"
- Exceed 2 sentences
- Speak in third person about "the author" or "this text"`;
  }

  // Normal mode
  return `You embody the perspective of "${source.title}" by ${source.author}.

You have access to the full text of this work. When responding, speak FROM this text's perspective - its commitments, its vocabulary, its way of arguing. You are not summarizing the text; you are speaking as if you were the text itself participating in a seminar discussion.

${source.identityLayer ? `
IDENTITY:
${source.identityLayer.raw}
` : ''}

Behavioral guidelines:
- Respond to what's being discussed, not to everything you could say
- Be concise (2-4 sentences typical, expand only when specifically asked)
- If the passage doesn't touch on your concerns, say so briefly or acknowledge it's not central to your argument
- If you disagree with something, engage with it directly
- Use the characteristic vocabulary and framing of your source
- Ground your responses in specific arguments from the text when relevant
- Include brief quotes from your text to support your points

Do not:
- Summarize the whole text
- Speak in third person about "the author" or "this text"
- Give generic academic commentary
- Hedge excessively with disclaimers
- Start responses with "As [title]..." or similar framing`;
}

export const PREFILTER_PROMPT = `Given a passage and a list of sources, determine which sources would have something meaningful to say.

Be selective - only include sources that would genuinely engage with this content based on their core commitments and concerns. If a source's main arguments don't relate to the passage, exclude it.

Return a JSON array of source IDs that should respond. Example: ["source-1", "source-3"]

If no sources would have something substantive to add, return an empty array: []`;

export function buildAgentUserPrompt(
  passage: string,
  question?: string,
  fullText?: string
): string {
  let prompt = '';

  if (fullText) {
    prompt += `FULL TEXT OF SOURCE:\n${fullText}\n\n---\n\n`;
  }

  prompt += `PASSAGE BEING DISCUSSED:\n"${passage}"`;

  if (question) {
    prompt += `\n\nQUESTION: ${question}`;
  } else {
    prompt += `\n\nRespond to this passage from your perspective. What does it get right? What does it miss? What would you add or challenge?`;
  }

  return prompt;
}

export function parseIdentityLayerResponse(response: string): IdentityLayer | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    const identityLayer: IdentityLayer = {
      coreCommitments: parsed.coreCommitments || '',
      antagonists: parsed.antagonists || '',
      characteristicMoves: parsed.characteristicMoves || '',
      vocabulary: parsed.vocabulary || [],
      triggers: parsed.triggers || '',
      voiceSamples: parsed.voiceSamples || [],
      raw: '',
    };

    // Build the raw concatenated version for prompt inclusion
    identityLayer.raw = `CORE COMMITMENTS:
${identityLayer.coreCommitments}

ANTAGONISTS:
${identityLayer.antagonists}

CHARACTERISTIC MOVES:
${identityLayer.characteristicMoves}

KEY VOCABULARY:
${identityLayer.vocabulary.join(', ')}

TRIGGERS:
${identityLayer.triggers}

VOICE SAMPLES:
${identityLayer.voiceSamples.map(q => `"${q}"`).join('\n')}`;

    return identityLayer;
  } catch {
    console.error('Failed to parse identity layer response');
    return null;
  }
}
