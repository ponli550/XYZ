// The one contract both tracks compile against.
//
// An Escalation is an ARTIFACT, not a chat message. It is written by the
// watcher, appended to across polls, and rendered in-page. Governance rides
// the artifact — the history[] below is what makes the agent's progression
// inspectable rather than asserted.

export type EscalationState =
  | 'suspected'      // one weak signal, below the surfacing threshold
  | 'corroborating'  // a second source agrees, still gathering
  | 'confirmed'      // enough evidence to act on
  | 'proposed'       // shown to the human with a concrete action
  | 'approved'       // human said yes, write in flight
  | 'dismissed'      // human said no — parked with a watch, NOT deleted
  | 'verified'       // the write landed and was read back
  | 'reopened';      // a dismissal's watch condition fired

export type Severity = 'conflict' | 'stale' | 'duplicate' | 'external';

export type SourceSystem = 'slack' | 'calendar' | 'jira' | 'exa';

export interface Source {
  system: SourceSystem;
  url: string;
  excerpt: string;
  at: string;          // ISO — displayed; "Thursday 16:02" is the whole argument
}

export type Action =
  // The agent's ONLY write capabilities. Everything else is read-only, by
  // construction rather than by prompt. Adding to this union is a deliberate
  // act, which is the point.
  | { kind: 'comment'; ticketKey: string; body: string }
  | { kind: 'transition'; ticketKey: string; to: string };

export interface Transition {
  from: EscalationState;
  to: EscalationState;
  at: string;
  why: string;         // renders as the timeline row
  confidence: number;
}

export interface Watch {
  condition: string;   // human-readable; evaluated by heuristics, not the model
  check: WatchCheck;
  until: string;       // ISO — watches expire, or dismissals become nagging
}

export type WatchCheck =
  | { kind: 'fieldChanged'; ticketKey: string; field: string; from: string }
  | { kind: 'newSourceAfter'; system: SourceSystem; at: string };

export interface Escalation {
  id: string;
  ticketKey: string;
  state: EscalationState;
  severity: Severity;
  claim: string;
  evidence: Source[];          // appended across polls, never replaced
  confidence: number;          // recomputed each poll
  proposal: Action | null;     // null until 'confirmed'
  history: Transition[];
  watch?: Watch;
  detectedAt: string;
  detectedBy: 'ambient' | 'onOpen';
}

// ── state machine ────────────────────────────────────────────────────────────

const LEGAL: Record<EscalationState, readonly EscalationState[]> = {
  suspected:     ['corroborating', 'dismissed'],
  corroborating: ['confirmed', 'suspected', 'dismissed'],
  confirmed:     ['proposed', 'dismissed'],
  proposed:      ['approved', 'dismissed'],
  approved:      ['verified', 'proposed'],   // back to proposed if the write failed
  dismissed:     ['reopened'],
  verified:      [],                          // terminal
  reopened:      ['proposed', 'dismissed'],
};

export class IllegalTransition extends Error {
  constructor(from: EscalationState, to: EscalationState) {
    super(`illegal transition ${from} -> ${to}`);
  }
}

export function canTransition(from: EscalationState, to: EscalationState): boolean {
  return LEGAL[from].includes(to);
}

/** Returns a new Escalation; never mutates. Throws on an illegal move. */
export function transition(
  e: Escalation,
  to: EscalationState,
  why: string,
  opts: { confidence?: number; proposal?: Action | null; watch?: Watch } = {},
): Escalation {
  if (!canTransition(e.state, to)) throw new IllegalTransition(e.state, to);
  const confidence = opts.confidence ?? e.confidence;
  return {
    ...e,
    state: to,
    confidence,
    proposal: opts.proposal !== undefined ? opts.proposal : e.proposal,
    watch: opts.watch !== undefined ? opts.watch : e.watch,
    history: [
      ...e.history,
      { from: e.state, to, at: new Date().toISOString(), why, confidence },
    ],
  };
}

/** Adds a source and recomputes confidence. This is what "progressive" means. */
export function corroborate(e: Escalation, source: Source, why: string): Escalation {
  const evidence = [...e.evidence, source];
  const next = confidenceFor(evidence);
  const to: EscalationState =
    next >= CONFIRM_AT ? 'confirmed'
    : e.state === 'suspected' ? 'corroborating'
    : e.state;
  const withEvidence = { ...e, evidence };
  return to === e.state
    ? { ...withEvidence, confidence: next }
    : transition(withEvidence, to, why, { confidence: next });
}

// Independent sources agreeing is worth more than one source repeated, so
// confidence keys off DISTINCT systems. Three distinct systems is as certain
// as this agent is allowed to be — it never claims 1.0.
export const SURFACE_AT = 0.6;   // suppression floor: below this the human never sees it
export const CONFIRM_AT = 0.8;

const WEIGHT: Record<SourceSystem, number> = {
  jira: 0.4,      // the page itself — necessary, not sufficient
  slack: 0.35,
  calendar: 0.2,
  exa: 0.3,
};

export function confidenceFor(evidence: Source[]): number {
  const systems = new Set(evidence.map((s) => s.system));
  let c = 0;
  for (const s of systems) c += WEIGHT[s];
  return Math.min(0.95, Number(c.toFixed(2)));
}

export function isActionable(e: Escalation): boolean {
  return e.confidence >= SURFACE_AT && e.proposal !== null;
}
