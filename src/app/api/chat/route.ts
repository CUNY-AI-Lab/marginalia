import { NextRequest } from 'next/server';
import { Source } from '@/lib/types';
import { buildAgentSystemPrompt, buildAgentUserPrompt, PromptMode, ConversationHistoryEntry } from '@/lib/prompts';
import { isWithinTokenLimit, estimateTokens, streamContent } from '@/lib/llm';

export async function POST(request: NextRequest) {
  const requestStart = Date.now();

  try {
    const { passage, question, sources, sourceId, mode = 'brief', context, conversationHistory } = await request.json() as {
      passage: string;
      question?: string;
      sources: Source[];
      sourceId?: string; // Optional: generate for single source only
      mode?: PromptMode;
      context?: string; // Optional: previous comment being responded to (legacy)
      conversationHistory?: ConversationHistoryEntry[]; // Previous exchanges with this source
    };

    console.log('[CHAT] ═══════════════════════════════════════════════════════');
    console.log('[CHAT] Request received at', new Date().toISOString());
    console.log('[CHAT] Mode:', mode);
    console.log('[CHAT] Passage:', passage.slice(0, 150) + (passage.length > 150 ? '...' : ''));
    console.log('[CHAT] Question:', question || '(none)');
    console.log('[CHAT] Context:', context ? context.slice(0, 100) + '...' : '(none)');
    console.log('[CHAT] Conversation history:', conversationHistory ? `${conversationHistory.length} exchanges` : '(none)');
    console.log('[CHAT] Source ID filter:', sourceId || '(all sources)');
    console.log('[CHAT] Total sources provided:', sources.length);

    // If sourceId provided, filter to just that source
    const targetSources = sourceId
      ? sources.filter(s => s.id === sourceId)
      : sources;

    if (!passage || !sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing passage or sources' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (targetSources.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Source not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;

        // Safe enqueue that checks if controller is still open
        const safeEnqueue = (data: string) => {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(data));
            } catch {
              // Controller was closed, mark as closed
              closed = true;
            }
          }
        };

        // Process target sources in parallel
        const promises = targetSources.map(async (source) => {
          const sourceStart = Date.now();
          let firstChunkTime: number | null = null;
          let chunkCount = 0;
          let totalResponse = '';

          try {
            console.log('[CHAT] ───────────────────────────────────────────────────');
            console.log(`[CHAT] [${source.id}] Processing source: "${source.title}" by ${source.author || 'Unknown'}`);

            // Send start event
            safeEnqueue(`data: ${JSON.stringify({
              type: 'start',
              sourceId: source.id
            })}\n\n`);

            const systemPrompt = buildAgentSystemPrompt(source, mode);

            // Include full text if within token limit, otherwise just identity layer
            const includeFullText = isWithinTokenLimit(source.fullText);
            const fullTextTokens = estimateTokens(source.fullText);

            console.log(`[CHAT] [${source.id}] Full text tokens: ~${fullTextTokens} (${includeFullText ? 'included' : 'excluded - too long'})`);
            console.log(`[CHAT] [${source.id}] Identity layer: ${source.identityLayer ? 'present' : 'missing'}`);

            // Build user prompt, including context if responding to another comment
            const userPrompt = buildAgentUserPrompt(
              passage,
              context ? `Respond to this comment from another source: "${context}"` : question,
              includeFullText ? source.fullText : undefined,
              conversationHistory
            );

            console.log(`[CHAT] [${source.id}] ┌─ SYSTEM PROMPT (${systemPrompt.length} chars):`);
            console.log(`[CHAT] [${source.id}] │ ${systemPrompt.split('\n').join('\n[CHAT] [' + source.id + '] │ ')}`);
            console.log(`[CHAT] [${source.id}] └─ END SYSTEM PROMPT`);

            console.log(`[CHAT] [${source.id}] ┌─ USER PROMPT (${userPrompt.length} chars):`);
            const userPromptPreview = userPrompt.length > 2000
              ? userPrompt.slice(0, 1000) + '\n... [truncated ' + (userPrompt.length - 2000) + ' chars] ...\n' + userPrompt.slice(-1000)
              : userPrompt;
            console.log(`[CHAT] [${source.id}] │ ${userPromptPreview.split('\n').join('\n[CHAT] [' + source.id + '] │ ')}`);
            console.log(`[CHAT] [${source.id}] └─ END USER PROMPT`);

            console.log(`[CHAT] [${source.id}] Calling OpenRouter API...`);

            const stream = streamContent(userPrompt, systemPrompt);

            for await (const text of stream) {
              if (text) {
                chunkCount++;
                totalResponse += text;

                if (!firstChunkTime) {
                  firstChunkTime = Date.now();
                  console.log(`[CHAT] [${source.id}] First chunk at +${firstChunkTime - sourceStart}ms`);
                }

                safeEnqueue(`data: ${JSON.stringify({
                  type: 'chunk',
                  sourceId: source.id,
                  content: text
                })}\n\n`);
              }
            }

            const sourceEnd = Date.now();
            const totalTime = sourceEnd - sourceStart;
            const timeToFirstChunk = firstChunkTime ? firstChunkTime - sourceStart : null;

            console.log(`[CHAT] [${source.id}] ┌─ COMPLETE RESPONSE (${totalResponse.length} chars):`);
            console.log(`[CHAT] [${source.id}] │ ${totalResponse.split('\n').join('\n[CHAT] [' + source.id + '] │ ')}`);
            console.log(`[CHAT] [${source.id}] └─ END RESPONSE`);
            console.log(`[CHAT] [${source.id}] Stats: ${chunkCount} chunks, ${totalTime}ms total, ${timeToFirstChunk}ms to first chunk`);

            // Send done event for this source
            safeEnqueue(`data: ${JSON.stringify({
              type: 'done',
              sourceId: source.id
            })}\n\n`);
          } catch (error) {
            const errorTime = Date.now() - sourceStart;
            console.error(`[CHAT] [${source.id}] ERROR after ${errorTime}ms:`, error);
            safeEnqueue(`data: ${JSON.stringify({
              type: 'error',
              sourceId: source.id,
              error: 'Failed to generate response'
            })}\n\n`);
          }
        });

        // Wait for all to complete
        await Promise.all(promises);

        const requestEnd = Date.now();
        console.log('[CHAT] ═══════════════════════════════════════════════════════');
        console.log(`[CHAT] All sources complete. Total request time: ${requestEnd - requestStart}ms`);

        // Send final complete event
        safeEnqueue(`data: ${JSON.stringify({ type: 'complete' })}\n\n`);

        closed = true;
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('Chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
