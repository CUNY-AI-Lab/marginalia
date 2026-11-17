# Marginalia

A reading assistant that turns documents into conversational agents. Upload PDFs or texts, and each source becomes an AI agent that responds from its own perspective when you select passages.

## How It Works

1. **Upload documents** - Add PDFs or paste text as sources
2. **Identity extraction** - The system extracts each source's core commitments, vocabulary, and argumentative style
3. **Read and select** - Browse your documents and select passages of interest
4. **Agent responses** - Relevant sources respond from their own perspectives, not as neutral summaries

The interface implements a "moderated seminar" where your sources can participate in discussion while you read or write.

## Where it runs

Marginalia is a CUNY AI Lab tool at `https://tools.ailab.gc.cuny.edu/marginalia/`, behind CUNY
Login. It is a static Next.js export served by a private Cloudflare Worker, `cail-marginalia`,
which [Doorway](https://github.com/CUNY-AI-Lab/cail-tools-admission) mounts through a service
binding. The Worker has no public hostname.

- **Sign-in and access.** Doorway signs the person in, checks current Lab membership, and forwards
  two identity tokens: one for `cail:marginalia` and one for `cail:gateway`. The Worker verifies
  both with `@cuny-ai-lab/cail-identity` and forwards only the Gateway token.
- **Models.** Every model call goes to the CAIL Gateway through the `GATEWAY → cail-model-api`
  service binding, using `@cuny-ai-lab/cail-client`. The model is `deepseek-v4.1-flash-1017`
  (1M-token context). There are no provider keys in this app.
- **Allowance.** Calls are charged to the signed-in person's Lab allowance. The header shows the
  Gateway's delayed estimate from `/v1/quota`; the Gateway enforces the limit. A source's full text
  is sent with a comment only when it is under 40,000 tokens; longer sources speak from their
  profile alone, so one comment from one source costs about a cent or less.
- **Data.** The library, workspaces and conversations live in the browser's `localStorage`. PDFs
  are parsed in the browser with pdf.js and never uploaded. Shared workspaces are stored in the
  R2 bucket `cail-marginalia-shares`, readable by any signed-in CUNY member with the link, and
  deleted after 30 days.
- **Demo sets.** `public/demo/` holds three public-domain reading sets with source profiles
  already written, so a first visit can start reading without uploading anything. See
  `public/demo/SOURCES.md`.

## Development

```bash
npm ci
npm run local      # build, then serve http://localhost:8790/marginalia/
```

`npm run local` runs the real Worker in Node behind a stand-in for Doorway: it signs identity
tokens with a throwaway test key, answers model calls with canned text, and keeps shares in
memory. Nothing it does reaches CAIL services or spends an allowance.

```bash
npm run check      # lint, typecheck (app and Worker), tests, static build, Worker dry-run
```

The Worker tests use the real identity verifier with tokens from
`@cuny-ai-lab/cail-identity/testing` and the real CAIL client against a controlled Gateway. Global
`fetch()` answers 404 in tests, as the zone origin does for a Worker that bypasses the binding.

## Release

See [docs/DEPLOY.md](docs/DEPLOY.md). In short: the **Check and private release** workflow,
dispatched from `main` with the exact commit SHA, ensures the shares bucket, deploys the Worker
with the pinned identity key set, and reads the configuration back from Cloudflare. Doorway's
mount is released separately, after the Worker exists.

## Project structure

```
worker/                 Cloudflare Worker: identity, Gateway calls, shares, static assets
src/app/                Next.js pages (reader, library, workspaces, share import)
src/components/         React components, including the allowance meter and demo sets
src/lib/prompts.ts      Prompt templates shared by the Worker
src/lib/pdf.ts          In-browser PDF text and structure extraction
public/demo/            Built-in demo reading sets
scripts/                Build helpers, local Doorway stand-in, release scripts
```

## License

Copyright © 2025–2026 CUNY AI Lab, The Graduate Center, City University of New York.

This software is licensed under the [GNU Affero General Public License v3.0 or later](LICENSE) (AGPL-3.0-or-later). You may use, study, change, and share it, including for commercial purposes. If you distribute a modified version, or run one as a network service that other people use, you must make its complete source code available to them under the same license.

This license applies to every version of this repository, including earlier commits. Copies obtained before November 10, 2026 under the MIT License may still be used under that license, because earlier license grants cannot be withdrawn.

Questions about licensing: [ailab@gc.cuny.edu](mailto:ailab@gc.cuny.edu). See CAIL's [licensing page](https://ailab.gc.cuny.edu/license/).
