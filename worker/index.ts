// Marginalia's private receiver. Doorway is the only ingress: it signs the person in, checks
// current Admission membership, and forwards two identity legs over a service binding. This Worker
// verifies both, forwards only the cail:gateway leg to the Gateway, and serves the static app.
import {
  CAIL_CANONICAL_ISSUER,
  loadIdentityVerifierConfig,
  readIdentityKeyring,
  verifyIdentityJwt,
  verifyKeyringGatewayJwt,
} from '@cuny-ai-lab/cail-identity';
import {
  CailError,
  createCailClient,
  type CailCorrelation,
  type CailCredential,
  type CailModelCatalogEntry,
} from '@cuny-ai-lab/cail-client';
import {
  IDENTITY_EXTRACTION_PROMPT,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  buildPrefilterPrompt,
  parseIdentityLayerResponse,
  parsePrefilterResponse,
  type ConversationHistoryEntry,
  type PromptMode,
} from '../src/lib/prompts';
import type { EngagementInfo, EngagementType, IdentityLayer, Source, StructuredParagraph } from '../src/lib/types';
import { MODEL, estimateTokens, fullTextBudget, outputControls, usableRow, type OutputKind } from './models';
import { StreamError, readChatStream, type StreamResult } from './sse';

export interface Env {
  ASSETS: Fetcher;
  GATEWAY: Fetcher;
  SHARES?: R2Bucket;
  CAIL_IDENTITY_JWKS?: string;
  CAIL_IDENTITY_ISSUER?: string;
  CF_VERSION_METADATA?: { id?: string; tag?: string };
}

const ORIGIN = 'https://tools.ailab.gc.cuny.edu';
const MOUNT = '/marginalia';
const AUDIENCE = 'cail:marginalia';
const APP = 'marginalia';
// Doorway's launch route; 401 bodies carry it so the page restarts sign-in there.
const LAUNCH_PATH = '/launch/marginalia';
const MAX_BODY = 8 * 1024 * 1024;
const MAX_SOURCE_CHARS = 4_000_000;
const DEADLINE_MS = 180_000;
const CATALOG_CACHE_MS = 10 * 60 * 1000;
const CATALOG_RETRY_MS = 30_000;
const CATALOG_TIMEOUT_MS = 5000;
// Shares are deleted by the bucket's lifecycle rule; reads also refuse anything older.
export const SHARE_TTL_DAYS = 30;
const SHARE_ID = /^[A-Za-z0-9_-]{16,32}$/;
const CSP_MANIFEST = '/_marginalia/csp.json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[47][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ENGAGEMENT_TYPES: EngagementType[] = ['affirms', 'extends', 'challenges', 'complicates', 'evidence', 'reframes', 'contextualizes'];

class AppError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

