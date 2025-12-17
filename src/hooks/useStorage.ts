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
  // Scan engagements
  getScanEngagements as getScanEngagementsStorage,
  saveScanEngagements as saveScanEngagementsStorage,
  updateScanEngagement as updateScanEngagementStorage,
  clearScanEngagements as clearScanEngagementsStorage,
  ScanEngagementsData,
  EngagementEntry,
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

// ============ Scan Engagements Hook (Persistent Heatmap) ============

export function useScanEngagements(workspaceId: string | null, activePaperId: string | null) {
  const [engagements, setEngagements] = useState<Map<number, EngagementEntry[]>>(new Map());

  // Load engagements when workspace/paper changes
  useEffect(() => {
    if (workspaceId && activePaperId) {
      const stored = getScanEngagementsStorage(workspaceId, activePaperId);
      // Convert Record to Map, handling backwards compatibility with old string[] format
      const map = new Map<number, EngagementEntry[]>();
      Object.entries(stored).forEach(([key, value]) => {
        // Handle old format: string[] -> EngagementEntry[]
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
          const migrated = (value as unknown as string[]).map(sourceId => ({
            sourceId,
            type: 'contextualizes' as const,
            angle: 'has relevant perspective',
          }));
          map.set(Number(key), migrated);
        } else {
          map.set(Number(key), value as EngagementEntry[]);
        }
      });
      setEngagements(map);
    } else {
      setEngagements(new Map());
    }
  }, [workspaceId, activePaperId]);

  // Update a single paragraph's engagement
  const updateEngagement = useCallback(
    (paragraphIndex: number, entries: EngagementEntry[]) => {
      if (!workspaceId || !activePaperId) return;

      // Update storage
      updateScanEngagementStorage(workspaceId, activePaperId, paragraphIndex, entries);

      // Update local state
      setEngagements(prev => {
        const next = new Map(prev);
        next.set(paragraphIndex, entries);
        return next;
      });
    },
    [workspaceId, activePaperId]
  );

  // Batch update multiple engagements (for scan completion)
  const setAllEngagements = useCallback(
    (newEngagements: Map<number, EngagementEntry[]>) => {
      if (!workspaceId || !activePaperId) return;

      // Convert Map to Record for storage
      const record: ScanEngagementsData = {};
      newEngagements.forEach((value, key) => {
        record[key] = value;
      });

      saveScanEngagementsStorage(workspaceId, activePaperId, record);
      setEngagements(newEngagements);
    },
    [workspaceId, activePaperId]
  );

  // Clear engagement for a specific paragraph
  const clearEngagement = useCallback(
    (paragraphIndex: number) => {
      if (!workspaceId || !activePaperId) return;

      const stored = getScanEngagementsStorage(workspaceId, activePaperId);
      delete stored[paragraphIndex];
      saveScanEngagementsStorage(workspaceId, activePaperId, stored);

      setEngagements(prev => {
        const next = new Map(prev);
        next.delete(paragraphIndex);
        return next;
      });
    },
    [workspaceId, activePaperId]
  );

  // Clear all engagements
  const clearAllEngagements = useCallback(() => {
    if (!workspaceId || !activePaperId) return;
    clearScanEngagementsStorage(workspaceId, activePaperId);
    setEngagements(new Map());
  }, [workspaceId, activePaperId]);

  // Refresh from storage
  const refresh = useCallback(() => {
    if (workspaceId && activePaperId) {
      const stored = getScanEngagementsStorage(workspaceId, activePaperId);
      const map = new Map<number, EngagementEntry[]>();
      Object.entries(stored).forEach(([key, value]) => {
        // Handle old format: string[] -> EngagementEntry[]
        if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string') {
          const migrated = (value as unknown as string[]).map(sourceId => ({
            sourceId,
            type: 'contextualizes' as const,
            angle: 'has relevant perspective',
          }));
          map.set(Number(key), migrated);
        } else {
          map.set(Number(key), value as EngagementEntry[]);
        }
      });
      setEngagements(map);
    }
  }, [workspaceId, activePaperId]);

  // Helper to get just source IDs (for backwards compatibility)
  const getEngagedSourceIds = useCallback(
    (paragraphIndex: number): string[] => {
      const entries = engagements.get(paragraphIndex) || [];
      return entries.map(e => e.sourceId);
    },
    [engagements]
  );

  // Helper to get engagement info for a specific source
  const getEngagementForSource = useCallback(
    (paragraphIndex: number, sourceId: string): EngagementEntry | undefined => {
      const entries = engagements.get(paragraphIndex) || [];
      return entries.find(e => e.sourceId === sourceId);
    },
    [engagements]
  );

  return {
    engagements,
    updateEngagement,
    setAllEngagements,
    clearEngagement,
    clearAllEngagements,
    refresh,
    getEngagedSourceIds,
    getEngagementForSource,
  };
}

