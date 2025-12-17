'use client';

import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useActiveWorkspaceContext, useParagraphConversations, useScanEngagements } from '@/hooks/useStorage';
import ReadingPane from '@/components/ReadingPane';
import ConversationPanel from '@/components/ConversationPanel';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import MigrationBanner from '@/components/MigrationBanner';
import ShareWorkspaceDialog from '@/components/ShareWorkspaceDialog';
import { ThemeToggle } from '@/components/ThemeToggle';
import Link from 'next/link';

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
        const res = await fetch('/api/prefilter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passage,
            sources: commentingPapers, // API still expects 'sources' field
          }),
        });

        if (!res.ok) throw new Error('Failed to fetch engagement');

        const data = await res.json();
        // Use full engagements if available, fallback to engagedSourceIds for backwards compatibility
        const entries = data.engagements || data.engagedSourceIds?.map((id: string) => ({
          sourceId: id,
          type: 'contextualizes',
          angle: 'has relevant perspective',
        })) || [];
        updateEngagement(paragraphIndex, entries);
      } catch (error) {
        console.error('Error fetching engagement:', error);
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
            const res = await fetch('/api/prefilter', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                passage: para.content,
                sources: commentingPapers,
              }),
            });

            if (res.ok) {
              const data = await res.json();
              // Use full engagements if available, fallback to engagedSourceIds
              const entries = data.engagements || data.engagedSourceIds?.map((id: string) => ({
                sourceId: id,
                type: 'contextualizes',
                angle: 'has relevant perspective',
              })) || [];
              updateEngagement(paragraphIndex, entries);
            }
          } catch (error) {
            console.error(`Error scanning paragraph ${paragraphIndex}:`, error);
          }
        })
      );

      setScanProgress({ current: Math.min(i + batchSize, total), total });
    }

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
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passage: passage,
            sources: commentingPapers, // API still expects 'sources' field
            sourceId: paperId,
            mode: 'brief',
            context: replyToContent,
            question: question,
            conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
            engagement: engagement,
          }),
        });

        if (!res.ok) throw new Error('Failed to fetch response');

        reader = res.body?.getReader();
        if (!reader) throw new Error('No response body');

        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = decoder.decode(value);
          const lines = text.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));

                if (data.type === 'chunk') {
                  finalContent += data.content;
                  setResponses(prev =>
                    prev.map(r =>
                      r.sourceId === data.sourceId && !r.done
                        ? { ...r, content: r.content + data.content }
                        : r
                    )
                  );
                } else if (data.type === 'done') {
                  setResponses(prev =>
                    prev.map(r =>
                      r.sourceId === data.sourceId && !r.done ? { ...r, done: true } : r
                    )
                  );
                  // Save to storage when done - uses captured paragraphIndex, not closure
                  if (exchangeId && finalContent) {
                    addResponseToStorage(paragraphIndex, exchangeId, paperId, finalContent);
                  }
                } else if (data.type === 'error') {
                  setResponses(prev =>
                    prev.map(r =>
                      r.sourceId === data.sourceId && !r.done
                        ? { ...r, content: 'Failed to generate response', done: true }
                        : r
                    )
                  );
                }
              } catch {
                // Ignore parse errors
              }
            }
          }
        }
      } catch (error) {
        console.error('Error generating response:', error);
        setResponses(prev =>
          prev.map(r =>
            r.sourceId === paperId && !r.done
              ? { ...r, content: 'Failed to generate response', done: true }
              : r
          )
        );
      } finally {
        // Always release the reader to prevent memory leaks
        if (reader) {
          try {
            reader.releaseLock();
          } catch {
            // Reader may already be released
          }
        }
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
      <div className="h-screen flex items-center justify-center bg-stone-50 dark:bg-gray-900">
        <div className="animate-spin w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-gray-600 dark:border-t-gray-300 rounded-full" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-stone-50 dark:bg-gray-900">
      <MigrationBanner />

      {/* Header */}
      <header className="flex-shrink-0 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-serif font-medium text-gray-900 dark:text-gray-100">Marginalia</h1>

            <WorkspaceSwitcher
              workspaces={workspaces}
              activeWorkspace={activeWorkspace}
              onSwitch={switchWorkspace}
              onCreate={handleCreateWorkspace}
            />

            {/* Active paper selector (within workspace) */}
            {activeWorkspace && workspacePapers.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400 dark:text-gray-500">Reading:</span>
                <select
                  value={activePaper?.id || ''}
                  onChange={e => handleSetActivePaper(e.target.value)}
                  className="text-sm border border-gray-200 dark:border-gray-600 rounded px-2 py-1 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {!activePaper && <option value="">Select a paper...</option>}
                  {workspacePapers.map(paper => (
                    <option key={paper.id} value={paper.id}>
                      {paper.title}
                    </option>
                  ))}
                </select>
                {/* Scan document button */}
                {activePaper && commentingPapers.length > 0 && (
                  <button
                    onClick={scanDocumentEngagements}
                    disabled={scanningDocument}
                    className="text-xs px-2 py-1 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
                    title="Scan entire document to see which paragraphs have relevant commentary"
                  >
                    {scanningDocument ? (
                      <>
                        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        {scanProgress ? `${scanProgress.current}/${scanProgress.total}` : 'Scanning...'}
                      </>
                    ) : (
                      <>
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        Scan
                      </>
                    )}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <button
              onClick={() => setPanelOpen(!panelOpen)}
              className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              {panelOpen ? 'Hide panel' : 'Show panel'}
            </button>
            {activeWorkspace && workspacePapers.length > 0 && (
              <button
                onClick={() => setShowShareDialog(true)}
                className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 flex items-center gap-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                Share
              </button>
            )}
            <Link href="/library" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
              Library ({commentingPapers.length + (activePaper ? 1 : 0)})
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div ref={containerRef} className="flex-1 flex overflow-hidden">
        {/* Reading pane */}
        <div
          className="flex-1 overflow-y-auto"
          style={{ width: panelOpen ? `${100 - panelWidth}%` : '100%' }}
        >
          <ReadingPane
            document={documentForPane}
            sources={sourcesForComponents}
            selectedParagraph={selectedParagraphIndex}
            engagements={engagements}
            loadingEngagement={loadingEngagement}
            onSelectParagraph={handleSelectParagraph}
            onClickSourceFlag={handleClickSourceFlag}
          />
        </div>

        {/* Resize handle - wider hit area with thin visual line */}
        {panelOpen && (
          <div
            className="w-2 flex-shrink-0 cursor-col-resize group flex items-center justify-center"
            onMouseDown={() => setIsResizing(true)}
          >
            <div className="w-0.5 h-full bg-gray-200 dark:bg-gray-700 group-hover:bg-blue-400 dark:group-hover:bg-blue-500 transition-colors" />
          </div>
        )}

        {/* Conversation panel */}
        {panelOpen && (
          <div
            className="flex-shrink-0 overflow-hidden"
            style={{ width: `${panelWidth}%` }}
          >
            <ConversationPanel
              sources={sourcesForComponents}
              engagedSourceIds={currentEngagedPaperIds}
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

      {/* Empty state - no workspace */}
      {!activeWorkspace && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg">
            <h2 className="text-xl font-serif text-gray-700 dark:text-gray-200 mb-4">Welcome to Marginalia</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
              Create a workspace to organize your papers. Any paper can be the one you&apos;re
              reading, while others provide commentary.
            </p>
            <button
              onClick={() => {
                const name = prompt('Workspace name:');
                if (name) handleCreateWorkspace(name);
              }}
              className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm hover:bg-gray-800 dark:hover:bg-gray-200"
            >
              Create Your First Workspace
            </button>
          </div>
        </div>
      )}

      {/* Empty state - workspace but no papers */}
      {activeWorkspace && workspacePapers.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg">
            <h2 className="text-xl font-serif text-gray-700 dark:text-gray-200 mb-4">
              Workspace: {activeWorkspace.name}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
              This workspace is empty. Add papers from your library to start reading with
              commentary.
            </p>
            <Link
              href="/library"
              className="px-4 py-2 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-md text-sm hover:bg-gray-800 dark:hover:bg-gray-200 inline-block"
            >
              Go to Library
            </Link>
          </div>
        </div>
      )}

      {/* Empty state - papers but none selected */}
      {activeWorkspace && workspacePapers.length > 0 && !activePaper && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="text-center pointer-events-auto bg-white dark:bg-gray-800 p-8 rounded-lg shadow-lg">
            <h2 className="text-xl font-serif text-gray-700 dark:text-gray-200 mb-4">Select a Paper to Read</h2>
            <p className="text-gray-500 dark:text-gray-400 mb-6 max-w-md">
              Choose a paper from the dropdown above to start reading with commentary from other
              papers in this workspace.
            </p>
          </div>
        </div>
      )}

      {/* Share workspace dialog */}
      {activeWorkspace && (
        <ShareWorkspaceDialog
          workspace={activeWorkspace}
          papers={workspacePapers}
          isOpen={showShareDialog}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </div>
  );
}
