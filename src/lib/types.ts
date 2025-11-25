// Core data types for Marginalia

export interface IdentityLayer {
  coreCommitments: string;
  antagonists: string;
  characteristicMoves: string;
  vocabulary: string[];
  triggers: string;
  voiceSamples: string[];
  raw: string; // concatenated for prompt inclusion
}

export interface Source {
  id: string;
  title: string;
  author: string;
  type: 'article' | 'book' | 'chapter' | 'other';
  fullText: string;
  identityLayer: IdentityLayer | null;
  color: string;
  createdAt: number;
}

export interface Document {
  id: string;
  title: string;
  author?: string;
  content: string;
  paragraphs: string[];
  createdAt: number;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Conversation {
  sourceId: string;
  messages: Message[];
}

export interface AgentResponse {
  sourceId: string;
  content: string;
  done: boolean;
  replyTo?: string; // ID of comment being replied to (for chain reactions)
}

// For tracking which sources would engage with a paragraph
export interface ParagraphEngagement {
  paragraphIndex: number;
  engagedSourceIds: string[];
}

// Colors for sources (cycle through these)
export const SOURCE_COLORS = [
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
];
