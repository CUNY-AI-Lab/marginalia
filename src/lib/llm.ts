import OpenAI from 'openai';

const client = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    'HTTP-Referer': 'https://marginalia.app',
    'X-Title': 'Marginalia',
  },
});

// Default model - easy to change
const DEFAULT_MODEL = 'google/gemini-3-pro-preview';

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

  const startTime = Date.now();
  console.log(`[llm] Starting request to ${model}...`);

  const response = await client.chat.completions.create({
    model,
    messages,
  });

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`[llm] Response received in ${elapsed}s`);

  return response.choices[0]?.message?.content || '';
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
}

// Keep token estimation for now
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 0.75);
}

export function isWithinTokenLimit(text: string, limit: number = 500000): boolean {
  return estimateTokens(text) <= limit;
}