const SECURITY_HEADERS = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' };
const json = (data: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(data, { status, headers: { 'cache-control': 'no-store', ...SECURITY_HEADERS, ...headers } });

async function boundedText(message: Request | Response, limit = MAX_BODY): Promise<string> {
  if (Number(message.headers.get('content-length')) > limit) throw new AppError('body_too_large', 'This request is too large. Try a shorter document.', 413);
  if (!message.body) return '';
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new AppError('body_too_large', 'This request is too large. Try a shorter document.', 413);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function bodyJSON(request: Request): Promise<Record<string, unknown>> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError('invalid_request', 'Send a JSON request.', 415);
  let value: unknown;
  try {
    value = JSON.parse(await boundedText(request));
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('invalid_request', 'The request could not be read.');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AppError('invalid_request', 'The request could not be read.');
  return value as Record<string, unknown>;
}

const isString = (value: unknown, max: number, min = 0): value is string =>
  typeof value === 'string' && value.length <= max && value.trim().length >= min;
const optionalString = (value: unknown, max: number): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (!isString(value, max)) throw new AppError('invalid_request', 'A text field is too long or not text.');
  return value;
};

function identityLayer(value: unknown): IdentityLayer | null {
  if (value === undefined || value === null) return null;
  const layer = value as Partial<IdentityLayer>;
  if (typeof layer !== 'object' || !isString(layer.raw, 60000)) throw new AppError('invalid_request', 'A source identity could not be read.');
  return {
    coreCommitments: isString(layer.coreCommitments, 20000) ? layer.coreCommitments : '',
    antagonists: isString(layer.antagonists, 20000) ? layer.antagonists : '',
    characteristicMoves: isString(layer.characteristicMoves, 20000) ? layer.characteristicMoves : '',
    vocabulary: Array.isArray(layer.vocabulary) ? layer.vocabulary.filter((v): v is string => isString(v, 300)).slice(0, 40) : [],
    triggers: isString(layer.triggers, 20000) ? layer.triggers : '',
    voiceSamples: Array.isArray(layer.voiceSamples) ? layer.voiceSamples.filter((v): v is string => isString(v, 2000)).slice(0, 10) : [],
    raw: layer.raw,
  };
}

function sourceSummary(value: unknown): Source {
  const source = value as Record<string, unknown>;
  if (!source || typeof source !== 'object' || !isString(source.id, 100, 1) || !isString(source.title, 1000) || !isString(source.author, 1000)) {
    throw new AppError('invalid_request', 'Each source needs an id, title and author.');
  }
  const fullText = source.fullText === undefined ? '' : source.fullText;
  if (!isString(fullText, MAX_SOURCE_CHARS)) throw new AppError('invalid_request', 'A source is too long.');
  return {
    id: source.id,
    title: source.title,
    author: source.author,
    type: 'other',
    fullText,
    identityLayer: identityLayer(source.identityLayer),
    color: '',
    createdAt: 0,
  };
}

function engagementInfo(value: unknown): EngagementInfo | undefined {
  if (value === undefined || value === null) return undefined;
  const engagement = value as Record<string, unknown>;
  if (!ENGAGEMENT_TYPES.includes(engagement.type as EngagementType) || !isString(engagement.angle, 500)) {
    throw new AppError('invalid_request', 'The engagement could not be read.');
  }
  return { type: engagement.type as EngagementType, angle: engagement.angle };
}

function history(value: unknown): ConversationHistoryEntry[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length > 30) throw new AppError('invalid_request', 'The conversation history could not be read.');
  return value.map(entry => {
    const item = entry as Record<string, unknown>;
    if (!item || typeof item !== 'object' || !isString(item.response, 20000)) throw new AppError('invalid_request', 'The conversation history could not be read.');
    return { question: optionalString(item.question, 4000), response: item.response };
  });
}

type ShareBundle = {
  version: 1;
  sharedAt: number;
  workspace: { name: string; description?: string };
  papers: Array<{
    title: string;
    author: string;
    type: 'article' | 'book' | 'chapter' | 'other';
    fullText: string;
    paragraphs: StructuredParagraph[];
    identityLayer?: IdentityLayer;
  }>;
};

