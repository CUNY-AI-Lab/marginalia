import { Paper, Workspace, PAPER_COLORS } from './types';
import {
  savePapers,
  saveWorkspaces,
  getSources,
  getDocuments,
  getLegacyConversations,
  setActiveWorkspaceId,
  setMigrationVersion,
  generateId,
  segmentIntoParagraphs,
  STORAGE_KEYS,
} from './storage';

export interface MigrationResult {
  migratedSources: number;
  migratedDocuments: number;
  createdWorkspaces: number;
  success: boolean;
  error?: string;
}

export function runMigration(): MigrationResult {
  try {
    // Get legacy data
    const legacySources = getSources();
    const legacyDocs = getDocuments();

    // Track ID mappings for conversation migration
    const sourceIdToPaperId = new Map<string, string>();
    const docIdToPaperId = new Map<string, string>();

    // Convert sources to papers
    const papersFromSources: Paper[] = legacySources.map((source, index) => {
      const paper: Paper = {
        id: generateId(),
        title: source.title,
        author: source.author,
        type: source.type,
        fullText: source.fullText,
        paragraphs: segmentIntoParagraphs(source.fullText),
        identityLayer: source.identityLayer,
        color: source.color || PAPER_COLORS[index % PAPER_COLORS.length],
        createdAt: source.createdAt,
        updatedAt: Date.now(),
      };
      sourceIdToPaperId.set(source.id, paper.id);
      return paper;
    });

    // Convert documents to papers
    const papersFromDocs: Paper[] = legacyDocs.map((doc, index) => {
      const paper: Paper = {
        id: generateId(),
        title: doc.title,
        author: doc.author || 'Unknown',
        type: 'other',
        fullText: doc.content,
        paragraphs: doc.paragraphs,
        identityLayer: null,
        color: PAPER_COLORS[(papersFromSources.length + index) % PAPER_COLORS.length],
        createdAt: doc.createdAt,
        updatedAt: Date.now(),
      };
      docIdToPaperId.set(doc.id, paper.id);
      return paper;
    });

    // Combine all papers
    const allPapers = [...papersFromSources, ...papersFromDocs];

    // Create a default workspace with all legacy papers
    const workspaces: Workspace[] = [];

    if (allPapers.length > 0) {
      // Find first document to set as active (maintains old behavior)
      const firstDocPaperId =
        papersFromDocs.length > 0 ? papersFromDocs[0].id : papersFromSources[0]?.id || null;

      const migratedWorkspace: Workspace = {
        id: generateId(),
        name: 'Migrated Workspace',
        description: 'Papers from your previous setup',
        paperIds: allPapers.map(p => p.id),
        activePaperId: firstDocPaperId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      workspaces.push(migratedWorkspace);

      // Migrate conversations
      legacyDocs.forEach(doc => {
        const oldConversations = getLegacyConversations(doc.id);

        if (oldConversations.length > 0) {
          const newActivePaperId = docIdToPaperId.get(doc.id);
          if (newActivePaperId) {
            const newConversations = oldConversations.map(conv => ({
              paperId: sourceIdToPaperId.get(conv.sourceId) || conv.sourceId,
              messages: conv.messages,
            }));

            // Save with new key format
            const newKey = STORAGE_KEYS.CONVERSATIONS(migratedWorkspace.id, newActivePaperId);
            if (typeof window !== 'undefined') {
              localStorage.setItem(newKey, JSON.stringify(newConversations));
            }
          }
        }
      });

      // Set as active workspace
      setActiveWorkspaceId(migratedWorkspace.id);
    }

    // Save migrated data
    savePapers(allPapers);
    saveWorkspaces(workspaces);
    setMigrationVersion(1);

    return {
      migratedSources: papersFromSources.length,
      migratedDocuments: papersFromDocs.length,
      createdWorkspaces: workspaces.length,
      success: true,
    };
  } catch (error) {
    return {
      migratedSources: 0,
      migratedDocuments: 0,
      createdWorkspaces: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// Clean up legacy data after successful migration
export function cleanupLegacyData(): void {
  if (typeof window === 'undefined') return;

  // Remove legacy sources and documents
  localStorage.removeItem(STORAGE_KEYS.LEGACY_SOURCES);
  localStorage.removeItem(STORAGE_KEYS.LEGACY_DOCUMENTS);

  // Remove old conversation keys (marginalia:conversations:docId format)
  Object.keys(localStorage)
    .filter(key => {
      // Match old format: marginalia:conversations:DOCID
      // But not new format: marginalia:conversations:WORKSPACEID:PAPERID
      if (!key.startsWith('marginalia:conversations:')) return false;
      const parts = key.split(':');
      // Old format has 3 parts, new format has 4 parts
      return parts.length === 3;
    })
    .forEach(key => localStorage.removeItem(key));
}
