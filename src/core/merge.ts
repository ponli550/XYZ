// Merging a fresh sweep into what is already on screen.
//
// This is where an ambient agent usually goes wrong. The watcher re-runs every
// couple of minutes and re-derives the same findings, so a naive "replace the
// list" would resurrect dismissed cards, reset confidence that had climbed, and
// re-notify about things the human already dealt with. All three read as the
// agent not listening.
//
// The rule: the human's decision outranks the watcher, always. A finding the
// human touched is never overwritten — it can only be re-opened, and only by
// its own watch condition (see #9).

import type { Escalation } from './escalation.ts';
import { corroborate } from './escalation.ts';

/** States that represent a human decision. The watcher may not overwrite these. */
const HUMAN_OWNED = new Set(['approved', 'dismissed', 'verified']);

export interface MergeResult {
  escalations: Escalation[];
  /** Ids that are newly surfaced this sweep — what deserves a notification. */
  fresh: string[];
}

export function merge(existing: Escalation[], incoming: Escalation[]): MergeResult {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const fresh: string[] = [];

  for (const next of incoming) {
    const prev = byId.get(next.id);

    if (!prev) {
      byId.set(next.id, next);
      fresh.push(next.id);
      continue;
    }

    if (HUMAN_OWNED.has(prev.state)) continue;   // the human already spoke

    // Same finding, seen again: fold in any evidence we did not have, which is
    // what moves confidence. Re-deriving the same sources must be a no-op, not
    // a confidence bump — that would be progress theatre.
    const seen = new Set(prev.evidence.map((s) => `${s.system}|${s.excerpt}`));
    let merged = prev;
    for (const s of next.evidence) {
      if (seen.has(`${s.system}|${s.excerpt}`)) continue;
      merged = corroborate(merged, s, `corroborated by ${s.system}`);
    }

    // A finding that was only suspected and has now been drafted becomes
    // actionable, so it surfaces for the first time.
    if (merged.state !== 'proposed' && next.state === 'proposed' && next.proposal) {
      merged = { ...merged, state: 'proposed', proposal: next.proposal, claim: next.claim };
      fresh.push(merged.id);
    }

    byId.set(merged.id, merged);
  }

  return { escalations: [...byId.values()], fresh };
}
