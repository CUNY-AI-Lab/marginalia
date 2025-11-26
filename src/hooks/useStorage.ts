'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getPapers,
  savePapers,
  getWorkspaces,
  saveWorkspaces,
  getActiveWorkspaceId,
  setActiveWorkspaceId as setActiveWorkspaceIdStorage,
  getConversations as getConversationsStorage,
  saveConversations as saveConversationsStorage,
  addPaperToWorkspace as addPaperToWorkspaceStorage,
  removePaperFromWorkspace as removePaperFromWorkspaceStorage,
  setActivePaperInWorkspace as setActivePaperInWorkspaceStorage,
  deleteWorkspaceWithPapers,
  generateId,
  segmentIntoParagraphs,
  // Paragraph conversations
  getParagraphConversations as getParagraphConversationsStorage,
  addExchangeToParagraph as addExchangeToParagraphStorage,
  addResponseToExchange as addResponseToExchangeStorage,
  getSourceHistoryForParagraph as getSourceHistoryForParagraphStorage,
  clearParagraphConversation as clearParagraphConversationStorage,
  // Legacy
  getSources,
  saveSources,
  getDocuments,
  saveDocuments,
} from '@/lib/storage';
import {
  Paper,
  Workspace,
  Conversation,
  WorkspaceDeleteBehavior,
  PAPER_COLORS,
  ParagraphConversation,
  Exchange,
  StructuredParagraph,
  // Legacy
  Source,
  Document,
  SOURCE_COLORS,
} from '@/lib/types';

// ============ Papers Hook ============

export function usePapers() {
  const [papers, setPapers] = useState<Paper[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setPapers(getPapers());
    setLoading(false);
  }, []);

  const addPaper = useCallback(
    (paper: Omit<Paper, 'id' | 'createdAt' | 'updatedAt' | 'color' | 'paragraphs'> & { paragraphs?: StructuredParagraph[] }) => {
      const currentPapers = getPapers();
      const newPaper: Paper = {
        ...paper,
        id: generateId(),
        // Use provided structured paragraphs or segment from fullText
        paragraphs: paper.paragraphs || segmentIntoParagraphs(paper.fullText),
        color: PAPER_COLORS[currentPapers.length % PAPER_COLORS.length],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updated = [...currentPapers, newPaper];
      savePapers(updated);
      setPapers(updated);
      return newPaper;
    },
    []
  );

  const updatePaper = useCallback((id: string, updates: Partial<Paper>) => {
    const currentPapers = getPapers();
    const updated = currentPapers.map(p => {
      if (p.id !== id) return p;
      const newPaper = { ...p, ...updates, updatedAt: Date.now() };
      if (updates.fullText) {
        newPaper.paragraphs = segmentIntoParagraphs(updates.fullText);
      }
      return newPaper;
    });
    savePapers(updated);
    setPapers(updated);
  }, []);

  const deletePaper = useCallback((id: string) => {
    const currentPapers = getPapers();
    const updated = currentPapers.filter(p => p.id !== id);
    savePapers(updated);
    setPapers(updated);
    // Also remove from all workspaces
    const workspaces = getWorkspaces();
    workspaces.forEach(w => {
      if (w.paperIds.includes(id)) {
        removePaperFromWorkspaceStorage(w.id, id);
      }
    });
  }, []);

  const refresh = useCallback(() => {
    setPapers(getPapers());
  }, []);

  return { papers, loading, addPaper, updatePaper, deletePaper, refresh };
}

