// Read-only control-plane verification after `wrangler deploy`. It does not exercise the private
// service binding or a signed-in member; those acceptance checks are separate (docs/DEPLOY.md).
import assert from 'node:assert/strict';
import { cf } from './cloudflare.mjs';

const sha = process.env.RELEASE_SHA || '';
assert(/^[0-9a-f]{40}$/.test(sha), 'RELEASE_SHA must be a full commit SHA');
const script = '/workers/scripts/cail-marginalia';
const { deployments } = await cf(`${script}/deployments`);
const latest = deployments[0];
assert(latest?.versions.length === 1 && latest.versions[0].percentage === 100, 'Latest deployment must serve one version at 100%');
const version = await cf(`${script}/versions/${latest.versions[0].version_id}`);
const bindings = version.resources.bindings;
const has = (name, predicate) => assert(bindings.some(b => b.name === name && predicate(b)), `Binding ${name} is missing or wrong`);
assert(version.annotations?.['workers/tag'] === sha && version.annotations?.['workers/message'] === `commit ${sha}`, 'Deployed version metadata is not the requested commit');
has('CF_VERSION_METADATA', b => b.type === 'version_metadata');
has('CAIL_IDENTITY_JWKS', b => b.type === 'secret_text');
has('CAIL_IDENTITY_ISSUER', b => b.text === 'https://tools.ailab.gc.cuny.edu/cail-sso');
has('ASSETS', b => b.type === 'assets');
// Same-zone global fetch() to the Gateway URL reaches the zone origin (404); only this binding works.
has('GATEWAY', b => b.type === 'service' && b.service === 'cail-model-api');
has('SHARES', b => b.type === 'r2_bucket' && b.bucket_name === 'cail-marginalia-shares');
assert(version.resources.script_runtime.compatibility_date === '2026-11-01', 'Unexpected compatibility date');
assert(JSON.stringify(version.resources.script_runtime.compatibility_flags) === JSON.stringify(['enable_request_signal']), 'Unexpected compatibility flags');
const subdomain = await cf(`${script}/subdomain`);
assert(subdomain.enabled === false && subdomain.previews_enabled === false, 'workers.dev and previews must be disabled');
assert((await cf(`${script}/deployments`)).deployments[0].id === latest.id, 'Deployment changed during verification');
console.log(`Control-plane readback passed: commit ${sha}, version ${version.id}, 100% traffic. Private runtime and member acceptance remain pending.`);
