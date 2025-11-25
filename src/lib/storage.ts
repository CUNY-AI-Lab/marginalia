import { Source, Document, Conversation } from './types';

const STORAGE_KEYS = {
  SOURCES: 'marginalia:sources',
  DOCUMENTS: 'marginalia:documents',
  CONVERSATIONS: (docId: string) => `marginalia:conversations:${docId}`,
};

// Generic storage helpers
function getItem<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(value));
}

// Sources
export function getSources(): Source[] {
  return getItem<Source[]>(STORAGE_KEYS.SOURCES, []);
}

export function saveSources(sources: Source[]): void {
  setItem(STORAGE_KEYS.SOURCES, sources);
}

export function addSource(source: Source): void {
  const sources = getSources();
  sources.push(source);
  saveSources(sources);
}

export function updateSource(id: string, updates: Partial<Source>): void {
  const sources = getSources();
  const index = sources.findIndex(s => s.id === id);
  if (index !== -1) {
    sources[index] = { ...sources[index], ...updates };
    saveSources(sources);
  }
}

export function deleteSource(id: string): void {
  const sources = getSources().filter(s => s.id !== id);
  saveSources(sources);
}

// Documents
export function getDocuments(): Document[] {
  return getItem<Document[]>(STORAGE_KEYS.DOCUMENTS, []);
}

export function saveDocuments(documents: Document[]): void {
  setItem(STORAGE_KEYS.DOCUMENTS, documents);
}

export function addDocument(document: Document): void {
  const documents = getDocuments();
  documents.push(document);
  saveDocuments(documents);
}

export function updateDocument(id: string, updates: Partial<Document>): void {
  const documents = getDocuments();
  const index = documents.findIndex(d => d.id === id);
  if (index !== -1) {
    documents[index] = { ...documents[index], ...updates };
    saveDocuments(documents);
  }
}

export function deleteDocument(id: string): void {
  const documents = getDocuments().filter(d => d.id !== id);
  saveDocuments(documents);
  // Also clean up conversations for this document
  if (typeof window !== 'undefined') {
    localStorage.removeItem(STORAGE_KEYS.CONVERSATIONS(id));
  }
}

// Conversations (per document)
export function getConversations(docId: string): Conversation[] {
  return getItem<Conversation[]>(STORAGE_KEYS.CONVERSATIONS(docId), []);
}

export function saveConversations(docId: string, conversations: Conversation[]): void {
  setItem(STORAGE_KEYS.CONVERSATIONS(docId), conversations);
}

export function addMessageToConversation(
  docId: string,
  sourceId: string,
  message: { role: 'user' | 'assistant'; content: string }
): void {
  const conversations = getConversations(docId);
  let conversation = conversations.find(c => c.sourceId === sourceId);

  if (!conversation) {
    conversation = { sourceId, messages: [] };
    conversations.push(conversation);
  }

  conversation.messages.push({
    ...message,
    timestamp: Date.now(),
  });

  saveConversations(docId, conversations);
}

// Generate unique ID
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Segment text into paragraphs
export function segmentIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0);
}
