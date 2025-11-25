import { NextRequest } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Source } from '@/lib/types';
import { buildAgentSystemPrompt, buildAgentUserPrompt } from '@/lib/prompts';
import { isWithinTokenLimit } from '@/lib/gemini';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export async function POST(request: NextRequest) {
  try {
    const { passage, question, sources } = await request.json() as {
      passage: string;
      question?: string;
      sources: Source[];
    };

    if (!passage || !sources || sources.length === 0) {
      return new Response(
        JSON.stringify({ error: 'Missing passage or sources' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Create a ReadableStream for SSE
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Process all sources in parallel
        const promises = sources.map(async (source) => {
          try {
            // Send start event
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'start',
                sourceId: source.id
              })}\n\n`)
            );

            const systemPrompt = buildAgentSystemPrompt(source);

            // Include full text if within token limit, otherwise just identity layer
            const includeFullText = isWithinTokenLimit(source.fullText);
            const userPrompt = buildAgentUserPrompt(
              passage,
              question,
              includeFullText ? source.fullText : undefined
            );

            const model = genAI.getGenerativeModel({
              model: 'gemini-3-pro-preview',
              systemInstruction: systemPrompt,
            });

            const result = await model.generateContentStream(userPrompt);

            for await (const chunk of result.stream) {
              const text = chunk.text();
              if (text) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({
                    type: 'chunk',
                    sourceId: source.id,
                    content: text
                  })}\n\n`)
                );
              }
            }

            // Send done event for this source
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'done',
                sourceId: source.id
              })}\n\n`)
            );
          } catch (error) {
            console.error(`Error for source ${source.id}:`, error);
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({
                type: 'error',
                sourceId: source.id,
                error: 'Failed to generate response'
              })}\n\n`)
            );
          }
        });

        // Wait for all to complete
        await Promise.all(promises);

        // Send final complete event
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`)
        );

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