// ============ Workspaces Hook ============

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWorkspaceId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setWorkspaces(getWorkspaces());
    setActiveId(getActiveWorkspaceId());
    setLoading(false);
  }, []);

  const activeWorkspace = activeWorkspaceId
    ? workspaces.find(w => w.id === activeWorkspaceId) || null
    : null;

  const createWorkspace = useCallback((name: string, description?: string): Workspace => {
    const currentWorkspaces = getWorkspaces();
    const newWorkspace: Workspace = {
      id: generateId(),
      name,
      description,
      paperIds: [],
      activePaperId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const updated = [...currentWorkspaces, newWorkspace];
    saveWorkspaces(updated);
    setWorkspaces(updated);
    return newWorkspace;
  }, []);

  const updateWorkspace = useCallback((id: string, updates: Partial<Workspace>) => {
    const currentWorkspaces = getWorkspaces();
    const updated = currentWorkspaces.map(w =>
      w.id === id ? { ...w, ...updates, updatedAt: Date.now() } : w
    );
    saveWorkspaces(updated);
    setWorkspaces(updated);
  }, []);

  const deleteWorkspace = useCallback(
    (id: string, behavior: WorkspaceDeleteBehavior = 'orphan') => {
      const result = deleteWorkspaceWithPapers(id, behavior);
      setWorkspaces(getWorkspaces());
      // Update active workspace if needed
      if (activeWorkspaceId === id) {
        const remaining = getWorkspaces();
        const newActiveId = remaining[0]?.id || null;
        setActiveWorkspaceIdStorage(newActiveId);
        setActiveId(newActiveId);
      }
      return result;
    },
    [activeWorkspaceId]
  );

  const switchWorkspace = useCallback((id: string | null) => {
    setActiveWorkspaceIdStorage(id);
    setActiveId(id);
  }, []);

  const addPaperToWorkspace = useCallback((workspaceId: string, paperId: string) => {
    addPaperToWorkspaceStorage(workspaceId, paperId);
    setWorkspaces(getWorkspaces());
  }, []);

  const removePaperFromWorkspace = useCallback((workspaceId: string, paperId: string) => {
    removePaperFromWorkspaceStorage(workspaceId, paperId);
    setWorkspaces(getWorkspaces());
  }, []);

  const setActivePaper = useCallback((workspaceId: string, paperId: string | null) => {
    setActivePaperInWorkspaceStorage(workspaceId, paperId);
    setWorkspaces(getWorkspaces());
  }, []);

  const refresh = useCallback(() => {
    setWorkspaces(getWorkspaces());
    setActiveId(getActiveWorkspaceId());
  }, []);

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    loading,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    switchWorkspace,
    addPaperToWorkspace,
    removePaperFromWorkspace,
    setActivePaper,
    refresh,
  };
}

// ============ Active Workspace Context Hook ============

export function useActiveWorkspaceContext() {
  const {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    loading: workspacesLoading,
    ...workspaceActions
  } = useWorkspaces();
  const { papers, loading: papersLoading } = usePapers();

  // Get papers in current workspace
  const workspacePapers = activeWorkspace
    ? activeWorkspace.paperIds
        .map(id => papers.find(p => p.id === id))
        .filter((p): p is Paper => p !== undefined)
    : [];

  // Get the active paper (the one being read)
  const activePaper = activeWorkspace?.activePaperId
    ? papers.find(p => p.id === activeWorkspace.activePaperId) || null
    : null;

  // Get commenting papers (all workspace papers except the active one)
  const commentingPapers = workspacePapers.filter(p => p.id !== activePaper?.id);

  // Papers not in current workspace (for the "add paper" UI)
  const availablePapers = papers.filter(p => !activeWorkspace?.paperIds.includes(p.id));

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    workspacePapers,
    activePaper,
    commentingPapers,
    availablePapers,
    allPapers: papers,
    loading: workspacesLoading || papersLoading,
    ...workspaceActions,
  };
}

// ============ Conversations Hook (Workspace-scoped) ============

export function useConversations(workspaceId: string | null, activePaperId: string | null) {
  const [conversations, setConversations] = useState<Conversation[]>([]);

  useEffect(() => {
    if (workspaceId && activePaperId) {
      setConversations(getConversationsStorage(workspaceId, activePaperId));
    } else {
      setConversations([]);
    }
  }, [workspaceId, activePaperId]);

  const addMessage = useCallback(
    (commentingPaperId: string, message: { role: 'user' | 'assistant'; content: string }) => {
      if (!workspaceId || !activePaperId) return;

      const current = getConversationsStorage(workspaceId, activePaperId);
      let conversation = current.find(c => c.paperId === commentingPaperId);

      if (!conversation) {
        conversation = { paperId: commentingPaperId, messages: [] };
        current.push(conversation);
      }

      conversation.messages.push({
        ...message,
        timestamp: Date.now(),
      });

      saveConversationsStorage(workspaceId, activePaperId, current);
      setConversations([...current]);
    },
    [workspaceId, activePaperId]
  );

  const clearConversations = useCallback(() => {
    if (!workspaceId || !activePaperId) return;
    saveConversationsStorage(workspaceId, activePaperId, []);
    setConversations([]);
  }, [workspaceId, activePaperId]);

  return { conversations, addMessage, clearConversations };
}

// ============ Paragraph Conversations Hook (New Persistent System) ============

