// Core data types for Marginalia

// Paragraph structure types for typography hierarchy
export type ParagraphType = 'h1' | 'h2' | 'h3' | 'body';

export interface StructuredParagraph {
  type: ParagraphType;
  content: string;
}

export interface IdentityLayer {
  coreCommitments: string;
  antagonists: string;
  characteristicMoves: string;
  vocabulary: string[];
  triggers: string;
  voiceSamples: string[];
  raw: string; // concatenated for prompt inclusion
}

// Unified Paper type (replaces Source + Document)
export interface Paper {
  id: string;
  title: string;
  author: string;
  type: 'article' | 'book' | 'chapter' | 'other';
  fullText: string;
  paragraphs: StructuredParagraph[]; // Pre-segmented for reading view with typography
  identityLayer: IdentityLayer | null;
  color: string;
  createdAt: number;
  updatedAt: number;
  status?: 'processing' | 'ready' | 'error'; // For async upload tracking
}

// Workspace definition
export interface Workspace {
  id: string;
  name: string;
  description?: string;
  paperIds: string[]; // References to papers in the global library
  activePaperId: string | null; // The paper currently being read
  createdAt: number;
  updatedAt: number;
}

// Delete behavior enum for workspace deletion
export type WorkspaceDeleteBehavior = 'orphan' | 'delete';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

// Conversation now scoped to workspace + paper context
export interface Conversation {
  paperId: string; // The commenting paper's ID
  messages: Message[];
}

export interface AgentResponse {
  paperId: string;
  content: string;
  done: boolean;
  replyTo?: string; // ID of comment being replied to (for chain reactions)
}

// For tracking which papers would engage with a paragraph
export interface ParagraphEngagement {
  paragraphIndex: number;
  engagedPaperIds: string[];
}

// Persistent conversation types
export interface SourceResponse {
  sourceId: string;
  content: string;
  timestamp: number;
}

export interface Exchange {
  id: string;
  timestamp: number;
  question?: string;      // User's question (optional for initial comments)
  responses: SourceResponse[];
}

export interface ParagraphConversation {
  paragraphIndex: number;
  paragraphText: string;  // Cache the text for context
  exchanges: Exchange[];
}

// Colors for papers (cycle through these)
export const PAPER_COLORS = [
  '#8b5cf6', // violet
  '#ec4899', // pink
  '#f59e0b', // amber
  '#10b981', // emerald
  '#3b82f6', // blue
  '#ef4444', // red
  '#06b6d4', // cyan
  '#84cc16', // lime
];

// Legacy types for migration support
// @deprecated Use Paper instead
export interface LegacySource {
  id: string;
  title: string;
  author: string;
  type: 'article' | 'book' | 'chapter' | 'other';
  fullText: string;
  identityLayer: IdentityLayer | null;
  color: string;
  createdAt: number;
}

// @deprecated Use Paper instead
export interface LegacyDocument {
  id: string;
  title: string;
  author?: string;
  content: string;
  paragraphs: StructuredParagraph[];
  createdAt: number;
}

// @deprecated Use Conversation instead
export interface LegacyConversation {
  sourceId: string;
  messages: Message[];
}

// Backwards compatibility aliases
export type Source = LegacySource;
export type Document = LegacyDocument;
export const SOURCE_COLORS = PAPER_COLORS;
