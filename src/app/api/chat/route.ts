import { NextRequest } from 'next/server';
import { Source, EngagementInfo } from '@/lib/types';
import { buildAgentSystemPrompt, buildAgentUserPrompt, PromptMode, ConversationHistoryEntry } from '@/lib/prompts';
import { isWithinTokenLimit, streamContent } from '@/lib/llm';

export async function POST(request: NextRequest) {
  try {
    const { passage, question, sources, sourceId, mode = 'brief', context, conversationHistory, engagement } = await request.json() as {
      passage: string;
      question?: string;
      sources: Source[];
      sourceId?: string; // Optional: generate for single source only
      mode?: PromptMode;
      context?: string; // Optional: previous comment being responded to (legacy)
      conversationHistory?: ConversationHistoryEntry[]; // Previous exchanges with this source
      engagement?: EngagementInfo; // Optional: how this source should engage
    };

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
          try {
            // Send start event
            safeEnqueue(`data: ${JSON.stringify({
              type: 'start',
              sourceId: source.id
            })}\n\n`);

            const systemPrompt = buildAgentSystemPrompt(source, mode, engagement);

            // Include full text if within token limit, otherwise just identity layer
            const includeFullText = isWithinTokenLimit(source.fullText);

            // Build user prompt, including context if responding to another comment
            const userPrompt = buildAgentUserPrompt(
              passage,
              context ? `Respond to this comment from another source: "${context}"` : question,
              includeFullText ? source.fullText : undefined,
              conversationHistory
            );

            const stream = streamContent(userPrompt, systemPrompt);

            for await (const text of stream) {
              if (text) {
                safeEnqueue(`data: ${JSON.stringify({
                  type: 'chunk',
                  sourceId: source.id,
                  content: text
                })}\n\n`);
              }
            }

            // Send done event for this source
            safeEnqueue(`data: ${JSON.stringify({
              type: 'done',
              sourceId: source.id
            })}\n\n`);
          } catch {
            safeEnqueue(`data: ${JSON.stringify({
              type: 'error',
              sourceId: source.id,
              error: 'Failed to generate response'
            })}\n\n`);
          }
        });

        // Wait for all to complete
        await Promise.all(promises);

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
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