export function useParagraphConversations(workspaceId: string | null, activePaperId: string | null) {
  const [conversations, setConversations] = useState<ParagraphConversation[]>([]);

  // Load conversations when workspace/paper changes
  useEffect(() => {
    if (workspaceId && activePaperId) {
      setConversations(getParagraphConversationsStorage(workspaceId, activePaperId));
    } else {
      setConversations([]);
    }
  }, [workspaceId, activePaperId]);

  // Get conversation for a specific paragraph
  const getConversationForParagraph = useCallback(
    (paragraphIndex: number): ParagraphConversation | undefined => {
      return conversations.find(c => c.paragraphIndex === paragraphIndex);
    },
    [conversations]
  );

  // Start a new exchange (optionally with a question)
  const startExchange = useCallback(
    (paragraphIndex: number, paragraphText: string, question?: string): Exchange | null => {
      if (!workspaceId || !activePaperId) return null;

      const exchange = addExchangeToParagraphStorage(
        workspaceId,
        activePaperId,
        paragraphIndex,
        paragraphText,
        question
      );

      // Refresh local state
      setConversations(getParagraphConversationsStorage(workspaceId, activePaperId));

      return exchange;
    },
    [workspaceId, activePaperId]
  );

  // Add a response to an existing exchange
  const addResponse = useCallback(
    (paragraphIndex: number, exchangeId: string, sourceId: string, content: string): void => {
      if (!workspaceId || !activePaperId) return;

      addResponseToExchangeStorage(
        workspaceId,
        activePaperId,
        paragraphIndex,
        exchangeId,
        { sourceId, content }
      );

      // Refresh local state
      setConversations(getParagraphConversationsStorage(workspaceId, activePaperId));
    },
    [workspaceId, activePaperId]
  );

  // Get history for a specific source on a specific paragraph
  const getSourceHistory = useCallback(
    (paragraphIndex: number, sourceId: string): { question?: string; response: string }[] => {
      if (!workspaceId || !activePaperId) return [];

      return getSourceHistoryForParagraphStorage(
        workspaceId,
        activePaperId,
        paragraphIndex,
        sourceId
      );
    },
    [workspaceId, activePaperId]
  );

  // Clear conversation for a paragraph
  const clearConversation = useCallback(
    (paragraphIndex: number): void => {
      if (!workspaceId || !activePaperId) return;

      clearParagraphConversationStorage(workspaceId, activePaperId, paragraphIndex);

      // Refresh local state
      setConversations(getParagraphConversationsStorage(workspaceId, activePaperId));
    },
    [workspaceId, activePaperId]
  );

  // Refresh from storage
  const refresh = useCallback(() => {
    if (workspaceId && activePaperId) {
      setConversations(getParagraphConversationsStorage(workspaceId, activePaperId));
    }
  }, [workspaceId, activePaperId]);

  return {
    conversations,
    getConversationForParagraph,
    startExchange,
    addResponse,
    getSourceHistory,
    clearConversation,
    refresh,
  };
}

// ============ Legacy Hooks (for backwards compatibility) ============

export function useSources() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setSources(getSources());
    setLoading(false);
  }, []);

  const addSource = useCallback((source: Omit<Source, 'id' | 'createdAt' | 'color'>) => {
    const currentSources = getSources();
    const newSource: Source = {
      ...source,
      id: generateId(),
      color: SOURCE_COLORS[currentSources.length % SOURCE_COLORS.length],
      createdAt: Date.now(),
    };
    const updated = [...currentSources, newSource];
    saveSources(updated);
    setSources(updated);
    return newSource;
  }, []);

  const updateSource = useCallback((id: string, updates: Partial<Source>) => {
    const currentSources = getSources();
    const updated = currentSources.map(s => (s.id === id ? { ...s, ...updates } : s));
    saveSources(updated);
    setSources(updated);
  }, []);

  const deleteSource = useCallback((id: string) => {
    const currentSources = getSources();
    const updated = currentSources.filter(s => s.id !== id);
    saveSources(updated);
    setSources(updated);
  }, []);

  const refresh = useCallback(() => {
    setSources(getSources());
  }, []);

  return { sources, loading, addSource, updateSource, deleteSource, refresh };
}

export function useDocuments() {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setDocuments(getDocuments());
    setLoading(false);
  }, []);

  const addDocument = useCallback((doc: Omit<Document, 'id' | 'createdAt' | 'paragraphs'>) => {
    const currentDocs = getDocuments();
    const newDoc: Document = {
      ...doc,
      id: generateId(),
      paragraphs: segmentIntoParagraphs(doc.content),
      createdAt: Date.now(),
    };
    const updated = [...currentDocs, newDoc];
    saveDocuments(updated);
    setDocuments(updated);
    return newDoc;
  }, []);

  const updateDocument = useCallback((id: string, updates: Partial<Document>) => {
    const currentDocs = getDocuments();
    const updated = currentDocs.map(d => {
      if (d.id !== id) return d;
      const newDoc = { ...d, ...updates };
      if (updates.content) {
        newDoc.paragraphs = segmentIntoParagraphs(updates.content);
      }
      return newDoc;
    });
    saveDocuments(updated);
    setDocuments(updated);
  }, []);

  const deleteDocument = useCallback((id: string) => {
    const currentDocs = getDocuments();
    const updated = currentDocs.filter(d => d.id !== id);
    saveDocuments(updated);
    setDocuments(updated);
  }, []);

  const refresh = useCallback(() => {
    setDocuments(getDocuments());
  }, []);

  return { documents, loading, addDocument, updateDocument, deleteDocument, refresh };
}
