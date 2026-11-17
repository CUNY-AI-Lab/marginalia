// Local stand-in for Doorway, for development only: `npm run local`, then open
// http://localhost:8790/marginalia/. It runs the real Worker handler in Node, signs both identity
// legs with a throwaway test key, serves the exported app from out/, keeps shares in memory, and
// answers model calls from a canned Gateway, so nothing here spends or reaches CAIL services.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { CAIL_CANONICAL_ISSUER } from '@cuny-ai-lab/cail-identity';
import { TEST_SUBJECTS, createTestIdentityIssuer } from '@cuny-ai-lab/cail-identity/testing';
import { quotaSnapshotBody } from '@cuny-ai-lab/cail-client/testing';
import catalog from '../worker/fixtures/catalog-2026-11-17.json' with { type: 'json' };
import { createHandler, type Env } from '../worker/index.ts';

const PORT = Number(process.env.PORT ?? 8790);
const ORIGIN = 'https://tools.ailab.gc.cuny.edu';
const OUT = join(process.cwd(), 'out');
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript',
  '.css': 'text/css', '.json': 'application/json', '.txt': 'text/plain', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.png': 'image/png', '.woff2': 'font/woff2',
};

const issuer = await createTestIdentityIssuer({ issuer: CAIL_CANONICAL_ISSUER });
let usedMicro = 120_000;

async function serveAsset(path: string): Promise<Response> {
  const candidates = path.endsWith('/') ? [`${path}index.html`] : extname(path) ? [path] : [`${path}/index.html`, `${path}.html`];
  for (const candidate of candidates) {
    const file = normalize(join(OUT, candidate));
    if (!file.startsWith(OUT)) break;
    try {
      return new Response(await readFile(file), { headers: { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' } });
    } catch {
      // try the next candidate
    }
  }
  try {
    return new Response(await readFile(join(OUT, '404.html')), { status: 404, headers: { 'content-type': TYPES['.html'] } });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function cannedComment(system: string): string {
  const title = system.match(/You are analyzing "([^"]+)"/)?.[1] ?? 'This text';
  return `*${title}* would press on this passage (canned local reply; no model was called). It insists that "the dynamical" matters as much as "the mechanical."`;
}

async function fakeGateway(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.pathname === '/v1/catalog') return Response.json(catalog);
  if (url.pathname === '/v1/quota') {
    const limit = 5_000_000;
    return Response.json(quotaSnapshotBody({ limit, estimated_used: usedMicro, estimated_remaining: limit - usedMicro, used_percent: Math.round((usedMicro / limit) * 100), remaining_percent: 100 - Math.round((usedMicro / limit) * 100) }));
  }
  if (url.pathname !== '/v1/chat/completions') return new Response('not found', { status: 404 });
  const body = (await request.json()) as { stream?: boolean; messages: Array<{ role: string; content: string }> };
  usedMicro += 4000;
  const system = body.messages.find(m => m.role === 'system')?.content ?? '';
  const user = body.messages.find(m => m.role === 'user')?.content ?? '';
  if (body.stream) {
    const words = cannedComment(system).split(/(?<= )/);
    const encoder = new TextEncoder();
    return new Response(
      new ReadableStream({
        async start(controller) {
          for (const word of words) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: word } }] })}\n\n`));
            await sleep(25);
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`));
          controller.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  }
  let content: string;
  if (user.includes('TEXT TO ANALYZE')) {
    const title = user.match(/Title: (.*)/)?.[1] ?? 'Untitled';
    content = JSON.stringify({ title, author: 'Local Author', year: null, coreCommitments: 'Canned profile.', antagonists: 'None.', characteristicMoves: 'None.', vocabulary: ['canned'], triggers: 'Anything.', voiceSamples: [] });
  } else {
    const ids = [...user.matchAll(/^- ([^:\s]+):/gm)].map(m => m[1]);
    const types = ['challenges', 'extends', 'complicates', 'evidence'];
    content = JSON.stringify(ids.map((sourceId, i) => ({ sourceId, type: types[i % types.length], angle: 'canned local engagement' })));
  }
  await sleep(300);
  return Response.json({ choices: [{ message: { content }, finish_reason: 'stop' }] });
}

const shares = new Map<string, { text: string; customMetadata: Record<string, string>; uploaded: Date }>();
const env: Env = {
  ASSETS: { fetch: async (input: RequestInfo | URL) => serveAsset(new URL(input instanceof Request ? input.url : String(input)).pathname) } as unknown as Fetcher,
  GATEWAY: { fetch: fakeGateway } as unknown as Fetcher,
  SHARES: {
    async put(key: string, value: string, options: { customMetadata?: Record<string, string> }) {
      shares.set(key, { text: value, customMetadata: options.customMetadata ?? {}, uploaded: new Date() });
    },
    async get(key: string) {
      const object = shares.get(key);
      return object ? { body: new Response(object.text).body, customMetadata: object.customMetadata, uploaded: object.uploaded } : null;
    },
  } as unknown as R2Bucket,
  CAIL_IDENTITY_JWKS: issuer.jwksJson,
  CAIL_IDENTITY_ISSUER: CAIL_CANONICAL_ISSUER,
  CF_VERSION_METADATA: { id: 'local', tag: 'local' },
};
const handle = createHandler();

createServer(async (req, res) => {
  const path = req.url ?? '/';
  if (path === '/' || path.startsWith('/launch/marginalia')) {
    res.writeHead(302, { location: '/marginalia/' }).end();
    return;
  }
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) if (typeof value === 'string') headers.set(name, value);
  // Doorway's job: strip caller identity, then attach freshly signed legs for this person.
  headers.delete('cookie');
  headers.set('x-cail-identity-jwt', await issuer.mintIdentityJwt({ audience: 'cail:marginalia', subject: TEST_SUBJECTS.alice }));
  headers.set('x-cail-gateway-identity-jwt', await issuer.mintIdentityJwt({ audience: 'cail:gateway', subject: TEST_SUBJECTS.alice }));
  if (headers.get('origin') === `http://localhost:${PORT}`) headers.set('origin', ORIGIN);
  const controller = new AbortController();
  res.on('close', () => controller.abort());
  const response = await handle(
    new Request(`${ORIGIN}${path}`, { method: req.method, headers, body: chunks.length ? Buffer.concat(chunks) : undefined, signal: controller.signal }),
    env,
  );
  const outHeaders: Record<string, string> = {};
  response.headers.forEach((value, name) => {
    outHeaders[name] = name === 'location' ? value.replace(ORIGIN, '') : value;
  });
  res.writeHead(response.status, outHeaders);
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}).listen(PORT, () => console.log(`Local Doorway: http://localhost:${PORT}/marginalia/ (test identity, canned Gateway)`));
