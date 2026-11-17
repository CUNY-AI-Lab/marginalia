// One-time setup, run by an operator with an R2-admin credential (the release token is scoped to
// the cail-marginalia Worker only). Creates the shares bucket if it is missing and pins its
// lifecycle: objects under shares/ are deleted 30 days after upload (the Worker also refuses older
// shares on read). Idempotent.
import assert from 'node:assert/strict';
import { cf } from './cloudflare.mjs';

export const BUCKET = 'cail-marginalia-shares';
export const SHARE_RULE = {
  id: 'expire-shares-30d',
  enabled: true,
  conditions: { prefix: 'shares/' },
  deleteObjectsTransition: { condition: { type: 'Age', maxAge: 30 * 86400 } },
  abortMultipartUploadsTransition: { condition: { type: 'Age', maxAge: 86400 } },
};

if (!(await cf(`/r2/buckets/${BUCKET}`, { allow404: true }))) {
  await cf('/r2/buckets', { method: 'POST', body: { name: BUCKET } });
  console.log(`Created R2 bucket ${BUCKET}.`);
}
await cf(`/r2/buckets/${BUCKET}/lifecycle`, { method: 'PUT', body: { rules: [SHARE_RULE] } });
const { rules } = await cf(`/r2/buckets/${BUCKET}/lifecycle`);
const rule = rules.find(r => r.id === SHARE_RULE.id);
assert(rule?.enabled && rule.conditions?.prefix === 'shares/' && rule.deleteObjectsTransition?.condition?.maxAge === 30 * 86400, 'Share expiry rule did not read back');
console.log(`R2 bucket ${BUCKET}: 30-day share expiry rule read back.`);
