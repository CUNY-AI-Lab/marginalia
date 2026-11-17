// The one model Marginalia uses, and per-call output controls from its catalog row.
// The catalog is public and caller-independent; it never authorizes a model.
// Gateway re-checks access and quota on every call.
import type { CailModelCatalogEntry } from '@cuny-ai-lab/cail-client';

// DeepSeek V4.1 Flash: 1M-token context on Workers AI, so whole sources fit in one call.
export const MODEL = 'deepseek-v4.1-flash-1017';

export function usableRow(row: CailModelCatalogEntry | undefined): row is CailModelCatalogEntry {
  return !!row && row.status !== 'retiring' && row.modality === 'text' && row.capabilities.includes('text-generation');
}

// Reasoning is billed as output. LanGames measured (2026-09-20) that 4,000 tokens of headroom let
// every recommended reasoning model answer, while a larger budget let one reason past a two-minute
// timeout. Workers AI defaults max_tokens to 256 when omitted, so it is always sent.
const REASONING_HEADROOM_TOKENS = 4000;
const REASONING_MAX_TOKENS = 10000;

export type OutputKind = 'identity' | 'prefilter' | 'brief' | 'normal';
const EXPECTED_OUTPUT: Record<OutputKind, number> = {
  identity: 3000,
  prefilter: 800,
  brief: 400,
  normal: 1200,
};

export function outputControls(row: CailModelCatalogEntry, kind: OutputKind): Record<string, unknown> {
  const expected = EXPECTED_OUTPUT[kind];
  const contextCap =
    Number.isInteger(row.context_length) && (row.context_length ?? 0) > 0
      ? Math.floor((row.context_length as number) / 4)
      : Infinity;
  if (row.capabilities.includes('reasoning')) {
    // reasoning_effort is rejected by non-reasoning models, so it is sent only on the catalog's
    // say-so; enable_thinking is a Workers AI chat-template switch.
    return {
      max_tokens: Math.min(REASONING_HEADROOM_TOKENS + expected, REASONING_MAX_TOKENS, contextCap),
      reasoning_effort: 'low',
      ...(row.provider === 'workers-ai' ? { chat_template_kwargs: { enable_thinking: false } } : {}),
    };
  }
  return { max_tokens: Math.min(expected * 2, contextCap) };
}

// Rough token estimate (about four characters per token for English prose).
export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

// How much of a source's full text may accompany one chat call. Above this the source speaks from
// its identity layer alone. At the catalog's $0.30 per million input tokens (2026-11-17), the cap
// keeps one comment from one source near a cent, so a book cannot drain a person's allowance.
export const FULL_TEXT_TOKEN_BUDGET = 40000;
export function fullTextBudget(row: CailModelCatalogEntry): number {
  const half = row.context_length ? Math.floor(row.context_length / 2) : 16000;
  return Math.min(FULL_TEXT_TOKEN_BUDGET, half);
}
