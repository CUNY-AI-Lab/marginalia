import { Paper, Workspace, Conversation, WorkspaceDeleteBehavior, Source, Document, LegacyConversation, ParagraphConversation, Exchange, SourceResponse, StructuredParagraph } from './types';

// Storage keys
export const STORAGE_KEYS = {
  PAPERS: 'marginalia:papers',
  WORKSPACES: 'marginalia:workspaces',
  ACTIVE_WORKSPACE: 'marginalia:activeWorkspace',
  CONVERSATIONS: (workspaceId: string, activePaperId: string) =>
    `marginalia:conversations:${workspaceId}:${activePaperId}`,
  PARAGRAPH_CONVERSATIONS: (workspaceId: string, activePaperId: string) =>
    `marginalia:paragraphConversations:${workspaceId}:${activePaperId}`,
  // Legacy keys for migration
  LEGACY_SOURCES: 'marginalia:sources',
  LEGACY_DOCUMENTS: 'marginalia:documents',
  LEGACY_CONVERSATIONS: (docId: string) => `marginalia:conversations:${docId}`,
  MIGRATION_VERSION: 'marginalia:migrationVersion',
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

// removeItem is used implicitly via localStorage.removeItem in cleanupWorkspaceConversations
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function removeItem(key: string): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(key);
}

// ============ Papers (Global Library) ============

export function getPapers(): Paper[] {
  return getItem<Paper[]>(STORAGE_KEYS.PAPERS, []);
}

export function savePapers(papers: Paper[]): void {
  setItem(STORAGE_KEYS.PAPERS, papers);
}

export function addPaper(paper: Paper): void {
  const papers = getPapers();
  papers.push(paper);
  savePapers(papers);
}

export function updatePaper(id: string, updates: Partial<Paper>): void {
  const papers = getPapers();
  const index = papers.findIndex(p => p.id === id);
  if (index !== -1) {
    papers[index] = { ...papers[index], ...updates, updatedAt: Date.now() };
    savePapers(papers);
  }
}

export function deletePaper(id: string): void {
  const papers = getPapers().filter(p => p.id !== id);
  savePapers(papers);
  // Also remove from all workspaces
  const workspaces = getWorkspaces();
  workspaces.forEach(w => {
    if (w.paperIds.includes(id)) {
      w.paperIds = w.paperIds.filter(pid => pid !== id);
      if (w.activePaperId === id) {
        w.activePaperId = w.paperIds[0] || null;
      }
      w.updatedAt = Date.now();
    }
  });
  saveWorkspaces(workspaces);
}

export function getPaperById(id: string): Paper | undefined {
  return getPapers().find(p => p.id === id);
}

// ============ Workspaces ============

export function getWorkspaces(): Workspace[] {
  return getItem<Workspace[]>(STORAGE_KEYS.WORKSPACES, []);
}

export function saveWorkspaces(workspaces: Workspace[]): void {
  setItem(STORAGE_KEYS.WORKSPACES, workspaces);
}

export function addWorkspace(workspace: Workspace): void {
  const workspaces = getWorkspaces();
  workspaces.push(workspace);
  saveWorkspaces(workspaces);
}

export function updateWorkspace(id: string, updates: Partial<Workspace>): void {
  const workspaces = getWorkspaces();
  const index = workspaces.findIndex(w => w.id === id);
  if (index !== -1) {
    workspaces[index] = { ...workspaces[index], ...updates, updatedAt: Date.now() };
    saveWorkspaces(workspaces);
  }
}

export function deleteWorkspace(id: string): void {
  const workspaces = getWorkspaces().filter(w => w.id !== id);
  saveWorkspaces(workspaces);
  cleanupWorkspaceConversations(id);
}

export function getWorkspaceById(id: string): Workspace | undefined {
  return getWorkspaces().find(w => w.id === id);
}

// ============ Active Workspace ============

export function getActiveWorkspaceId(): string | null {
  return getItem<string | null>(STORAGE_KEYS.ACTIVE_WORKSPACE, null);
}

export function setActiveWorkspaceId(id: string | null): void {
  setItem(STORAGE_KEYS.ACTIVE_WORKSPACE, id);
}

// ============ Workspace Paper Management ============

export function addPaperToWorkspace(workspaceId: string, paperId: string): void {
  const workspaces = getWorkspaces();
  const workspace = workspaces.find(w => w.id === workspaceId);
  if (workspace && !workspace.paperIds.includes(paperId)) {
    workspace.paperIds.push(paperId);
    workspace.updatedAt = Date.now();
    saveWorkspaces(workspaces);
  }
}

