import { describe, it, expect } from 'vitest';
import {
  parseStructureRefinementResponse,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  parseIdentityLayerResponse,
} from '../lib/prompts';
import { Source } from '../lib/types';

describe('parseStructureRefinementResponse', () => {
  it('parses valid JSON array response', () => {
    const response = `[
      { "type": "h1", "content": "Title" },
      { "type": "body", "content": "Paragraph text" }
    ]`;
    const result = parseStructureRefinementResponse(response);
    expect(result).toEqual([
      { type: 'h1', content: 'Title' },
      { type: 'body', content: 'Paragraph text' },
    ]);
  });

  it('extracts JSON from mixed text response', () => {
    const response = `Here is the refined structure:
    [{ "type": "h2", "content": "Section" }]
    Hope this helps!`;
    const result = parseStructureRefinementResponse(response);
    expect(result).toEqual([{ type: 'h2', content: 'Section' }]);
  });

  it('normalizes invalid types to body', () => {
    const response = '[{ "type": "invalid", "content": "Text" }]';
    const result = parseStructureRefinementResponse(response);
    expect(result).toEqual([{ type: 'body', content: 'Text' }]);
  });

  it('returns null for non-JSON response', () => {
    const response = 'This is not JSON';
    const result = parseStructureRefinementResponse(response);
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const response = '[{ broken json }]';
    const result = parseStructureRefinementResponse(response);
    expect(result).toBeNull();
  });
});

describe('buildAgentSystemPrompt', () => {
  const mockSource: Source = {
    id: 'test-1',
    title: 'Test Book',
    author: 'Test Author',
    fullText: 'Full text content',
    color: '#ff0000',
  };

  const mockSourceWithIdentity: Source = {
    ...mockSource,
    identityLayer: {
      coreCommitments: 'Core commitments text',
      antagonists: 'Antagonists text',
      characteristicMoves: 'Moves text',
      vocabulary: ['term1', 'term2'],
      triggers: 'Triggers text',
      voiceSamples: ['quote1', 'quote2'],
      raw: 'Raw identity layer',
    },
  };

  it('builds brief mode prompt without identity layer', () => {
    const result = buildAgentSystemPrompt(mockSource, 'brief');
    expect(result).toContain('Test Book');
    expect(result).toContain('Test Author');
    expect(result).toContain('1-2 sentences');
  });

  it('builds brief mode prompt with identity layer', () => {
    const result = buildAgentSystemPrompt(mockSourceWithIdentity, 'brief');
    expect(result).toContain('Raw identity layer');
  });

  it('builds normal mode prompt', () => {
    const result = buildAgentSystemPrompt(mockSource, 'normal');
    expect(result).toContain('Test Book');
    expect(result).toContain('2-4 sentences typical');
  });

  it('defaults to normal mode', () => {
    const result = buildAgentSystemPrompt(mockSource);
    expect(result).toContain('2-4 sentences typical');
  });
});

describe('buildAgentUserPrompt', () => {
  it('builds basic prompt with passage only', () => {
    const result = buildAgentUserPrompt('Test passage');
    expect(result).toContain('PASSAGE BEING DISCUSSED');
    expect(result).toContain('Test passage');
    expect(result).toContain('How does this text relate');
  });

  it('includes full text when provided', () => {
    const result = buildAgentUserPrompt('Passage', undefined, 'Full source text');
    expect(result).toContain('FULL TEXT OF SOURCE');
    expect(result).toContain('Full source text');
  });

  it('includes custom question', () => {
    const result = buildAgentUserPrompt('Passage', 'What is the main argument?');
    expect(result).toContain('NEW QUESTION: What is the main argument?');
    expect(result).not.toContain('How does this text relate');
  });

  it('includes conversation history', () => {
    const history = [
      { question: 'First question?', response: 'First response' },
      { response: 'Second response' },
    ];
    const result = buildAgentUserPrompt('Passage', undefined, undefined, history);
    expect(result).toContain('PREVIOUS ANALYSIS');
    expect(result).toContain('First question?');
    expect(result).toContain('First response');
    expect(result).toContain('Second response');
  });
});

describe('parseIdentityLayerResponse', () => {
  const validResponse = JSON.stringify({
    title: 'Book Title',
    author: 'Author Name',
    year: '2023',
    coreCommitments: 'Core text',
    antagonists: 'Antagonist text',
    characteristicMoves: 'Moves text',
    vocabulary: ['term1', 'term2'],
    triggers: 'Trigger text',
    voiceSamples: ['quote1'],
  });

  it('parses valid JSON response', () => {
    const result = parseIdentityLayerResponse(validResponse);
    expect(result).not.toBeNull();
    expect(result?.metadata.title).toBe('Book Title');
    expect(result?.metadata.author).toBe('Author Name');
    expect(result?.metadata.year).toBe('2023');
    expect(result?.identityLayer.coreCommitments).toBe('Core text');
    expect(result?.identityLayer.vocabulary).toEqual(['term1', 'term2']);
  });

  it('extracts JSON from mixed text', () => {
    const response = `Here is the analysis:\n${validResponse}\nEnd of analysis.`;
    const result = parseIdentityLayerResponse(response);
    expect(result?.metadata.title).toBe('Book Title');
  });

  it('handles missing optional fields', () => {
    const minimal = JSON.stringify({ title: 'Title' });
    const result = parseIdentityLayerResponse(minimal);
    expect(result).not.toBeNull();
    expect(result?.metadata.title).toBe('Title');
    expect(result?.metadata.author).toBeNull();
    expect(result?.identityLayer.vocabulary).toEqual([]);
  });

  it('returns null for non-JSON response', () => {
    const result = parseIdentityLayerResponse('Not JSON at all');
    expect(result).toBeNull();
  });

  it('returns null for invalid JSON', () => {
    const result = parseIdentityLayerResponse('{ broken json }');
    expect(result).toBeNull();
  });

  it('builds raw identity layer string', () => {
    const result = parseIdentityLayerResponse(validResponse);
    expect(result?.identityLayer.raw).toContain('CORE COMMITMENTS');
    expect(result?.identityLayer.raw).toContain('Core text');
    expect(result?.identityLayer.raw).toContain('VOCABULARY');
  });
});
