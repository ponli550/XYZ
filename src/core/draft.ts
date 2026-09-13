// The model call. One per surviving candidate, and nothing else.
//
// The model is never asked whether a conflict exists — heuristics.ts already
// decided that. It is asked only to turn a candidate plus its evidence into
// two strings a human will read: the claim, and the comment we propose to post.
//
// Everything here is shaped by the budget. Small prompt, small output, strict
// JSON, one retry, and every call through guarded() so a refusal defers the
// work instead of silently dropping it.

import type { Candidate } from './heuristics.ts';
import type { Action, Escalation, Source } from './escalation.ts';
import { confidenceFor } from './escalation.ts';
import { BudgetGuard, guarded } from './budget.ts';

export interface Draft {
  claim: string;      // one sentence, present tense, states the contradiction
  comment: string;    // what we propose to post, in the user's voice
}

export interface ModelConfig {
  apiKey: string;
  model: string;            // switchable live from the panel — see #13
  baseUrl?: string;
  maxOutputTokens?: number;
}

const SYSTEM = `You write one-sentence findings for an agent that annotates GitHub issues.
A deterministic check has ALREADY established the contradiction — do not re-argue it,
do not hedge, do not speculate beyond the evidence given.
Reply with JSON only: {"claim": "...", "comment": "..."}
claim: one sentence, present tense, states what is wrong with the artifact.
comment: what to post on the issue. Plain, factual, under 200 characters, cites the
evidence date. No greeting, no sign-off, no emoji.`;

function brief(c: Candidate): string {
  const ev = c.evidence.map((e) => `- [${e.system}] ${e.excerpt} (${e.at})`).join('\n');
  return `Artifact: ${c.key}\nCheck that fired: ${c.rule}\nEvidence:\n${ev}`;
}

/** Strict parse. A model that ignores the JSON instruction is a failed draft,
 *  not a partial one — we never post prose we could not parse. */
export function parseDraft(raw: string): Draft | null {
  const json = raw.match(/\{[\s\S]*\}/)?.[0];
  if (!json) return null;
  try {
    const d = JSON.parse(json) as Partial<Draft>;
    if (typeof d.claim !== 'string' || typeof d.comment !== 'string') return null;
    const claim = d.claim.trim();
    const comment = d.comment.trim();
    if (!claim || !comment || comment.length > 400) return null;
    return { claim, comment };
  } catch {
    return null;
  }
}

export async function callModel(cfg: ModelConfig, c: Candidate): Promise<Draft> {
  const res = await fetch(`${cfg.baseUrl ?? 'https://openrouter.ai/api/v1'}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: cfg.maxOutputTokens ?? 220,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: brief(c) },
      ],
    }),
  });

  // A refusal must reach guarded() as an Error whose message still reads as a
  // refusal — that is how the budget window gets recorded rather than lost.
  if (!res.ok) {
    throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
  }

  const body = await res.json() as { choices?: { message?: { content?: string } }[] };
  const raw = body.choices?.[0]?.message?.content ?? '';
  const draft = parseDraft(raw);
  if (!draft) throw new Error(`unparseable draft: ${raw.slice(0, 120)}`);
  return draft;
}

export interface DraftOutcome {
  escalation: Escalation | null;
  deferred: boolean;
  until?: number;
}

/**
 * Candidate -> Escalation. On a deferred result the candidate is parked and
 * NOTHING is emitted: an Escalation without a drafted proposal would show the
 * human a card with no action, which is worse than showing nothing.
 */
export async function draftEscalation(
  guard: BudgetGuard<Candidate>,
  cfg: ModelConfig,
  c: Candidate,
  now = () => new Date().toISOString(),
): Promise<DraftOutcome> {
  const r = await guarded(guard, c, (work) => callModel(cfg, work));
  if (!r.ok) return { escalation: null, deferred: true, until: r.until };

  const at = now();
  const confidence = Math.max(c.prior, confidenceFor(c.evidence));
  const proposal: Action = { kind: 'comment', ticketKey: c.key, body: r.value.comment };

  return {
    escalation: {
      id: `${c.key}:${c.rule}`,          // stable: the same finding never duplicates
      ticketKey: c.key,
      state: 'proposed',
      severity: c.severity,
      claim: r.value.claim,
      evidence: c.evidence as Source[],
      confidence,
      proposal,
      history: [
        { from: 'confirmed', to: 'proposed', at, why: c.rule, confidence },
      ],
      detectedAt: at,
      detectedBy: 'ambient',
    },
    deferred: false,
  };
}