export function removePaperFromWorkspace(workspaceId: string, paperId: string): void {
  const workspaces = getWorkspaces();
  const workspace = workspaces.find(w => w.id === workspaceId);
  if (workspace) {
    workspace.paperIds = workspace.paperIds.filter(id => id !== paperId);
    if (workspace.activePaperId === paperId) {
      workspace.activePaperId = workspace.paperIds[0] || null;
    }
    workspace.updatedAt = Date.now();
    saveWorkspaces(workspaces);
  }
}

export function setActivePaperInWorkspace(workspaceId: string, paperId: string | null): void {
  const workspaces = getWorkspaces();
  const workspace = workspaces.find(w => w.id === workspaceId);
  if (workspace) {
    workspace.activePaperId = paperId;
    workspace.updatedAt = Date.now();
    saveWorkspaces(workspaces);
  }
}

// ============ Conversations (Workspace-scoped) ============

export function getConversations(workspaceId: string, activePaperId: string): Conversation[] {
  return getItem<Conversation[]>(STORAGE_KEYS.CONVERSATIONS(workspaceId, activePaperId), []);
}

export function saveConversations(
  workspaceId: string,
  activePaperId: string,
  conversations: Conversation[]
): void {
  setItem(STORAGE_KEYS.CONVERSATIONS(workspaceId, activePaperId), conversations);
}

export function addMessageToConversation(
  workspaceId: string,
  activePaperId: string,
  commentingPaperId: string,
  message: { role: 'user' | 'assistant'; content: string }
): void {
  const conversations = getConversations(workspaceId, activePaperId);
  let conversation = conversations.find(c => c.paperId === commentingPaperId);

  if (!conversation) {
    conversation = { paperId: commentingPaperId, messages: [] };
    conversations.push(conversation);
  }

  conversation.messages.push({
    ...message,
    timestamp: Date.now(),
  });

  saveConversations(workspaceId, activePaperId, conversations);
}

function cleanupWorkspaceConversations(workspaceId: string): void {
  if (typeof window === 'undefined') return;
  const prefix = `marginalia:conversations:${workspaceId}:`;
  const paragraphPrefix = `marginalia:paragraphConversations:${workspaceId}:`;
  Object.keys(localStorage)
    .filter(key => key.startsWith(prefix) || key.startsWith(paragraphPrefix))
    .forEach(key => localStorage.removeItem(key));
}

// ============ Paragraph Conversations (New Persistent System) ============

export function getParagraphConversations(
  workspaceId: string,
  activePaperId: string
): ParagraphConversation[] {
  return getItem<ParagraphConversation[]>(
    STORAGE_KEYS.PARAGRAPH_CONVERSATIONS(workspaceId, activePaperId),
    []
  );
}

export function saveParagraphConversations(
  workspaceId: string,
  activePaperId: string,
  conversations: ParagraphConversation[]
): void {
  setItem(STORAGE_KEYS.PARAGRAPH_CONVERSATIONS(workspaceId, activePaperId), conversations);
}

export function getOrCreateParagraphConversation(
  workspaceId: string,
  activePaperId: string,
  paragraphIndex: number,
  paragraphText: string
): { conversations: ParagraphConversation[]; conversation: ParagraphConversation } {
  const conversations = getParagraphConversations(workspaceId, activePaperId);
  let conversation = conversations.find(c => c.paragraphIndex === paragraphIndex);

  if (!conversation) {
    conversation = {
      paragraphIndex,
      paragraphText,
      exchanges: [],
    };
    conversations.push(conversation);
    saveParagraphConversations(workspaceId, activePaperId, conversations);
  }

  return { conversations, conversation };
}

export function addExchangeToParagraph(
  workspaceId: string,
  activePaperId: string,
  paragraphIndex: number,
  paragraphText: string,
  question?: string
): Exchange {
  const { conversations, conversation } = getOrCreateParagraphConversation(
    workspaceId,
    activePaperId,
    paragraphIndex,
    paragraphText
  );

  const exchange: Exchange = {
    id: generateId(),
    timestamp: Date.now(),
    question,
    responses: [],
  };

  conversation.exchanges.push(exchange);
  saveParagraphConversations(workspaceId, activePaperId, conversations);

  return exchange;
}

export function addResponseToExchange(
  workspaceId: string,
  activePaperId: string,
  paragraphIndex: number,
  exchangeId: string,
  response: Omit<SourceResponse, 'timestamp'>
): void {
  const conversations = getParagraphConversations(workspaceId, activePaperId);
  const conversation = conversations.find(c => c.paragraphIndex === paragraphIndex);

  if (!conversation) return;

  const exchange = conversation.exchanges.find(e => e.id === exchangeId);
  if (!exchange) return;

  exchange.responses.push({
    ...response,
    timestamp: Date.now(),
  });

  saveParagraphConversations(workspaceId, activePaperId, conversations);
}

