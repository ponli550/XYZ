// Dismissal is not deletion.
//
// "I already told you about this" is the single fastest way for an ambient
// agent to become noise, so merge.ts refuses to resurrect a dismissed card.
// But the opposite failure is just as bad: a finding the human parked for a
// reason, whose reason has since expired, silently never comes back.
//
// So a dismissal carries a CONDITION. The watcher evaluates it every sweep for
// free, and re-opens the card only when the world actually changed — never on
// a timer, never because the agent forgot.

import type { Escalation, Watch, WatchCheck } from './escalation.ts';
import { transition } from './escalation.ts';
import type { Snapshot } from './heuristics.ts';

export function expired(w: Watch, now: number): boolean {
  return Date.parse(w.until) <= now;
}

/** Did the condition this dismissal was waiting on actually occur? */
export function fired(check: WatchCheck, snapshots: Snapshot[]): boolean {
  if (check.kind === 'fieldChanged') {
    const s = snapshots.find((x) => x.key === check.ticketKey);
    if (!s) return false;
    const current = check.field === 'state' ? s.state
      : check.field === 'assignees' ? s.assignees.join(',')
      : check.field === 'labels' ? s.labels.join(',')
      : null;
    return current !== null && current !== check.from;
  }
  // newSourceAfter: something arrived from that system after the dismissal.
  return false;
}

export interface ReopenResult {
  escalations: Escalation[];
  reopened: string[];
}

/**
 * Re-opens dismissed findings whose condition fired, and lets expired watches
 * lapse quietly. A lapsed watch is NOT a re-open — if the condition never
 * happened, the human was right to dismiss it and should not hear about it
 * again.
 */
export function evaluateWatches(
  escalations: Escalation[],
  snapshots: Snapshot[],
  now = Date.now(),
): ReopenResult {
  const reopened: string[] = [];
  const out = escalations.map((e) => {
    if (e.state !== 'dismissed' || !e.watch) return e;

    if (expired(e.watch, now)) {
      // Drop the watch, keep the dismissal. Silence is the correct outcome.
      return { ...e, watch: undefined };
    }

    if (!fired(e.watch.check, snapshots)) return e;

    reopened.push(e.id);
    // transition() reads `watch: undefined` as "leave unchanged", so the watch
    // is stripped afterwards. A re-opened finding must not carry a condition
    // that could fire it a second time.
    const { watch: _spent, ...rest } = transition(e, 'reopened', `watch fired: ${e.watch.condition}`);
    return rest;
  });
  return { escalations: out, reopened };
}
