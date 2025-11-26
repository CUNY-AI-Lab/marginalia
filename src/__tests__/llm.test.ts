import { describe, it, expect, vi } from 'vitest';

// Mock the openai module before importing llm
vi.mock('openai', () => {
  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: vi.fn(),
        },
      };
    },
  };
});

// Import after mocking
const { estimateTokens, isWithinTokenLimit } = await import('../lib/llm');

describe('estimateTokens', () => {
  it('estimates tokens from word count', () => {
    const text = 'This is a test with eight words here';
    const tokens = estimateTokens(text);
    // 8 words * 0.75 = 6
    expect(tokens).toBe(6);
  });

  it('handles empty string', () => {
    expect(estimateTokens('')).toBe(1); // '' splits to [''], length 1
  });

  it('handles single word', () => {
    expect(estimateTokens('word')).toBe(1);
  });

  it('handles multiple spaces', () => {
    const text = 'word1    word2   word3';
    // Split by whitespace gives ['word1', 'word2', 'word3']
    expect(estimateTokens(text)).toBe(3);
  });
});

describe('isWithinTokenLimit', () => {
  it('returns true for text within default limit', () => {
    const shortText = 'This is a short text';
    expect(isWithinTokenLimit(shortText)).toBe(true);
  });

  it('returns true for text within custom limit', () => {
    const text = 'One two three four five';
    expect(isWithinTokenLimit(text, 10)).toBe(true);
  });

  it('returns false for text exceeding limit', () => {
    const text = 'One two three four five six seven eight nine ten';
    expect(isWithinTokenLimit(text, 5)).toBe(false);
  });

  it('handles edge case at exact limit', () => {
    // 4 words * 0.75 = 3 tokens
    const text = 'One two three four';
    expect(isWithinTokenLimit(text, 3)).toBe(true);
  });
});
