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
  /** Ids dropped because their rule no longer fires. */
  retired: string[];
}

/** States the agent owns. A human decision is never retired behind their back. */
const AGENT_OWNED = new Set(['suspected', 'corroborating', 'confirmed', 'proposed', 'reopened']);

/**
 * @param liveIds ids the CURRENT sweep derived, as `key:rule`. Pass undefined
 *   when the caller cannot enumerate them (a partial or degraded sweep), and
 *   nothing is retired — retiring on incomplete information would erase real
 *   findings every time GitHub hiccuped.
 */
export function merge(existing: Escalation[], incoming: Escalation[],
                      liveIds?: Set<string>): MergeResult {
  const byId = new Map(existing.map((e) => [e.id, e]));
  const fresh: string[] = [];
  const retired: string[] = [];

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

  // A finding that has stopped being true must leave. merge() only ever added
  // and updated, so a card whose rule no longer fires stayed on screen forever
  // — the exact inverse of the dismissal problem, and only one half was built.
  // A stale card is a false card, and a false card is what makes people switch
  // the agent off.
  if (liveIds) {
    for (const [id, e] of byId) {
      if (!AGENT_OWNED.has(e.state)) continue;   // never retire a human decision
      if (liveIds.has(id)) continue;
      byId.delete(id);
      retired.push(id);
    }
  }

  return { escalations: [...byId.values()], fresh, retired };
}
