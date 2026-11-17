// Minimal Cloudflare API reader for release scripts. Never prints the token or response bodies.
import assert from 'node:assert/strict';

const { CLOUDFLARE_ACCOUNT_ID: account, CLOUDFLARE_API_TOKEN: token } = process.env;
assert(account && token, 'CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required');
export const accountBase = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}`;

export async function cf(path, { method = 'GET', body, allow404 = false } = {}) {
  const response = await fetch(`${accountBase}${path}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (allow404 && response.status === 404) return null;
  assert(response.ok, `Cloudflare ${method} ${path.replace(/\/[0-9a-f-]{32,}/g, '/…')} failed (${response.status})`);
  const data = await response.json();
  assert(data.success, `Cloudflare ${method} was unsuccessful`);
  return data.result;
}
