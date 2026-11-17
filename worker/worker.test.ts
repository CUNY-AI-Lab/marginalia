// @vitest-environment node
// Exercises the real CAIL identity verifier (tokens signed by a real test key) and the real CAIL
// client against a controlled Gateway receiver bound as GATEWAY. Global fetch answers 404, as the
// zone origin does for a Worker that bypasses the binding, so any such call fails these tests.
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CAIL_CANONICAL_ISSUER } from '@cuny-ai-lab/cail-identity';
import { TEST_SUBJECTS, createTestIdentityIssuer, type TestIdentityIssuer } from '@cuny-ai-lab/cail-identity/testing';
import { cailErrorResponse, quotaExceededResponse, quotaSnapshotBody } from '@cuny-ai-lab/cail-client/testing';
import catalog from './fixtures/catalog-2026-11-17.json';
import { createHandler, type Env } from './index';
import { MODEL } from './models';

const ORIGIN = 'https://tools.ailab.gc.cuny.edu';
const HTML = '<!DOCTYPE html><html><head><script>self.x=1</script></head><body>ok</body></html>';
const HASH = "'sha256-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQ='";

let issuer: TestIdentityIssuer;
beforeAll(async () => {
  issuer = await createTestIdentityIssuer({ issuer: CAIL_CANONICAL_ISSUER });
});

interface GatewayCall {
  path: string;
  method: string;
  headers: Headers;
  body: Record<string, unknown> | null;
}

function sse(events: unknown[]): Response {
  const text = events.map(e => `data: ${typeof e === 'string' ? e : JSON.stringify(e)}\n\n`).join('');
  return new Response(text, { headers: { 'content-type': 'text/event-stream' } });
}

function gateway(chat: (body: Record<string, unknown>) => Response | Promise<Response> = () => new Response('{}')) {
  const calls: GatewayCall[] = [];
  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const text = request.method === 'POST' ? await request.text() : '';
    const body = text ? JSON.parse(text) : null;
    calls.push({ path: url.pathname, method: request.method, headers: request.headers, body });
    if (url.pathname === '/v1/catalog') return Response.json(catalog);
    if (url.pathname === '/v1/quota') return Response.json(quotaSnapshotBody({ limit: 5_000_000, estimated_used: 1_250_000, estimated_remaining: 3_750_000, used_percent: 25, remaining_percent: 75 }));
    if (url.pathname === '/v1/chat/completions') return chat(body ?? {});
    return new Response('not found', { status: 404 });
  };
  return { calls, binding: { fetch: fetchImpl } as unknown as Fetcher };
}

function r2() {
  const objects = new Map<string, { text: string; customMetadata: Record<string, string>; uploaded: Date }>();
  const bucket = {
    async put(key: string, value: string, options: { customMetadata?: Record<string, string> }) {
      objects.set(key, { text: value, customMetadata: options.customMetadata ?? {}, uploaded: new Date() });
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return { body: new Response(object.text).body!, customMetadata: object.customMetadata, uploaded: object.uploaded };
    },
  };
  return { objects, bucket: bucket as unknown as R2Bucket };
}

function assets(): Fetcher {
  return {
    fetch: async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : String(input)).pathname;
      if (path === '/_marginalia/csp.json') return Response.json({ scriptHashes: [HASH] });
      if (path === '/' || path === '/library/') return new Response(HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (path.startsWith('/_next/static/')) return new Response('js', { headers: { 'content-type': 'application/javascript' } });
      return new Response('missing', { status: 404 });
    },
  } as unknown as Fetcher;
}

function env(overrides: Partial<Env> = {}, gw = gateway()): Env {
  return {
    ASSETS: assets(),
    GATEWAY: gw.binding,
    SHARES: r2().bucket,
    CAIL_IDENTITY_JWKS: issuer.jwksJson,
    CAIL_IDENTITY_ISSUER: CAIL_CANONICAL_ISSUER,
    CF_VERSION_METADATA: { id: 'version-1', tag: 'abc' },
    ...overrides,
  };
}