export function getSourceHistoryForParagraph(
  workspaceId: string,
  activePaperId: string,
  paragraphIndex: number,
  sourceId: string
): { question?: string; response: string }[] {
  const conversations = getParagraphConversations(workspaceId, activePaperId);
  const conversation = conversations.find(c => c.paragraphIndex === paragraphIndex);

  if (!conversation) return [];

  const history: { question?: string; response: string }[] = [];

  for (const exchange of conversation.exchanges) {
    const sourceResponse = exchange.responses.find(r => r.sourceId === sourceId);
    if (sourceResponse) {
      history.push({
        question: exchange.question,
        response: sourceResponse.content,
      });
    }
  }

  return history;
}

export function clearParagraphConversation(
  workspaceId: string,
  activePaperId: string,
  paragraphIndex: number
): void {
  const conversations = getParagraphConversations(workspaceId, activePaperId);
  const filtered = conversations.filter(c => c.paragraphIndex !== paragraphIndex);
  saveParagraphConversations(workspaceId, activePaperId, filtered);
}

// ============ Workspace Deletion with Paper Handling ============

export function deleteWorkspaceWithPapers(
  workspaceId: string,
  behavior: WorkspaceDeleteBehavior
): { deletedPaperIds: string[] } {
  const workspace = getWorkspaceById(workspaceId);
  if (!workspace) return { deletedPaperIds: [] };

  let deletedPaperIds: string[] = [];

  if (behavior === 'delete') {
    // Delete papers that are ONLY in this workspace
    const allWorkspaces = getWorkspaces();
    const papersInOtherWorkspaces = new Set<string>();

    allWorkspaces
      .filter(w => w.id !== workspaceId)
      .forEach(w => w.paperIds.forEach(pid => papersInOtherWorkspaces.add(pid)));

    const papersToDelete = workspace.paperIds.filter(pid => !papersInOtherWorkspaces.has(pid));

    // Delete papers not in other workspaces
    const papers = getPapers().filter(p => !papersToDelete.includes(p.id));
    savePapers(papers);
    deletedPaperIds = papersToDelete;
  }

  // Delete the workspace itself
  deleteWorkspace(workspaceId);

  // If deleting active workspace, switch to another
  if (getActiveWorkspaceId() === workspaceId) {
    const remainingWorkspaces = getWorkspaces();
    setActiveWorkspaceId(remainingWorkspaces[0]?.id || null);
  }

  return { deletedPaperIds };
}

// ============ Utilities ============

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Segments text into paragraphs. Returns structured paragraphs if provided,
 * otherwise segments plain text into body paragraphs.
 */
export function segmentIntoParagraphs(text: string): StructuredParagraph[] {
  return text
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 0)
    .map(content => ({ type: 'body' as const, content }));
}

// ============ Legacy Functions (for migration/backwards compatibility) ============

export function getSources(): Source[] {
  return getItem<Source[]>(STORAGE_KEYS.LEGACY_SOURCES, []);
}

export function saveSources(sources: Source[]): void {
  setItem(STORAGE_KEYS.LEGACY_SOURCES, sources);
}

export function getDocuments(): Document[] {
  return getItem<Document[]>(STORAGE_KEYS.LEGACY_DOCUMENTS, []);
}

export function saveDocuments(documents: Document[]): void {
  setItem(STORAGE_KEYS.LEGACY_DOCUMENTS, documents);
}

export function getLegacyConversations(docId: string): LegacyConversation[] {
  return getItem<LegacyConversation[]>(STORAGE_KEYS.LEGACY_CONVERSATIONS(docId), []);
}

// ============ Migration Helpers ============

export function needsMigration(): boolean {
  if (typeof window === 'undefined') return false;
  const version = getItem<number>(STORAGE_KEYS.MIGRATION_VERSION, 0);
  const hasLegacySources = localStorage.getItem(STORAGE_KEYS.LEGACY_SOURCES) !== null;
  const hasLegacyDocs = localStorage.getItem(STORAGE_KEYS.LEGACY_DOCUMENTS) !== null;
  const hasNewData = localStorage.getItem(STORAGE_KEYS.PAPERS) !== null;

  // Need migration if: legacy data exists AND we haven't migrated yet AND no new data
  return (hasLegacySources || hasLegacyDocs) && version < 1 && !hasNewData;
}

export function setMigrationVersion(version: number): void {
  setItem(STORAGE_KEYS.MIGRATION_VERSION, version);
}
