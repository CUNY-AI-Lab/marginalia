# Deploying Marginalia

Marginalia is deployed receiver first. The receiver is the private `cail-marginalia` Cloudflare
Worker from this repository. Doorway (`CUNY-AI-Lab/cail-tools-admission`) then mounts it at
`/marginalia/` through its required `MARGINALIA` service binding. Doorway's release fails if the
Worker does not exist, so release this Worker first.

Names only below. Never put secret values in source, logs or comments.

## Contract with Doorway

| Item | Value |
| --- | --- |
| Worker | `cail-marginalia` (no workers.dev, no previews, no routes) |
| Doorway binding | `MARGINALIA → cail-marginalia` |
| Mount and landing | `/marginalia`, `/marginalia/` |
| Launch path | `/launch/marginalia` |
| Routes | `marginalia-page` (`/marginalia`) and `marginalia-api` (`/marginalia/api`), both authenticated, audience `cail:marginalia`, both with the `cail:gateway` leg |
| Readiness | `GET /marginalia/health` (no identity; Doorway still authenticates it publicly) |

Spend is person-funded. Gateway reports it as `unattributed`, because the Gateway leg names no tool.

## 1. Receiver release (this repository)

### GitHub `production` environment

| Name | Kind | Used by |
| --- | --- | --- |
| `CLOUDFLARE_API_TOKEN` | secret | `wrangler deploy` and release readback. Account-owned token "marginalia deploy (GitHub Actions, CUNY-AI-Lab/marginalia)": Individual Workers Editor on `cail-marginalia` only, expires 2027-11-17 |
| `CLOUDFLARE_ACCOUNT_ID` | secret | same; must be the account that holds `cail-doorway` and `cail-model-api`, since service bindings resolve only within one account |
| `CAIL_IDENTITY_JWKS` | secret | validated for `cail:marginalia` and `cail:gateway`, then installed on the Worker. It must be the fleet's pinned verifier key set, the one Doorway signs with (published at `https://tools.ailab.gc.cuny.edu/cail-sso/.well-known/jwks.json`) |

The `@cuny-ai-lab/*` packages install from public npm (see `.npmrc`); no package token is needed.

### Pinned configuration (`wrangler.toml`, asserted by `scripts/verify-release.mjs`)

- `name = "cail-marginalia"`, `workers_dev = false`, `preview_urls = false`.
- `compatibility_date = "2026-11-01"`, `compatibility_flags = ["enable_request_signal"]`.
- `[assets] directory = "./out"`, `binding = "ASSETS"`, `run_worker_first = true`.
- `[vars] CAIL_IDENTITY_ISSUER = "https://tools.ailab.gc.cuny.edu/cail-sso"`.
- `[[services]] GATEWAY → cail-model-api`. Every Gateway call (chat, quota, catalog) goes through
  it. A global `fetch()` to `https://tools.ailab.gc.cuny.edu/v1/...` from a Worker in the same zone
  reaches the zone origin and returns 404 (the Bibliography outage of 2026-11-09).
- `[[r2_buckets]] SHARES → cail-marginalia-shares`, whose lifecycle rule deletes `shares/` objects
  after 30 days (`scripts/ensure-shares-bucket.mjs` creates the bucket and sets the rule).

### Steps

1. Merge to `main` and wait for the workflow's `check` job.
2. Run **Check and private release** with the exact current `main` SHA:
   `gh workflow run release.yml --repo CUNY-AI-Lab/marginalia -f sha=$(git rev-parse origin/main)`.
3. The release job rejects a stale SHA, builds, deploys with the commit as the version tag, and reads
   back bindings, runtime settings and disabled ingress.

The shares bucket and its 30-day rule are one-time setup, done on 2026-11-17. The release token
cannot change R2; to recreate them, run `node scripts/ensure-shares-bucket.mjs` with an R2-admin
token, or `wrangler r2 bucket create` and `wrangler r2 bucket lifecycle add` from a signed-in
operator machine.

## 2. Doorway mount

Open the Doorway mount PR only after step 1 succeeds. Doorway's release script checks the binding
and probes `/marginalia/`, `/marginalia/api/session` and `/marginalia/health` anonymously.

## 3. Acceptance still required after each release

The control-plane readback does not exercise the service binding or a real person. After the mount
is live, record:

- An ordinary member's CUNY Login launch reaching `/marginalia/`.
- `/marginalia/health` answering `ready` with the new version ID through Doorway.
- A demo set opened, a passage selected, and at least two sources commenting (real model calls).
- The header allowance moving after those calls, and the same movement on the Lab's usage page.
- A PDF upload, a share link created and imported in another browser profile.
- Anonymous `/marginalia/api/session` answering 401 with `launch: /launch/marginalia`.
