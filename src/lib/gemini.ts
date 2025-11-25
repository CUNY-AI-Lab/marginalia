import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export const gemini3 = genAI.getGenerativeModel({
  model: 'gemini-3-pro-preview',
});

export async function generateContent(prompt: string, systemInstruction?: string) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-pro-preview',
    systemInstruction,
  });

  const result = await model.generateContent(prompt);
  return result.response.text();
}

export async function* streamContent(prompt: string, systemInstruction?: string) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-3-pro-preview',
    systemInstruction,
  });

  const result = await model.generateContentStream(prompt);

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) {
      yield text;
    }
  }
}

// Estimate token count (rough approximation: ~0.75 tokens per word)
export function estimateTokens(text: string): number {
  const words = text.split(/\s+/).length;
  return Math.ceil(words * 0.75);
}

// Check if text is within token limit
export function isWithinTokenLimit(text: string, limit: number = 500000): boolean {
  return estimateTokens(text) <= limit;
}
