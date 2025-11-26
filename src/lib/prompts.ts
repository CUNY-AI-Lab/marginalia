import { Source, IdentityLayer, StructuredParagraph } from './types';

export const STRUCTURE_REFINEMENT_PROMPT = `You are refining the structure detection for a document that was analyzed using font-based heuristics.

The current structure was detected automatically based on font sizes:
- h1: Title/largest headings (font 1.5x+ body text)
- h2: Major section headings (font 1.25-1.5x body text)
- h3: Subsection headings (font 1.1-1.25x body text)
- body: Regular paragraph text

Your task is to refine this classification. Fix common issues:
1. Page numbers or headers incorrectly marked as h1
2. Section headings missed because of similar font size to body
3. Incorrect heading hierarchy (h3 shouldn't come before h2)
4. Very short body paragraphs that are actually headings
5. Merge paragraphs that were incorrectly split

Return a JSON array with the refined structure, maintaining the original content:
[
  { "type": "h1", "content": "Document Title" },
  { "type": "body", "content": "First paragraph..." },
  { "type": "h2", "content": "Section Heading" },
  ...
]

IMPORTANT:
- Keep ALL content - do not remove or summarize paragraphs
- Only change the "type" classification when needed
- Preserve the exact text content
- Return ONLY the JSON array, no commentary

Document structure to refine:`;

export function parseStructureRefinementResponse(response: string): StructuredParagraph[] | null {
  try {
    // Try to extract JSON array from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed)) return null;

    // Validate and normalize the structure
    return parsed.map((item: { type?: string; content?: string }) => ({
      type: (['h1', 'h2', 'h3', 'body'].includes(item.type || '') ? item.type : 'body') as 'h1' | 'h2' | 'h3' | 'body',
      content: String(item.content || ''),
    }));
  } catch {
    return null;
  }
}

export type PromptMode = 'normal' | 'brief';

export const IDENTITY_EXTRACTION_PROMPT = `Analyze this text and extract the following. Be thorough but concise.

FIRST, extract the document metadata by looking at the title, header, byline, or citation information:
- title: The full title of this work
- author: The author(s) of this work
- year: Publication year if identifiable (null if not found)

THEN, analyze the content:

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

6. CHARACTERISTIC PASSAGES (3-5 short quotes)
Select quotes that capture the text's tone, style, and typical phrasing.

Format your response as JSON with these keys:
{
  "title": "...",
  "author": "...",
  "year": "..." or null,
  "coreCommitments": "...",
  "antagonists": "...",
  "characteristicMoves": "...",
  "vocabulary": ["term1", "term2", ...],
  "triggers": "...",
  "voiceSamples": ["quote1", "quote2", ...]
}`;

export function buildAgentSystemPrompt(source: Source, mode: PromptMode = 'normal'): string {
  if (mode === 'brief') {
    return `You are analyzing "${source.title}" by ${source.author}.

${source.identityLayer ? `ABOUT THIS TEXT:\n${source.identityLayer.raw}\n` : ''}

YOUR TASK: Find relevant passages and respond in third person.

INSTRUCTIONS:
1. Search the full text for passages relevant to the topic being discussed
2. If relevant, respond in 1-2 sentences using "this text" or the title as subject
3. Include a brief quote to ground your response
4. If the topic doesn't connect to the text's concerns, respond with just "—"

FORMAT: [1-2 sentence response with inline quote]

EXAMPLES OF GOOD RESPONSES:
- "This text emphasizes human mediation—'for the foreseeable future it is people that will continue to make libraries effective.'"
- "The argument here resists technological determinism; it insists 'we prioritize the security and privacy of users.'"
- "—" (when topic is outside the text's concerns)

DO NOT:
- Use "I" or "my"—always third person
- Give generic commentary that could come from any source
- Summarize the whole text
- Hedge with phrases like "This is an interesting point"
- Exceed 2 sentences`;
  }

  // Normal mode
  return `You are analyzing "${source.title}" by ${source.author}.

Respond as an analyst speaking FOR this text in third person. Use "this text," the title, or "the argument" as subject—never "I" or "my."

The text can argue, resist, emphasize, push back—but you are describing its position, not voicing an author.

${source.identityLayer ? `ABOUT THIS TEXT:\n${source.identityLayer.raw}\n` : ''}

Guidelines:
- Respond to what's being discussed, not everything the text addresses
- Be concise (2-4 sentences typical, expand only when specifically asked)
- Use the text's characteristic vocabulary when apt
- Ground claims in specific quotes from the text
- If the passage doesn't touch the text's concerns, say so briefly

Do not:
- Use first person ("I", "my", "me")
- Give generic academic commentary
- Summarize the whole text
- Hedge excessively with disclaimers`;
}

export const PREFILTER_PROMPT = `Given a passage and a list of sources, determine which sources would have something meaningful to say.

Be selective - only include sources that would genuinely engage with this content based on their core commitments and concerns. If a source's main arguments don't relate to the passage, exclude it.

Return a JSON array of source IDs that should respond. Example: ["source-1", "source-3"]

If no sources would have something substantive to add, return an empty array: []`;

export interface ConversationHistoryEntry {
  question?: string;
  response: string;
}

export function buildAgentUserPrompt(
  passage: string,
  question?: string,
  fullText?: string,
  conversationHistory?: ConversationHistoryEntry[]
): string {
  let prompt = '';

  if (fullText) {
    prompt += `FULL TEXT OF SOURCE:\n${fullText}\n\n---\n\n`;
  }

  prompt += `PASSAGE BEING DISCUSSED:\n"${passage}"`;

  // Include conversation history for followup context
  if (conversationHistory && conversationHistory.length > 0) {
    prompt += `\n\n---\n\nPREVIOUS ANALYSIS:`;
    for (const entry of conversationHistory) {
      if (entry.question) {
        prompt += `\n\nReader asked: "${entry.question}"`;
      }
      prompt += `\nPrevious response: "${entry.response}"`;
    }
    prompt += `\n\n---`;
  }

  if (question) {
    prompt += `\n\nNEW QUESTION: ${question}`;
  } else if (!conversationHistory || conversationHistory.length === 0) {
    // Only add the default prompt if this is the first exchange
    prompt += `\n\nHow does this text relate to the passage? What does the text affirm, challenge, or add?`;
  }

  return prompt;
}

export interface ExtractedMetadata {
  title: string | null;
  author: string | null;
  year: string | null;
}

export interface IdentityExtractionResult {
  identityLayer: IdentityLayer;
  metadata: ExtractedMetadata;
}

export function parseIdentityLayerResponse(response: string): IdentityExtractionResult | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return null;
    }

    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return null;
    }

    // Extract metadata
    const metadata: ExtractedMetadata = {
      title: parsed.title || null,
      author: parsed.author || null,
      year: parsed.year || null,
    };

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

CHARACTERISTIC PASSAGES:
${identityLayer.voiceSamples.map(q => `"${q}"`).join('\n')}`;

    return { identityLayer, metadata };
  } catch {
    return null;
  }
}
