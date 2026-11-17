'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useActiveWorkspaceContext, useParagraphConversations, useScanEngagements } from '@/hooks/useStorage';
import ReadingPane from '@/components/ReadingPane';
import ConversationPanel from '@/components/ConversationPanel';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import MigrationBanner from '@/components/MigrationBanner';
import ShareWorkspaceDialog from '@/components/ShareWorkspaceDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import QuotaMeter, { notifySpend } from '@/components/QuotaMeter';
import DemoSets from '@/components/DemoSets';
import Link from 'next/link';
import { apiFetch, apiJSON, errorMessage, readEvents } from '@/lib/api';
import { EngagementType } from '@/lib/types';

interface EngagementEntry {
  sourceId: string;
  type: EngagementType;
  angle: string;
}

// Only what the relevance check needs; full texts stay in the browser.
const summarize = (paper: { id: string; title: string; author: string; identityLayer: unknown }) => ({
  id: paper.id,
  title: paper.title,
  author: paper.author,
  identityLayer: paper.identityLayer,
});

interface AgentResponseState {
  sourceId: string;
  content: string;
  done: boolean;
  replyTo?: string;
  question?: string;  // The user's question that prompted this response
}

export default function Home() {
  const {
    activeWorkspace,
    activeWorkspaceId,
    workspacePapers,
    activePaper,
    commentingPapers,
    loading,
    workspaces,
    createWorkspace,
    switchWorkspace,
    setActivePaper,
  } = useActiveWorkspaceContext();

  // Paragraph conversations persistence
  const {
    conversations: savedConversations,
    getConversationForParagraph,
    startExchange,
    addResponse: addResponseToStorage,
    getSourceHistory,
    clearConversation,
  } = useParagraphConversations(activeWorkspaceId, activePaper?.id || null);

  // Persistent scan engagements (heatmap data)
  const {
    engagements,
    updateEngagement,
    clearEngagement,
    getEngagedSourceIds,
    getEngagementForSource,
  } = useScanEngagements(activeWorkspaceId, activePaper?.id || null);

  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null);
  const [responses, setResponses] = useState<AgentResponseState[]>([]);
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [askingSource, setAskingSource] = useState<string | null>(null);
  const [currentExchangeId, setCurrentExchangeId] = useState<string | null>(null);

  // Engagement loading state (non-persistent)
  const [loadingEngagement, setLoadingEngagement] = useState<number | null>(null);
  const [scanningDocument, setScanningDocument] = useState(false);
  const [scanProgress, setScanProgress] = useState<{ current: number; total: number } | null>(null);

  // Share dialog state
  const [showShareDialog, setShowShareDialog] = useState(false);

  // Panel resize state
  const [panelWidth, setPanelWidth] = useState(40); // Default 40%
  const [isResizing, setIsResizing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelWidthRef = useRef(panelWidth); // Track current width for event handlers

  // Keep ref in sync with state
  useEffect(() => {
    panelWidthRef.current = panelWidth;
  }, [panelWidth]);

  // Load saved panel width from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('marginalia:panelWidth');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 20 && parsed <= 60) {
        setPanelWidth(parsed);
      }
    }
  }, []);

  const selectedParagraph =
    activePaper &&
    selectedParagraphIndex !== null &&
    selectedParagraphIndex >= 0 &&
    selectedParagraphIndex < activePaper.paragraphs.length
      ? activePaper.paragraphs[selectedParagraphIndex].content
      : null;

  // Get engaged paper IDs for current paragraph (memoized for stable reference)
  const currentEngagedPaperIds = useMemo(
    () => (selectedParagraphIndex !== null ? getEngagedSourceIds(selectedParagraphIndex) : []),
    [selectedParagraphIndex, getEngagedSourceIds]
  );

  // Reset state when active paper changes
  useEffect(() => {
    setSelectedParagraphIndex(null);
    setResponses([]);
    setAskingSource(null);
    setScanningDocument(false);
    setScanProgress(null);
    // Note: engagements are loaded automatically by useScanEngagements hook
  }, [activePaper?.id]);

  // Merge conversation sources into engagements (so sources that have responded show pips)
  // Note: We intentionally exclude `engagements` from deps to avoid re-running on every engagement change.
  // This effect only needs to run when savedConversations changes.
  useEffect(() => {
    if (savedConversations.length > 0) {
      for (const conv of savedConversations) {
        // Collect unique source IDs that have responded to this paragraph
        const conversationSourceIds: string[] = [];
        for (const exchange of conv.exchanges) {
          for (const resp of exchange.responses) {
            if (!conversationSourceIds.includes(resp.sourceId)) {
              conversationSourceIds.push(resp.sourceId);
            }
          }
        }
        if (conversationSourceIds.length > 0) {
          // Merge with existing engagements from scan
          const existing = engagements.get(conv.paragraphIndex) || [];
          const existingSourceIds = existing.map(e => e.sourceId);

          // Find source IDs that need to be added
          const newSourceIds = conversationSourceIds.filter(id => !existingSourceIds.includes(id));

          // Only update if there are new sources to add
          if (newSourceIds.length > 0) {
            // Create default engagement entries for sources that responded but weren't in prefilter
            const newEntries = newSourceIds.map(id => ({
              sourceId: id,
              type: 'contextualizes' as const, // Default type for sources that responded directly
              angle: 'responded to this passage',
            }));
            updateEngagement(conv.paragraphIndex, [...existing, ...newEntries]);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedConversations, updateEngagement]);

  // Handle panel resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const containerRect = containerRef.current.getBoundingClientRect();
      const newWidth = ((containerRect.right - e.clientX) / containerRect.width) * 100;
      // Clamp between 20% and 60%
      const clampedWidth = Math.min(60, Math.max(20, newWidth));
      setPanelWidth(clampedWidth);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Save current width from ref (avoids stale closure)
      localStorage.setItem('marginalia:panelWidth', Math.round(panelWidthRef.current).toString());
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    // Prevent text selection while dragging
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  // Fetch prefilter to see which papers would engage
  const fetchEngagement = useCallback(
    async (paragraphIndex: number, passage: string, force: boolean = false) => {
      if (commentingPapers.length === 0) return;

      // Skip if we already have engagement data for this paragraph (unless forced)
      if (!force && engagements.has(paragraphIndex)) return;

      setLoadingEngagement(paragraphIndex);

      try {
        const data = await apiJSON<{ engagements: EngagementEntry[] }>('/api/prefilter', {
          passage,
          sources: commentingPapers.map(summarize),
        });
        notifySpend();
        const entries = data.engagements || [];
        updateEngagement(paragraphIndex, entries);
      } catch (error) {
        console.error('Error fetching engagement:', errorMessage(error));
      } finally {
        setLoadingEngagement(null);
      }
    },
    [commentingPapers, engagements, updateEngagement]
  );

  // Scan entire document for engagements (heatmap)
  const scanDocumentEngagements = useCallback(async () => {
    if (!activePaper || commentingPapers.length === 0 || scanningDocument) return;

    setScanningDocument(true);
    const paragraphs = activePaper.paragraphs;
    const total = paragraphs.length;
    setScanProgress({ current: 0, total });

    // Process in batches to avoid overwhelming the server
    const batchSize = 3;
    for (let i = 0; i < paragraphs.length; i += batchSize) {
      const batch = paragraphs.slice(i, Math.min(i + batchSize, paragraphs.length));

      // Process batch in parallel
      await Promise.all(
        batch.map(async (para, batchIdx) => {
          const paragraphIndex = i + batchIdx;
          // Skip headers - they're structural, not content worth commenting on
          if (para.type === 'h1' || para.type === 'h2' || para.type === 'h3') return;
          // Skip if we already have engagement data
          if (engagements.has(paragraphIndex)) return;

          try {
            const data = await apiJSON<{ engagements: EngagementEntry[] }>('/api/prefilter', {
              passage: para.content,
              sources: commentingPapers.map(summarize),
            });
            updateEngagement(paragraphIndex, data.engagements || []);
          } catch (error) {
            console.error(`Error scanning paragraph ${paragraphIndex}:`, errorMessage(error));
          }
        })
      );

      setScanProgress({ current: Math.min(i + batchSize, total), total });
    }
    notifySpend();

    setScanningDocument(false);
    setScanProgress(null);
  }, [activePaper, commentingPapers, engagements, scanningDocument, updateEngagement]);

  // Generate response for a single paper
  // Note: paragraphIndex and passage are passed explicitly to avoid stale closure bugs
  const generateSingleResponse = useCallback(
    async (
      paperId: string,
      paragraphIndex: number,
      passage: string,
      replyToContent?: string,
      question?: string,
      exchangeId?: string
    ) => {
      setLoadingSourceId(paperId);

      // Get conversation history for this source on this paragraph
      const conversationHistory = getSourceHistory(paragraphIndex, paperId);

      // Get engagement info for this source (type and angle)
      const engagementEntry = getEngagementForSource(paragraphIndex, paperId);
      const engagement = engagementEntry ? {
        type: engagementEntry.type,
        angle: engagementEntry.angle,
      } : undefined;

      // Add placeholder for this paper's response
      setResponses(prev => [
        ...prev,
        { sourceId: paperId, content: '', done: false, replyTo: replyToContent, question },
      ]);

      let finalContent = '';
      const source = commentingPapers.find(p => p.id === paperId);
      const fail = (message: string) =>
        setResponses(prev =>
          prev.map(r => (r.sourceId === paperId && !r.done ? { ...r, content: message, done: true } : r))
        );

      try {
        if (!source) throw new Error('Source not found');
        const res = await apiFetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passage,
            source: { ...summarize(source), fullText: source.fullText },
            mode: 'brief',
            context: replyToContent,
            question,
            conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
            engagement,
          }),
        });

        for await (const data of readEvents(res)) {
          if (data.type === 'chunk' && data.content) {
            finalContent += data.content;
            const chunk = data.content;
            setResponses(prev =>
              prev.map(r => (r.sourceId === paperId && !r.done ? { ...r, content: r.content + chunk } : r))
            );
          } else if (data.type === 'done') {
            setResponses(prev => prev.map(r => (r.sourceId === paperId && !r.done ? { ...r, done: true } : r)));
            if (exchangeId && finalContent) {
              addResponseToStorage(paragraphIndex, exchangeId, paperId, finalContent);
            }
          } else if (data.type === 'error') {
            fail(data.error || 'Failed to generate response');
          }
        }
      } catch (error) {
        fail(errorMessage(error, 'Failed to generate response'));
      } finally {
        notifySpend();
        setLoadingSourceId(null);
      }
    },
    [commentingPapers, getSourceHistory, addResponseToStorage, getEngagementForSource]
  );

  // Helper to load existing conversation responses into UI state
  const loadConversationResponses = useCallback(
    (index: number) => {
      const existingConversation = getConversationForParagraph(index);
      if (existingConversation && existingConversation.exchanges.length > 0) {
        const loadedResponses: AgentResponseState[] = [];
        for (const exchange of existingConversation.exchanges) {
          for (const resp of exchange.responses) {
            loadedResponses.push({
              sourceId: resp.sourceId,
              content: resp.content,
              done: true,
              question: exchange.question,
            });
          }
        }
        setResponses(loadedResponses);
      } else {
        setResponses([]);
      }
    },
    [getConversationForParagraph]
  );

  const handleSelectParagraph = useCallback(
    (index: number) => {
      setSelectedParagraphIndex(index);
      setPanelOpen(true);
      setCurrentExchangeId(null);

      loadConversationResponses(index);

      if (activePaper) {
        const para = activePaper.paragraphs[index];
        // Skip engagement check for headers - they're structural, not content
        if (para.type !== 'h1' && para.type !== 'h2' && para.type !== 'h3') {
          fetchEngagement(index, para.content);
        }
      }
    },
    [activePaper, fetchEngagement, loadConversationResponses]
  );

  const handleClickSourceFlag = useCallback(
    (paragraphIndex: number, paperId: string) => {
      setSelectedParagraphIndex(paragraphIndex);
      setPanelOpen(true);

      loadConversationResponses(paragraphIndex);

      if (activePaper) {
        const para = activePaper.paragraphs[paragraphIndex];
        // Skip engagement check for headers
        if (para.type !== 'h1' && para.type !== 'h2' && para.type !== 'h3') {
          fetchEngagement(paragraphIndex, para.content);

          // Create a new exchange for this response
          const exchange = startExchange(paragraphIndex, para.content);
          if (exchange) {
            setCurrentExchangeId(exchange.id);
            // Capture values for async callback to avoid stale closure
            const capturedIndex = paragraphIndex;
            const capturedContent = para.content;
            setTimeout(() => {
              generateSingleResponse(paperId, capturedIndex, capturedContent, undefined, undefined, exchange.id);
            }, 0);
          }
        }
      }
    },
    [activePaper, fetchEngagement, generateSingleResponse, loadConversationResponses, startExchange]
  );

  const handleAsk = useCallback(
    (question: string) => {
      if (!selectedParagraph || selectedParagraphIndex === null) return;

      // Create a new exchange for this question
      const exchange = startExchange(selectedParagraphIndex, selectedParagraph, question);
      if (!exchange) return;

      setCurrentExchangeId(exchange.id);

      // Capture values to avoid stale closure in async operations
      const capturedIndex = selectedParagraphIndex;
      const capturedPassage = selectedParagraph;

      if (askingSource) {
        // Directed mode: ask specific source
        generateSingleResponse(askingSource, capturedIndex, capturedPassage, undefined, question, exchange.id);
        setAskingSource(null); // Clear after asking
      } else {
        // Broadcast mode: ask all engaged sources
        for (const paperId of currentEngagedPaperIds) {
          generateSingleResponse(paperId, capturedIndex, capturedPassage, undefined, question, exchange.id);
        }
      }
    },
    [selectedParagraph, selectedParagraphIndex, currentEngagedPaperIds, askingSource, generateSingleResponse, startExchange]
  );

  // Wrapper for generating responses from the panel (creates exchange if needed)
  const handleGenerateFromPanel = useCallback(
    (paperId: string, replyToContent?: string) => {
      if (!selectedParagraph || selectedParagraphIndex === null) return;

      // Capture values to avoid stale closure
      const capturedIndex = selectedParagraphIndex;
      const capturedPassage = selectedParagraph;

      // Create a new exchange if we don't have one
      let exchangeId = currentExchangeId;
      if (!exchangeId) {
        const exchange = startExchange(capturedIndex, capturedPassage);
        if (exchange) {
          exchangeId = exchange.id;
          setCurrentExchangeId(exchangeId);
        }
      }

      generateSingleResponse(paperId, capturedIndex, capturedPassage, replyToContent, undefined, exchangeId || undefined);
    },
    [selectedParagraph, selectedParagraphIndex, currentExchangeId, startExchange, generateSingleResponse]
  );

  // Clear commentaries and re-run prefilter
  const handleClearAndRefresh = useCallback(() => {
    if (selectedParagraphIndex === null || !activePaper) return;

    // Clear saved conversation
    clearConversation(selectedParagraphIndex);

    // Clear UI responses
    setResponses([]);
    setCurrentExchangeId(null);

    // Remove engagement for this paragraph
    clearEngagement(selectedParagraphIndex);

    // Re-run prefilter (force=true to bypass cache check)
    const passage = activePaper.paragraphs[selectedParagraphIndex].content;
    fetchEngagement(selectedParagraphIndex, passage, true);
  }, [selectedParagraphIndex, activePaper, clearConversation, fetchEngagement, clearEngagement]);

  const handleCreateWorkspace = useCallback(
    (name: string) => {
      const ws = createWorkspace(name);
      switchWorkspace(ws.id);
    },
    [createWorkspace, switchWorkspace]
  );

  const handleSetActivePaper = useCallback(
    (paperId: string) => {
      if (activeWorkspaceId) {
        setActivePaper(activeWorkspaceId, paperId);
      }
    },
    [activeWorkspaceId, setActivePaper]
  );

  // Convert Paper to the format ReadingPane expects (Document-like)
  const documentForPane = activePaper
    ? {
        id: activePaper.id,
        title: activePaper.title,
        author: activePaper.author,
        content: activePaper.fullText,
        paragraphs: activePaper.paragraphs,
        createdAt: activePaper.createdAt,
      }
    : null;

  // Convert Papers to Sources format for components (they have same shape)
  const sourcesForComponents = commentingPapers as unknown as import('@/lib/types').Source[];

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 dark:border-gray-700 border-t-blue-600 dark:border-t-blue-400 rounded-full" />
      </div>
    );
  }

  const newWorkspace = () => {
    const name = prompt('Name the new workspace:');
    if (name?.trim()) handleCreateWorkspace(name.trim());
  };

  // First visit, or no workspace chosen: a landing page rather than an empty reader.
  if (!activeWorkspace) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
        <MigrationBanner />
        <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
          <div className="max-w-6xl mx-auto h-14 px-4 sm:px-6 flex items-center gap-4">
            <span className="font-display text-xl font-semibold text-gray-900 dark:text-gray-50">Marginalia</span>
            <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400">CUNY AI Lab</span>
            <div className="ml-auto flex items-center gap-3">
              <QuotaMeter />
              <ThemeToggle />
              <Link href="/library" className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">Library</Link>
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <div className="max-w-2xl">
            <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight text-gray-900 dark:text-gray-50">
              Read with your sources in the margins.
            </h1>
            <p className="mt-4 text-lg text-gray-600 dark:text-gray-300 leading-relaxed">
              Open one text and select a passage. The other texts in your workspace say whether they
              agree, push back or add context, each from its own position and in its own words.
            </p>
          </div>
          <div className="mt-10">
            <DemoSets />
          </div>
          <div className="mt-10 pt-8 border-t border-gray-200 dark:border-gray-800 flex flex-wrap items-center gap-4">
            <button
              onClick={newWorkspace}
              className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
            >
              Start with your own texts
            </button>
            {workspaces.length > 0 && (
              <WorkspaceSwitcher workspaces={workspaces} activeWorkspace={activeWorkspace} onSwitch={switchWorkspace} onCreate={handleCreateWorkspace} />
            )}
            <p className="text-sm text-gray-500 dark:text-gray-400">
              PDFs and text files stay in this browser. Comments use your CUNY AI Lab model allowance.
            </p>
          </div>
        </main>
      </div>
    );
  }

  const selectedEngagements = selectedParagraphIndex !== null ? engagements.get(selectedParagraphIndex) || [] : [];

  return (
    <div className="h-screen flex flex-col bg-gray-50 dark:bg-gray-950">
      <MigrationBanner />

      <header className="flex-shrink-0 h-14 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="h-full flex items-center gap-2 sm:gap-3 px-3 sm:px-4 min-w-0">
          <Link href="/" className="font-display text-xl font-semibold text-gray-900 dark:text-gray-50 flex-shrink-0">
            Marginalia
          </Link>
          <span className="hidden sm:block h-5 w-px bg-gray-200 dark:bg-gray-700 flex-shrink-0" aria-hidden="true" />
          <div className="min-w-0 max-w-[16rem] flex-shrink">
            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onSwitch={switchWorkspace}
              onCreate={handleCreateWorkspace}
            />
          </div>

          {workspacePapers.length > 0 && (
            <div className="hidden md:flex items-center gap-2 min-w-0 flex-shrink">
              <label htmlFor="reading-select" className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400 flex-shrink-0">
                Reading
              </label>
              <select
                id="reading-select"
                value={activePaper?.id || ''}
                onChange={e => handleSetActivePaper(e.target.value)}
                className="min-w-0 max-w-[22rem] truncate text-sm rounded-md border border-gray-200 dark:border-gray-700 pl-2 pr-7 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-600/15"
              >
                {!activePaper && <option value="">Choose a text…</option>}
                {workspacePapers.map(paper => (
                  <option key={paper.id} value={paper.id}>
                    {paper.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {activePaper && commentingPapers.length > 0 && (
            <button
              onClick={scanDocumentEngagements}
              disabled={scanningDocument}
              className="hidden lg:inline-flex flex-shrink-0 items-center gap-1.5 text-sm px-2.5 py-1.5 rounded-md text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30 disabled:opacity-60 disabled:cursor-wait"
              title="Mark every paragraph that your sources would respond to (uses your allowance)"
            >
              <svg className={`w-4 h-4 ${scanningDocument ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                {scanningDocument ? (
                  <path strokeLinecap="round" strokeWidth={2} d="M12 3a9 9 0 109 9" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z" />
                )}
              </svg>
              {scanningDocument ? (scanProgress ? `Scanning ${scanProgress.current}/${scanProgress.total}` : 'Scanning…') : 'Scan text'}
            </button>
          )}

          <div className="ml-auto flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <QuotaMeter />
            <ThemeToggle />
            {workspacePapers.length > 0 && (
              <button
                onClick={() => setShowShareDialog(true)}
                className="inline-flex items-center gap-1.5 text-sm px-2 py-1.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
                title="Share this workspace"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="hidden xl:inline">Share</span>
              </button>
            )}
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="inline-flex items-center text-sm px-2 py-1.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800"
              title={panelOpen ? 'Hide the margins' : 'Show the margins'}
              aria-pressed={panelOpen}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <rect x="3" y="4" width="18" height="16" rx="2" strokeWidth={2} />
                <path strokeWidth={2} d="M15 4v16" />
              </svg>
              <span className="sr-only">{panelOpen ? 'Hide the margins' : 'Show the margins'}</span>
            </button>
            <Link
              href="/library"
              className="text-sm px-2.5 py-1.5 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-300 dark:hover:text-white dark:hover:bg-gray-800 whitespace-nowrap"
            >
              Library
            </Link>
          </div>
        </div>
      </header>

      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        <div className="flex-1 overflow-y-auto bg-paper" style={{ width: panelOpen ? `${100 - panelWidth}%` : '100%' }}>
          {workspacePapers.length === 0 ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="max-w-md text-center">
                <h2 className="font-display text-2xl font-semibold text-gray-900 dark:text-gray-50">{activeWorkspace.name} is empty</h2>
                <p className="mt-3 text-gray-600 dark:text-gray-300">
                  Add two or more texts from your library: one to read, and others to comment on it.
                </p>
                <Link
                  href="/library"
                  className="mt-6 inline-block px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-400"
                >
                  Add texts from the library
                </Link>
              </div>
            </div>
          ) : !activePaper ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="max-w-md">
                <h2 className="font-display text-2xl font-semibold text-gray-900 dark:text-gray-50 text-center">Which text will you read?</h2>
                <ul className="mt-6 space-y-2">
                  {workspacePapers.map(paper => (
                    <li key={paper.id}>
                      <button
                        onClick={() => handleSetActivePaper(paper.id)}
                        className="w-full text-left px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 hover:border-blue-600 dark:hover:border-blue-400"
                      >
                        <span className="block font-medium text-gray-900 dark:text-gray-100">{paper.title}</span>
                        <span className="block text-sm text-gray-500 dark:text-gray-400">{paper.author}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <ReadingPane
              document={documentForPane}
              sources={sourcesForComponents}
              selectedParagraph={selectedParagraphIndex}
              engagements={engagements}
              loadingEngagement={loadingEngagement}
              onSelectParagraph={handleSelectParagraph}
              onClickSourceFlag={handleClickSourceFlag}
            />
          )}
        </div>

        {panelOpen && (
          <div
            className="w-1.5 flex-shrink-0 cursor-col-resize group flex items-center justify-center bg-white dark:bg-gray-900"
            onMouseDown={() => setIsResizing(true)}
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize the margins"
          >
            <div className="w-px h-full bg-gray-200 dark:bg-gray-800 group-hover:bg-blue-500 transition-colors" />
          </div>
        )}

        {panelOpen && (
          <div className="flex-shrink-0 overflow-hidden" style={{ width: `${panelWidth}%` }}>
            <ConversationPanel
              sources={sourcesForComponents}
              engagedSourceIds={currentEngagedPaperIds}
              engagements={selectedEngagements}
              checkingRelevance={loadingEngagement !== null && loadingEngagement === selectedParagraphIndex}
              responses={responses}
              loadingSourceId={loadingSourceId}
              selectedParagraph={selectedParagraph}
              askingSource={askingSource}
              onSetAskingSource={setAskingSource}
              onGenerateResponse={handleGenerateFromPanel}
              onAsk={handleAsk}
              onClearAndRefresh={handleClearAndRefresh}
            />
          </div>
        )}
      </div>

      <ShareWorkspaceDialog
        workspace={activeWorkspace}
        papers={workspacePapers}
        isOpen={showShareDialog}
        onClose={() => setShowShareDialog(false)}
      />
    </div>
  );
}
