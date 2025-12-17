import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://marginalia.app',
    'X-Title': 'Marginalia',
  },
  timeout: 60000, // 60 second timeout for LLM requests
});

// Default model - configurable via environment variable
// Gemini 3 Flash: frontier intelligence built for speed at fraction of cost
const DEFAULT_MODEL = process.env.LLM_MODEL || 'google/gemini-3-flash-preview';

export class LLMError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'LLMError';
  }
}

export async function generateContent(
  prompt: string,
  systemInstruction?: string,
  model: string = DEFAULT_MODEL
): Promise<string> {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const response = await client.chat.completions.create({
      model,
      messages,
    });

    return response.choices[0]?.message?.content || '';
  } catch (error) {
    console.error('LLM generateContent failed:', error);
    throw new LLMError('Failed to generate content', error);
  }
}

export async function* streamContent(
  prompt: string,
  systemInstruction?: string,
  model: string = DEFAULT_MODEL
) {
  const messages: OpenAI.ChatCompletionMessageParam[] = [];

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }
  messages.push({ role: 'user', content: prompt });

  try {
    const stream = await client.chat.completions.create({
      model,
      messages,
      stream: true,
    });

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) {
        yield text;
      }
    }
  } catch (error) {
    console.error('LLM streamContent failed:', error);
    throw new LLMError('Failed to stream content', error);
  }
}

// Keep token estimation for now
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 0.75);
}

export function isWithinTokenLimit(text: string, limit: number = 500000): boolean {
  return estimateTokens(text) <= limit;
}
