'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useActiveWorkspaceContext, usePapers, useParagraphConversations } from '@/hooks/useStorage';
import ReadingPane from '@/components/ReadingPane';
import ConversationPanel from '@/components/ConversationPanel';
import WorkspaceSwitcher from '@/components/WorkspaceSwitcher';
import MigrationBanner from '@/components/MigrationBanner';
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

  const { deletePaper } = usePapers();

  // Paragraph conversations persistence
  const {
    conversations: savedConversations,
    getConversationForParagraph,
    startExchange,
    addResponse: addResponseToStorage,
    getSourceHistory,
    clearConversation,
  } = useParagraphConversations(activeWorkspaceId, activePaper?.id || null);

  const [selectedParagraphIndex, setSelectedParagraphIndex] = useState<number | null>(null);
  const [responses, setResponses] = useState<AgentResponseState[]>([]);
  const [loadingSourceId, setLoadingSourceId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [askingSource, setAskingSource] = useState<string | null>(null);
  const [currentExchangeId, setCurrentExchangeId] = useState<string | null>(null);

  // Engagement tracking: which papers have something to say per paragraph
  const [engagements, setEngagements] = useState<Map<number, string[]>>(new Map());
  const [loadingEngagement, setLoadingEngagement] = useState<number | null>(null);

  const selectedParagraph =
    activePaper && selectedParagraphIndex !== null
      ? activePaper.paragraphs[selectedParagraphIndex].content
      : null;

  // Get engaged paper IDs for current paragraph (memoized for stable reference)
  const currentEngagedPaperIds = useMemo(
    () => (selectedParagraphIndex !== null ? engagements.get(selectedParagraphIndex) || [] : []),
    [selectedParagraphIndex, engagements]
  );

  // Reset state when active paper changes
  useEffect(() => {
    setSelectedParagraphIndex(null);
    setResponses([]);
    setEngagements(new Map());
    setAskingSource(null);
  }, [activePaper?.id]);

  // Initialize engagements from saved conversations (so pips persist after refresh)
  useEffect(() => {
    if (savedConversations.length > 0) {
      const newEngagements = new Map<number, string[]>();
      for (const conv of savedConversations) {
        // Collect unique source IDs that have responded to this paragraph
        const sourceIds: string[] = [];
        for (const exchange of conv.exchanges) {
          for (const resp of exchange.responses) {
            if (!sourceIds.includes(resp.sourceId)) {
              sourceIds.push(resp.sourceId);
            }
          }
        }
        if (sourceIds.length > 0) {
          // Merge with existing engagements (from prefilter) rather than replacing
          const existing = newEngagements.get(conv.paragraphIndex) || [];
          const merged = [...existing, ...sourceIds].filter(
            (id, idx, arr) => arr.indexOf(id) === idx
          );
          newEngagements.set(conv.paragraphIndex, merged);
        }
      }
      setEngagements(prev => {
        // Merge saved conversation sources with any prefilter results
        const merged = new Map(prev);
        Array.from(newEngagements.entries()).forEach(([idx, sourceIds]) => {
          const existing = merged.get(idx) || [];
          const combined = [...existing, ...sourceIds].filter(
            (id, i, arr) => arr.indexOf(id) === i
          );
          merged.set(idx, combined);
        });
        return merged;
      });
    }
  }, [savedConversations]);

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
        setEngagements(prev => {
          const next = new Map(prev);
          next.set(paragraphIndex, data.engagedSourceIds || []);
          return next;
        });
      } catch (error) {
        console.error('Error fetching engagement:', error);
      } finally {
        setLoadingEngagement(null);
      }
    },
    [commentingPapers, engagements]
  );

  // Generate response for a single paper
  const generateSingleResponse = useCallback(
    async (paperId: string, replyToContent?: string, question?: string, exchangeId?: string) => {
      if (!selectedParagraph || !activePaper || selectedParagraphIndex === null) return;

      setLoadingSourceId(paperId);

      // Get conversation history for this source on this paragraph
      const conversationHistory = getSourceHistory(selectedParagraphIndex, paperId);

      // Add placeholder for this paper's response
      setResponses(prev => [
        ...prev,
        { sourceId: paperId, content: '', done: false, replyTo: replyToContent, question },
      ]);

      let finalContent = '';

      try {
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            passage: selectedParagraph,
            sources: commentingPapers, // API still expects 'sources' field
            sourceId: paperId,
            mode: 'brief',
            context: replyToContent,
            question: question,
            conversationHistory: conversationHistory.length > 0 ? conversationHistory : undefined,
          }),
        });

        if (!res.ok) throw new Error('Failed to fetch response');

        const reader = res.body?.getReader();
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
                  // Save to storage when done
                  if (exchangeId && finalContent) {
                    addResponseToStorage(selectedParagraphIndex, exchangeId, paperId, finalContent);
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
        setLoadingSourceId(null);
      }
    },
    [selectedParagraph, selectedParagraphIndex, activePaper, commentingPapers, getSourceHistory, addResponseToStorage]
  );

  const handleSelectParagraph = useCallback(
    (index: number) => {
      setSelectedParagraphIndex(index);
      setPanelOpen(true);
      setCurrentExchangeId(null);

      // Load existing conversation from storage
      const existingConversation = getConversationForParagraph(index);
      if (existingConversation && existingConversation.exchanges.length > 0) {
        // Convert stored exchanges to UI responses format
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

      if (activePaper) {
        const passage = activePaper.paragraphs[index].content;
        fetchEngagement(index, passage);
      }
    },
    [activePaper, fetchEngagement, getConversationForParagraph]
  );

  const handleClickSourceFlag = useCallback(
    (paragraphIndex: number, paperId: string) => {
      setSelectedParagraphIndex(paragraphIndex);
      setPanelOpen(true);

      // Load existing conversation from storage
      const existingConversation = getConversationForParagraph(paragraphIndex);
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

      if (activePaper) {
        const passage = activePaper.paragraphs[paragraphIndex].content;
        fetchEngagement(paragraphIndex, passage);

        // Create a new exchange for this response
        const exchange = startExchange(paragraphIndex, passage);
        if (exchange) {
          setCurrentExchangeId(exchange.id);
          setTimeout(() => {
            generateSingleResponse(paperId, undefined, undefined, exchange.id);
          }, 0);
        }
      }
    },
    [activePaper, fetchEngagement, generateSingleResponse, getConversationForParagraph, startExchange]
  );

  const handleAsk = useCallback(
    (question: string) => {
      if (!selectedParagraph || selectedParagraphIndex === null) return;

      // Create a new exchange for this question
      const exchange = startExchange(selectedParagraphIndex, selectedParagraph, question);
      if (!exchange) return;

      setCurrentExchangeId(exchange.id);

      if (askingSource) {
        // Directed mode: ask specific source
        generateSingleResponse(askingSource, undefined, question, exchange.id);
        setAskingSource(null); // Clear after asking
      } else {
        // Broadcast mode: ask all engaged sources
        for (const paperId of currentEngagedPaperIds) {
          generateSingleResponse(paperId, undefined, question, exchange.id);
        }
      }
    },
    [selectedParagraph, selectedParagraphIndex, currentEngagedPaperIds, askingSource, generateSingleResponse, startExchange]
  );

  // Wrapper for generating responses from the panel (creates exchange if needed)
  const handleGenerateFromPanel = useCallback(
    (paperId: string, replyToContent?: string) => {
      if (!selectedParagraph || selectedParagraphIndex === null) return;

      // Create a new exchange if we don't have one
      let exchangeId = currentExchangeId;
      if (!exchangeId) {
        const exchange = startExchange(selectedParagraphIndex, selectedParagraph);
        if (exchange) {
          exchangeId = exchange.id;
          setCurrentExchangeId(exchangeId);
        }
      }

      generateSingleResponse(paperId, replyToContent, undefined, exchangeId || undefined);
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
    setEngagements(prev => {
      const next = new Map(prev);
      next.delete(selectedParagraphIndex);
      return next;
    });

    // Re-run prefilter (force=true to bypass cache check)
    const passage = activePaper.paragraphs[selectedParagraphIndex].content;
    fetchEngagement(selectedParagraphIndex, passage, true);
  }, [selectedParagraphIndex, activePaper, clearConversation, fetchEngagement]);

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
            <Link href="/library" className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100">
              Library ({commentingPapers.length + (activePaper ? 1 : 0)})
            </Link>
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Reading pane */}
        <div
          className={`flex-1 overflow-y-auto transition-all duration-300 ${
            panelOpen ? 'w-3/5' : 'w-full'
          }`}
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

        {/* Conversation panel */}
        {panelOpen && (
          <div className="w-2/5 flex-shrink-0">
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
              onDeleteSource={deletePaper}
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
    </div>
  );
}
