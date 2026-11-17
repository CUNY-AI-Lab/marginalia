// Reads an OpenAI-compatible chat completion stream from the Gateway and yields the visible text.
// Reasoning deltas are ignored. Error objects inside the stream (which the Gateway rewrites into
// safe CAIL envelopes) end the stream with a StreamError.

export class StreamError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export interface StreamResult {
  finishReason: string | null;
  emitted: number;
}

interface ChunkShape {
  error?: { code?: unknown; message?: unknown };
  choices?: Array<{ delta?: { content?: unknown }; finish_reason?: unknown }>;
}

export async function* readChatStream(body: ReadableStream<Uint8Array>, result: StreamResult): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newline).replace(/\r$/, '');
        buffer = buffer.slice(newline + 1);
        const text = parseLine(line, result);
        if (text === null) return;
        if (text) {
          result.emitted += text.length;
          yield text;
        }
      }
    }
    buffer += decoder.decode();
    if (buffer) {
      const text = parseLine(buffer.replace(/\r$/, ''), result);
      if (text) {
        result.emitted += text.length;
        yield text;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
}

// Returns the visible text in one SSE line, '' for nothing, or null at the terminal [DONE].
function parseLine(line: string, result: StreamResult): string | null {
  if (!line.startsWith('data:')) return '';
  const data = line.slice(5).trim();
  if (!data) return '';
  if (data === '[DONE]') return null;
  let chunk: ChunkShape;
  try {
    chunk = JSON.parse(data);
  } catch {
    return '';
  }
  if (chunk.error) {
    const code = typeof chunk.error.code === 'string' ? chunk.error.code : 'upstream_error';
    const message = typeof chunk.error.message === 'string' ? chunk.error.message : 'The model stopped with an error.';
    throw new StreamError(code, message);
  }
  const choice = chunk.choices?.[0];
  if (typeof choice?.finish_reason === 'string') result.finishReason = choice.finish_reason;
  const content = choice?.delta?.content;
  return typeof content === 'string' ? content : '';
}
