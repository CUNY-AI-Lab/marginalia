// Browser-side calls to Marginalia's Worker, which sits behind CUNY Login at
// tools.ailab.gc.cuny.edu/marginalia/. Doorway never redirects a background request to sign-in;
// it answers 401, and the page then makes one full-page navigation to its launch path.

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '/marginalia';
const LAUNCH_PATH = '/launch/marginalia';
const LOST_SESSION = new Set(['authentication_required', 'session_invalid']);

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let redirecting = false;

function restartSignIn(launch: unknown) {
  if (redirecting || typeof window === 'undefined') return;
  redirecting = true;
  const target = typeof launch === 'string' && launch.startsWith('/') && !launch.startsWith('//') ? launch : LAUNCH_PATH;
  window.location.assign(target);
}

// Fetches an API path ("/api/chat") under the mount. Non-2xx answers become ApiError with the
// server's safe message; a lost session navigates to sign-in.
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${BASE_PATH}${path}`, { credentials: 'same-origin', ...init });
  if (response.ok) return response;
  let code = 'request_failed';
  let message = `The request failed (${response.status}).`;
  let launch: unknown;
  try {
    const body = await response.json();
    if (body?.error) {
      code = typeof body.error.code === 'string' ? body.error.code : code;
      message = typeof body.error.message === 'string' ? body.error.message : message;
      launch = body.error.launch;
    }
  } catch {
    // Non-JSON error bodies keep the generic message.
  }
  if (response.status === 401 && LOST_SESSION.has(code)) restartSignIn(launch);
  throw new ApiError(code, message, response.status);
}

export async function apiJSON<T>(path: string, body?: unknown, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, body === undefined ? init : {
    ...init,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    body: JSON.stringify(body),
  });
  return response.json() as Promise<T>;
}

export function errorMessage(error: unknown, fallback = 'Something went wrong. Try again.'): string {
  if (error instanceof ApiError) return error.message;
  return fallback;
}

export interface ChatStreamEvent {
  type: 'start' | 'chunk' | 'done' | 'error' | 'complete';
  sourceId?: string;
  content?: string;
  error?: string;
  code?: string;
  truncated?: boolean;
}

// Reads Marginalia's server-sent events, buffering across network chunks.
export async function* readEvents(response: Response): AsyncGenerator<ChatStreamEvent> {
  const reader = response.body?.getReader();
  if (!reader) throw new ApiError('empty_response', 'The server returned no response.', 502);
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary: number;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        for (const line of block.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try {
            yield JSON.parse(line.slice(6)) as ChatStreamEvent;
          } catch {
            // A malformed event is skipped.
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