async function legs(subject = TEST_SUBJECTS.alice, gatewaySubject = subject) {
  return {
    app: await issuer.mintIdentityJwt({ audience: 'cail:marginalia', subject }),
    gateway: await issuer.mintIdentityJwt({ audience: 'cail:gateway', subject: gatewaySubject }),
  };
}

async function signed(path: string, init: RequestInit & { json?: unknown } = {}, keys?: { app: string; gateway: string }) {
  const k = keys ?? (await legs());
  const headers = new Headers(init.headers);
  headers.set('x-cail-identity-jwt', k.app);
  headers.set('x-cail-gateway-identity-jwt', k.gateway);
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    if (!headers.has('origin')) headers.set('origin', ORIGIN);
  }
  return new Request(`${ORIGIN}/marginalia${path}`, {
    method: init.method ?? (init.json !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
  });
}

const source = {
  id: 'carlyle',
  title: 'Signs of the Times',
  author: 'Thomas Carlyle',
  fullText: 'It is the Age of Machinery, in every outward and inward sense of that word.',
  identityLayer: { raw: 'CORE COMMITMENTS:\nThe dynamical over the mechanical.', vocabulary: ['Machinery'], voiceSamples: [] },
};

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('zone origin', { status: 404 })));
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('readiness', () => {
  it('reports ready after reading the catalog through the binding', async () => {
    const gw = gateway();
    const response = await createHandler()(new Request(`${ORIGIN}/marginalia/health`), env({}, gw));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'ready', model: MODEL, version_id: 'version-1' });
    expect(gw.calls.map(c => c.path)).toEqual(['/v1/catalog']);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed without the verifier key set', async () => {
    const response = await createHandler()(new Request(`${ORIGIN}/marginalia/health`), env({ CAIL_IDENTITY_JWKS: undefined }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('identity_unavailable');
  });

  it('is not ready when the Gateway is reachable only by global fetch', async () => {
    const response = await createHandler()(new Request(`${ORIGIN}/marginalia/health`), env({ GATEWAY: undefined as unknown as Fetcher }));
    expect(response.status).toBe(503);
    expect((await response.json()).error.code).toBe('gateway_unavailable');
  });

  it('is not ready without share storage', async () => {
    const response = await createHandler()(new Request(`${ORIGIN}/marginalia/health`), env({ SHARES: undefined }));
    expect((await response.json()).error.code).toBe('shares_unavailable');
  });
});

describe('identity', () => {
  it('asks for sign-in when the app leg is absent', async () => {
    const response = await createHandler()(new Request(`${ORIGIN}/marginalia/api/session`), env());
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatchObject({ code: 'authentication_required', launch: '/launch/marginalia' });
  });

  it('rejects a Gateway leg for another person', async () => {
    const keys = await legs(TEST_SUBJECTS.alice, TEST_SUBJECTS.bob);
    const response = await createHandler()(await signed('/api/session', {}, keys), env());
    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe('invalid_credential');
  });

  it('rejects an app leg minted for another tool', async () => {
    const keys = {
      app: await issuer.mintIdentityJwt({ audience: 'cail:bibliography', subject: TEST_SUBJECTS.alice }),
      gateway: await issuer.mintIdentityJwt({ audience: 'cail:gateway', subject: TEST_SUBJECTS.alice }),
    };
    const response = await createHandler()(await signed('/api/session', {}, keys), env());
    expect((await response.json()).error.code).toBe('invalid_credential');
  });

  it('accepts matching legs', async () => {
    const response = await createHandler()(await signed('/api/session'), env());
    expect(await response.json()).toEqual({ authenticated: true, model: MODEL });
  });

  it('refuses cross-origin writes', async () => {
    const response = await createHandler()(await signed('/api/prefilter', { json: { passage: 'x', sources: [source] }, headers: { origin: 'https://evil.example' } }), env());
    expect(response.status).toBe(403);
  });

  it('redirects the bare mount and ignores paths outside it', async () => {
    const handler = createHandler();
    const bare = await handler(new Request(`${ORIGIN}/marginalia?x=1`, { headers: (await signed('/')).headers }), env());
    expect(bare.status).toBe(308);
    expect(bare.headers.get('location')).toBe(`${ORIGIN}/marginalia/?x=1`);
    const outside = await handler(new Request(`${ORIGIN}/marginaliax/`), env());
    expect(outside.status).toBe(404);
  });
});