function shareBundle(body: Record<string, unknown>, now: number): ShareBundle {
  const workspace = body.workspace as Record<string, unknown> | undefined;
  if (!workspace || !isString(workspace.name, 200, 1)) throw new AppError('invalid_request', 'The workspace needs a name.');
  const papers = body.papers;
  if (!Array.isArray(papers) || papers.length === 0 || papers.length > 50) throw new AppError('invalid_request', 'Share between 1 and 50 papers.');
  return {
    version: 1,
    sharedAt: now,
    workspace: { name: workspace.name, description: optionalString(workspace.description, 2000) },
    papers: papers.map(value => {
      const paper = value as Record<string, unknown>;
      if (!paper || !isString(paper.title, 1000, 1) || !isString(paper.author, 1000) || !isString(paper.fullText, MAX_SOURCE_CHARS, 1)) {
        throw new AppError('invalid_request', 'A paper is missing its title or text.');
      }
      if (!['article', 'book', 'chapter', 'other'].includes(paper.type as string)) throw new AppError('invalid_request', 'A paper has an unknown type.');
      if (!Array.isArray(paper.paragraphs) || paper.paragraphs.length > 100000) throw new AppError('invalid_request', 'A paper has unreadable paragraphs.');
      const paragraphs = paper.paragraphs.map(item => {
        const p = item as Record<string, unknown>;
        if (!p || !['h1', 'h2', 'h3', 'body'].includes(p.type as string) || !isString(p.content, 200000)) throw new AppError('invalid_request', 'A paper has unreadable paragraphs.');
        return { type: p.type as StructuredParagraph['type'], content: p.content };
      });
      const layer = identityLayer(paper.identityLayer);
      return {
        title: paper.title,
        author: paper.author,
        type: paper.type as ShareBundle['papers'][number]['type'],
        fullText: paper.fullText,
        paragraphs,
        ...(layer ? { identityLayer: layer } : {}),
      };
    }),
  };
}

function newShareId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(15));
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_');
}

export interface HandlerOptions {
  /** Test seam: replaces the GATEWAY binding's fetch. */
  gatewayFetch?: typeof fetch;
  deadlineMs?: number;
  now?: () => number;
}

