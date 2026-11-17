// Next.js inlines its hydration payload in <script> tags. The Worker allows exactly these scripts
// by SHA-256 hash instead of 'unsafe-inline', because tools.ailab.gc.cuny.edu carries every tool's
// session. Run after `next build`; writes out/_marginalia/csp.json.
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'out');
const htmlFiles = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (name.endsWith('.html')) htmlFiles.push(path);
  }
})(out);
if (!htmlFiles.length) throw new Error('No exported HTML found; run next build first.');

const hashes = new Set();
const inline = /<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/gi;
for (const file of htmlFiles) {
  for (const [, body] of readFileSync(file, 'utf8').matchAll(inline)) {
    if (!body) continue;
    hashes.add(`'sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}'`);
  }
}
mkdirSync(join(out, '_marginalia'), { recursive: true });
writeFileSync(join(out, '_marginalia', 'csp.json'), JSON.stringify({ scriptHashes: [...hashes].sort() }));
console.log(`CSP manifest: ${hashes.size} inline script hashes from ${htmlFiles.length} pages.`);