describe('Gateway calls', () => {
  it('reads quota with only the Gateway leg', async () => {
    const keys = await legs();
    const gw = gateway();
    const response = await createHandler()(await signed('/api/quota', {}, keys), env({}, gw));
    expect(await response.json()).toMatchObject({ unit: 'microdollar', limit: 5_000_000, estimated_used: 1_250_000 });
    const call = gw.calls.find(c => c.path === '/v1/quota')!;
    expect(call.headers.get('x-cail-identity-jwt')).toBe(keys.gateway);
    expect(call.headers.get('x-cail-app')).toBe('marginalia');
    expect(call.headers.get('authorization')).toBeNull();
    expect(call.headers.get('x-cail-gateway-identity-jwt')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('streams a comment from DeepSeek Flash with reasoning held down', async () => {
    const gw = gateway(() =>
      sse([
        { choices: [{ delta: { reasoning_content: 'thinking…' } }] },
        { choices: [{ delta: { content: 'This text resists ' } }] },
        { choices: [{ delta: { content: 'the "Age of Machinery."' }, finish_reason: 'stop' }] },
        '[DONE]',
      ]),
    );
    const response = await createHandler()(await signed('/api/chat', { json: { passage: 'Machines think.', source } }), env({}, gw));
    expect(response.headers.get('content-type')).toBe('text/event-stream');
    const events = (await response.text()).split('\n\n').filter(Boolean).map(block => JSON.parse(block.slice(6)));
    expect(events.map(e => e.type)).toEqual(['start', 'chunk', 'chunk', 'done', 'complete']);
    expect(events.filter(e => e.type === 'chunk').map(e => e.content).join('')).toBe('This text resists the "Age of Machinery."');
    const body = gw.calls.find(c => c.path === '/v1/chat/completions')!.body!;
    expect(body).toMatchObject({ model: MODEL, stream: true, reasoning_effort: 'low', chat_template_kwargs: { enable_thinking: false }, max_tokens: 4400 });
    expect(JSON.stringify(body.messages)).toContain('FULL TEXT OF SOURCE');
  });

  it('leaves out a full text over the token budget', async () => {
    const gw = gateway(() => sse([{ choices: [{ delta: { content: 'ok' }, finish_reason: 'stop' }] }]));
    const long = { ...source, fullText: 'word '.repeat(40000) };
    const response = await createHandler()(await signed('/api/chat', { json: { passage: 'p', source: long } }), env({}, gw));
    const start = JSON.parse((await response.text()).split('\n\n')[0].slice(6));
    expect(start).toMatchObject({ type: 'start', fullText: false });
    expect(JSON.stringify(gw.calls.find(c => c.path === '/v1/chat/completions')!.body!.messages)).not.toContain('FULL TEXT OF SOURCE');
  });

  it('returns quota exhaustion as a JSON error before streaming', async () => {
    const gw = gateway(() => quotaExceededResponse({ retryAfterSeconds: 3600 }));
    const response = await createHandler()(await signed('/api/chat', { json: { passage: 'p', source } }), env({}, gw));
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('quota_exceeded');
    expect(response.headers.get('x-should-retry')).toBe('false');
  });

  it('passes a Gateway sign-in failure to the page with the launch path', async () => {
    const gw = gateway(() => cailErrorResponse(401, { error: { code: 'session_invalid', message: 'Sign in again.', type: 'authentication_error', param: null } }));
    const response = await createHandler()(await signed('/api/chat', { json: { passage: 'p', source } }), env({}, gw));
    expect(response.status).toBe(401);
    expect((await response.json()).error).toMatchObject({ code: 'session_invalid', launch: '/launch/marginalia' });
  });

  it('reports an empty length-limited reply as an error, not success', async () => {
    const gw = gateway(() => sse([{ choices: [{ delta: { reasoning_content: 'hmm' }, finish_reason: 'length' }] }, '[DONE]']));
    const response = await createHandler()(await signed('/api/chat', { json: { passage: 'p', source } }), env({}, gw));
    const events = (await response.text()).split('\n\n').filter(Boolean).map(block => JSON.parse(block.slice(6)));
    expect(events.find(e => e.type === 'error')).toMatchObject({ code: 'model_output_limit' });
  });

  it('surfaces an error object inside the stream', async () => {
    const gw = gateway(() => sse([{ choices: [{ delta: { content: 'Par' } }] }, { error: { code: 'upstream_unavailable', message: 'The model provider is unavailable.' } }]));
    const response = await createHandler()(await signed('/api/chat', { json: { passage: 'p', source } }), env({}, gw));
    const events = (await response.text()).split('\n\n').filter(Boolean).map(block => JSON.parse(block.slice(6)));
    expect(events.find(e => e.type === 'error')).toMatchObject({ code: 'upstream_unavailable', error: 'The model provider is unavailable.' });
  });

  it('keeps only known sources from the relevance check', async () => {
    const reply = '[{"sourceId":"carlyle","type":"challenges","angle":"mechanism versus dynamism"},{"sourceId":"ghost","type":"affirms","angle":"x"}]';
    const gw = gateway(() => Response.json({ choices: [{ message: { content: `Here: ${reply}` }, finish_reason: 'stop' }] }));
    const response = await createHandler()(await signed('/api/prefilter', { json: { passage: 'p', sources: [{ ...source, fullText: undefined }] } }), env({}, gw));
    expect(await response.json()).toEqual({
      engagements: [{ sourceId: 'carlyle', type: 'challenges', angle: 'mechanism versus dynamism' }],
      engagedSourceIds: ['carlyle'],
    });
    expect(gw.calls.find(c => c.path === '/v1/chat/completions')!.body).toMatchObject({ max_tokens: 4800, temperature: 0 });
  });

  it('extracts a source profile', async () => {
    const profile = { title: 'Signs of the Times', author: 'Thomas Carlyle', year: '1829', coreCommitments: 'c', antagonists: 'a', characteristicMoves: 'm', vocabulary: ['Machinery'], triggers: 't', voiceSamples: ['q'] };
    const gw = gateway(() => Response.json({ choices: [{ message: { content: JSON.stringify(profile) }, finish_reason: 'stop' }] }));
    const response = await createHandler()(await signed('/api/extract-identity', { json: { text: source.fullText, title: 'x' } }), env({}, gw));
    const body = await response.json();
    expect(body.metadata).toEqual({ title: 'Signs of the Times', author: 'Thomas Carlyle', year: '1829' });
    expect(body.identityLayer.raw).toContain('CORE COMMITMENTS:\nc');
  });
});

describe('shares and assets', () => {
  const bundle = {
    workspace: { name: 'Minds and Machines' },
    papers: [{ title: 'Signs', author: 'Carlyle', type: 'article', fullText: 'Text.', paragraphs: [{ type: 'body', content: 'Text.' }] }],
  };

  it('stores a share and reads it back until it expires', async () => {
    let now = Date.UTC(2026, 10, 17);
    const store = r2();
    const handler = createHandler({ now: () => now });
    const created = await (await handler(await signed('/api/share', { json: bundle }), env({ SHARES: store.bucket }))).json();
    expect(created.url).toMatch(new RegExp(`^${ORIGIN}/marginalia/share/\\?id=[A-Za-z0-9_-]{20}$`));
    const read = await handler(await signed(`/api/share?id=${created.shareId}`), env({ SHARES: store.bucket }));
    expect(await read.json()).toMatchObject({ version: 1, workspace: { name: 'Minds and Machines' } });
    now += 31 * 86400_000;
    const expired = await handler(await signed(`/api/share?id=${created.shareId}`), env({ SHARES: store.bucket }));
    expect(expired.status).toBe(404);
  });

  it('serves pages with a hash-based script policy', async () => {
    const response = await createHandler()(await signed('/library/'), env());
    const csp = response.headers.get('content-security-policy')!;
    expect(csp).toContain(`script-src 'self' ${HASH}`);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('does not serve the CSP manifest or unknown API paths as assets', async () => {
    const handler = createHandler();
    expect((await handler(await signed('/_marginalia/csp.json'), env())).status).toBe(404);
    expect((await handler(await signed('/api/nope'), env())).status).toBe(404);
  });
});