export function createHandler({ gatewayFetch, deadlineMs = DEADLINE_MS, now = Date.now }: HandlerOptions = {}) {
  let binding: Fetcher | null = null;
  // Every Gateway call (chat, quota, catalog) goes through the GATEWAY service binding. A global
  // fetch() to tools.ailab.gc.cuny.edu from a Worker in the same zone reaches the zone's origin
  // and answers 404 (the Bibliography outage of 2026-11-09).
  const viaBinding = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (!binding) throw new TypeError('GATEWAY service binding is not configured.');
    return binding.fetch(input as RequestInfo, init);
  }) as typeof fetch;
  const client = createCailClient({ app: APP, fetchImpl: gatewayFetch ?? viaBinding });

  // Per-isolate cache of the model's catalog row. Concurrent requests share one read with its own
  // short deadline, so one person cancelling cannot poison it; a failed read is retried after 30 s.
  let catalogCache: { at: number; row: CailModelCatalogEntry | undefined } = { at: 0, row: undefined };
  let catalogRead: Promise<CailModelCatalogEntry | undefined> | null = null;
  function modelRow(): Promise<CailModelCatalogEntry | undefined> {
    if (now() - catalogCache.at <= CATALOG_CACHE_MS) return Promise.resolve(catalogCache.row);
    catalogRead ??= client
      .getCatalogSnapshot({ modality: 'text', signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) })
      .then(
        catalog => {
          catalogCache = { at: now(), row: catalog.data.find(row => row.id === MODEL) };
        },
        () => {
          catalogCache = { at: now() - CATALOG_CACHE_MS + CATALOG_RETRY_MS, row: undefined };
        },
      )
      .then(() => catalogCache.row)
      .finally(() => {
        catalogRead = null;
      });
    return catalogRead;
  }
  async function requireModel(): Promise<CailModelCatalogEntry> {
    const row = await modelRow();
    if (!usableRow(row)) throw new AppError('model_unavailable', `The model Marginalia uses (${MODEL}) is not available from the Gateway right now.`, 503);
    return row;
  }

  let scriptHashes: string[] | null = null;
  async function cspHashes(env: Env): Promise<string[] | null> {
    if (scriptHashes) return scriptHashes;
    try {
      const response = await env.ASSETS.fetch(new Request(`${ORIGIN}${CSP_MANIFEST}`));
      if (!response.ok) {
        await response.body?.cancel();
        return null;
      }
      const manifest = (await response.json()) as { scriptHashes?: unknown };
      if (!Array.isArray(manifest.scriptHashes) || !manifest.scriptHashes.every(h => typeof h === 'string' && /^'sha256-[A-Za-z0-9+/=]+'$/.test(h))) return null;
      scriptHashes = manifest.scriptHashes as string[];
      return scriptHashes;
    } catch {
      return null;
    }
  }

  async function verifierConfigs(env: Env) {
    const results = await Promise.all(
      [AUDIENCE, 'cail:gateway'].map(expectedAudience =>
        loadIdentityVerifierConfig({
          jwks: env.CAIL_IDENTITY_JWKS,
          issuer: env.CAIL_IDENTITY_ISSUER,
          expectedAudience,
          supportedIssuers: [CAIL_CANONICAL_ISSUER],
        }),
      ),
    );
    const configs = results.map(result => (result.ok ? result.config : null));
    if (!configs[0] || !configs[1]) throw new AppError('identity_unavailable', 'Sign-in verification is temporarily unavailable.', 503);
    return [configs[0], configs[1]] as const;
  }

  async function authenticate(request: Request, env: Env): Promise<CailCredential> {
    const [appConfig, gatewayConfig] = await verifierConfigs(env);
    // Only an absent app leg means "no session" (the page then restarts sign-in). A present but
    // malformed leg is an invalid credential, like one that fails verification.
    if (request.headers.get('x-cail-identity-jwt') === null) throw new AppError('authentication_required', 'Sign in with CUNY to continue.', 401);
    const keyring = readIdentityKeyring(request.headers);
    if (!keyring) throw new AppError('invalid_credential', 'Your sign-in has expired or is invalid. Sign in again.', 401);
    const identity = await verifyIdentityJwt(keyring.appJwt, appConfig);
    if (!identity || !keyring.gatewayJwt || !(await verifyKeyringGatewayJwt(keyring, gatewayConfig, identity.subject))) {
      throw new AppError('invalid_credential', 'Your sign-in has expired or is invalid. Sign in again.', 401);
    }
    return { kind: 'jwt', token: keyring.gatewayJwt };
  }

  async function readiness(env: Env): Promise<Response> {
    await verifierConfigs(env);
    // Reads the public catalog through the binding: proves the Gateway path without spend.
    let row: CailModelCatalogEntry | undefined;
    try {
      const catalog = await client.getCatalogSnapshot({ modality: 'text', signal: AbortSignal.timeout(CATALOG_TIMEOUT_MS) });
      row = catalog.data.find(entry => entry.id === MODEL);
    } catch {
      throw new AppError('gateway_unavailable', 'The model service is unreachable from this tool.', 503);
    }
    if (!usableRow(row)) throw new AppError('model_unavailable', `${MODEL} is not in the Gateway catalog.`, 503);
    const index = await env.ASSETS.fetch(new Request(`${ORIGIN}/`));
    const html = index.ok && index.headers.get('content-type')?.includes('text/html');
    await index.body?.cancel();
    if (!html || !(await cspHashes(env))) throw new AppError('assets_unavailable', 'Application assets are unavailable.', 503);
    if (!env.SHARES) throw new AppError('shares_unavailable', 'Share storage is not bound.', 503);
    return json({ status: 'ready', model: MODEL, version_id: env.CF_VERSION_METADATA?.id ?? null, tag: env.CF_VERSION_METADATA?.tag ?? null });
  }

  function correlation(requestId: string): CailCorrelation {
    return {
      request_id: requestId,
      trace_id: crypto.randomUUID().replaceAll('-', ''),
      span_id: crypto.randomUUID().replaceAll('-', '').slice(0, 16),
      trace_flags: 0,
    };
  }

  // One buffered completion. Returns the visible text or throws a safe error.
  async function complete(messages: unknown[], kind: OutputKind, credential: CailCredential, signal: AbortSignal, requestId: string): Promise<string> {
    const row = await requireModel();
    const response = await client.chatCompletions(
      { model: MODEL, temperature: kind === 'prefilter' ? 0 : 0.3, messages: messages as never, ...(outputControls(row, kind) as Record<string, never>) },
      credential,
      { signal, correlation: correlation(requestId) },
    );
    let data: { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }> };
    try {
      data = JSON.parse(await boundedText(response));
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError('invalid_model_response', 'The model returned an unreadable response.', 502);
    }
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      if (data.choices?.[0]?.finish_reason === 'length') throw new AppError('model_output_limit', 'The model ran out of room before it answered. Try a shorter document.', 502);
      throw new AppError('invalid_model_response', 'The model returned an empty response. Try again.', 502);
    }
    return content;
  }

  async function chat(request: Request, credential: CailCredential, signal: AbortSignal, requestId: string): Promise<Response> {
    const body = await bodyJSON(request);
    const passage = body.passage;
    if (!isString(passage, 20000, 1)) throw new AppError('invalid_request', 'Select a passage of up to 20,000 characters.');
    const source = sourceSummary(body.source);
    const mode: PromptMode = body.mode === 'normal' ? 'normal' : 'brief';
    const question = optionalString(body.question, 4000);
    const context = optionalString(body.context, 8000);
    const engagement = engagementInfo(body.engagement);
    const conversationHistory = history(body.conversationHistory);

    const row = await requireModel();
    const includeFullText = source.fullText.length > 0 && estimateTokens(source.fullText) <= fullTextBudget(row);
    const messages = [
      { role: 'system', content: buildAgentSystemPrompt(source, mode, engagement) },
      {
        role: 'user',
        content: buildAgentUserPrompt(
          passage,
          context ? `Respond to this comment from another source: "${context}"` : question,
          includeFullText ? source.fullText : undefined,
          conversationHistory,
        ),
      },
    ];
    // The first Gateway call happens before the stream opens, so quota, sign-in and model errors
    // reach the page as ordinary JSON errors with their status.
    const upstream = await client.chatCompletions(
      { model: MODEL, temperature: 0.3, stream: true, messages, ...(outputControls(row, mode) as Record<string, never>) },
      credential,
      { signal, correlation: correlation(requestId) },
    );
    if (!upstream.body) throw new AppError('invalid_model_response', 'The model returned no response.', 502);
    const upstreamBody = upstream.body;

    const encoder = new TextEncoder();
    const event = (data: Record<string, unknown>) => encoder.encode(`data: ${JSON.stringify({ sourceId: source.id, ...data })}\n\n`);
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const result: StreamResult = { finishReason: null, emitted: 0 };
        controller.enqueue(event({ type: 'start', fullText: includeFullText }));
        try {
          for await (const text of readChatStream(upstreamBody, result)) controller.enqueue(event({ type: 'chunk', content: text }));
          if (result.emitted === 0) {
            const message = result.finishReason === 'length' ? 'The model ran out of room before it answered.' : 'The model returned an empty response. Try again.';
            controller.enqueue(event({ type: 'error', code: result.finishReason === 'length' ? 'model_output_limit' : 'empty_response', error: message }));
          } else {
            controller.enqueue(event({ type: 'done', truncated: result.finishReason === 'length' }));
          }
        } catch (error) {
          const code = error instanceof StreamError ? error.code : signal.aborted ? 'request_cancelled' : 'stream_interrupted';
          const message = error instanceof StreamError ? error.message : 'The response was interrupted.';
          controller.enqueue(event({ type: 'error', code, error: message }));
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'complete' })}\n\n`));
        controller.close();
      },
      cancel() {
        upstreamBody.cancel().catch(() => {});
      },
    });
    return new Response(stream, {
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-store', 'x-cail-request-id': requestId, ...SECURITY_HEADERS },
    });
  }

  async function prefilter(request: Request, credential: CailCredential, signal: AbortSignal, requestId: string): Promise<Response> {
    const body = await bodyJSON(request);
    if (!isString(body.passage, 20000, 1)) throw new AppError('invalid_request', 'Select a passage of up to 20,000 characters.');
    if (!Array.isArray(body.sources) || body.sources.length === 0 || body.sources.length > 50) throw new AppError('invalid_request', 'Provide between 1 and 50 sources.');
    const sources = body.sources.map(sourceSummary);
    const text = await complete([{ role: 'user', content: buildPrefilterPrompt(body.passage, sources) }], 'prefilter', credential, signal, requestId);
    const engagements = parsePrefilterResponse(text, new Set(sources.map(s => s.id)));
    return json({ engagements, engagedSourceIds: engagements.map(e => e.sourceId) });
  }

  async function extractIdentity(request: Request, credential: CailCredential, signal: AbortSignal, requestId: string): Promise<Response> {
    const body = await bodyJSON(request);
    if (!isString(body.text, 400000, 1)) throw new AppError('invalid_request', 'Provide the document text (up to 400,000 characters).');
    const title = optionalString(body.title, 1000) ?? 'Unknown';
    const author = optionalString(body.author, 1000) ?? 'Unknown';
    const prompt = `${IDENTITY_EXTRACTION_PROMPT}\n\n---\n\nTEXT TO ANALYZE:\nTitle: ${title}\nAuthor: ${author}\n\n${body.text}`;
    const text = await complete([{ role: 'user', content: prompt }], 'identity', credential, signal, requestId);
    const result = parseIdentityLayerResponse(text);
    if (!result) throw new AppError('invalid_model_response', 'The model did not return a readable source profile. Try again.', 502);
    return json({ identityLayer: result.identityLayer, metadata: result.metadata });
  }

  async function createShare(request: Request, env: Env): Promise<Response> {
    if (!env.SHARES) throw new AppError('shares_unavailable', 'Sharing is not available right now.', 503);
    const bundle = shareBundle(await bodyJSON(request), now());
    const id = newShareId();
    await env.SHARES.put(`shares/${id}.json`, JSON.stringify(bundle), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { created: String(bundle.sharedAt) },
    });
    return json({ shareId: id, url: `${ORIGIN}${MOUNT}/share/?id=${id}`, expiresInDays: SHARE_TTL_DAYS });
  }

  async function readShare(url: URL, env: Env): Promise<Response> {
    if (!env.SHARES) throw new AppError('shares_unavailable', 'Sharing is not available right now.', 503);
    const id = url.searchParams.get('id') ?? '';
    if (!SHARE_ID.test(id)) throw new AppError('invalid_share', 'This share link is not valid.');
    const object = await env.SHARES.get(`shares/${id}.json`);
    if (!object) throw new AppError('share_not_found', 'This shared workspace was not found. Links expire after 30 days.', 404);
    const created = Number(object.customMetadata?.created ?? object.uploaded.getTime());
    if (now() - created > SHARE_TTL_DAYS * 86400_000) {
      await object.body.cancel();
      throw new AppError('share_not_found', 'This shared workspace was not found. Links expire after 30 days.', 404);
    }
    return new Response(object.body, { headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...SECURITY_HEADERS } });
  }

  async function asset(request: Request, env: Env, path: string): Promise<Response> {
    const target = new URL(`${ORIGIN}${path || '/'}`);
    const upstream = await env.ASSETS.fetch(new Request(target, { method: request.method }));
    const response = new Response(upstream.body, upstream);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) response.headers.set(name, value);
    if (path.startsWith('/_next/static/')) {
      response.headers.set('cache-control', 'private, max-age=31536000, immutable');
    } else {
      response.headers.set('cache-control', 'no-store');
    }
    if (response.headers.get('content-type')?.includes('text/html')) {
      // Next.js inlines its hydration payload; each inline script is allowed by hash, never by
      // 'unsafe-inline', because this origin carries every tool's session.
      const hashes = (await cspHashes(env)) ?? [];
      response.headers.set(
        'content-security-policy',
        [
          "default-src 'self'",
          `script-src 'self' ${hashes.join(' ')}`.trim(),
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          "connect-src 'self'",
          "worker-src 'self' blob:",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'none'",
          "form-action 'self'",
        ].join('; '),
      );
    }
    return response;
  }

  return async function handle(request: Request, env: Env): Promise<Response> {
    if (env?.GATEWAY && typeof env.GATEWAY.fetch === 'function') binding = env.GATEWAY;
    const url = new URL(request.url);
    const supplied = request.headers.get('x-cail-request-id');
    const requestId = supplied && UUID.test(supplied) ? supplied : crypto.randomUUID();
    try {
      if (url.origin !== ORIGIN || (url.pathname !== MOUNT && !url.pathname.startsWith(`${MOUNT}/`))) throw new AppError('not_found', 'Not found.', 404);
      const path = url.pathname.slice(MOUNT.length);
      if (path === '/health' && ['GET', 'HEAD'].includes(request.method)) return await readiness(env);
      // Binding-only Worker: Doorway owns request-time Admission checks; there is no public origin
      // and no application-credential fallback.
      const credential = await authenticate(request, env);
      if (!['GET', 'HEAD', 'POST'].includes(request.method)) throw new AppError('method_not_allowed', 'Method not allowed.', 405);
      if (request.method === 'POST' && request.headers.get('origin') !== ORIGIN) throw new AppError('invalid_origin', 'Reload Marginalia from the CUNY AI Lab tools page.', 403);
      if (path === '' && ['GET', 'HEAD'].includes(request.method)) {
        url.pathname = `${MOUNT}/`;
        return new Response(null, { status: 308, headers: { location: url.href, 'cache-control': 'no-store' } });
      }
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(deadlineMs)]);
      if (path === '/api/session' && request.method === 'GET') return json({ authenticated: true, model: MODEL });
      if (path === '/api/quota' && request.method === 'GET') return json(await client.getQuota(credential, { signal }));
      if (path === '/api/chat' && request.method === 'POST') return await chat(request, credential, signal, requestId);
      if (path === '/api/prefilter' && request.method === 'POST') return await prefilter(request, credential, signal, requestId);
      if (path === '/api/extract-identity' && request.method === 'POST') return await extractIdentity(request, credential, signal, requestId);
      if (path === '/api/share' && request.method === 'POST') return await createShare(request, env);
      if (path === '/api/share' && request.method === 'GET') return await readShare(url, env);
      if (path.startsWith('/api/') || path.startsWith('/_marginalia/')) throw new AppError('not_found', 'Not found.', 404);
      if (!['GET', 'HEAD'].includes(request.method)) throw new AppError('not_found', 'Not found.', 404);
      return await asset(request, env, path);
    } catch (error) {
      const known = error instanceof AppError || error instanceof CailError;
      const name = (error as Error)?.name;
      const status = known ? ((error as AppError).status >= 400 ? (error as AppError).status : 502) : name === 'TimeoutError' ? 504 : name === 'AbortError' ? 499 : 502;
      const code = known ? (error as AppError).code : status === 504 ? 'request_timeout' : status === 499 ? 'request_cancelled' : 'service_unavailable';
      const message = known
        ? (error as Error).message
        : status === 504
          ? `The model did not finish within ${Math.round(deadlineMs / 60000)} minutes.`
          : status === 499
            ? 'The request was cancelled.'
            : 'The service is temporarily unavailable.';
      const retry = error instanceof CailError ? error.extras.should_retry : status === 503;
      const retryAfter = error instanceof CailError ? error.extras.retry_after_seconds : undefined;
      return json({ error: { code, message, request_id: requestId, ...(status === 401 ? { launch: LAUNCH_PATH } : {}) } }, status, {
        'x-should-retry': retry === true ? 'true' : 'false',
        'x-cail-request-id': requestId,
        ...(Number.isInteger(retryAfter) && (retryAfter as number) > 0 ? { 'retry-after': String(retryAfter) } : {}),
      });
    }
  };
}

const handle = createHandler();
export default { fetch: (request: Request, env: Env) => handle(request, env) } satisfies ExportedHandler<Env>;
