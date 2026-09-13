// Deterministic candidate detection. Zero tokens.
//
// The model is NEVER asked "is there a conflict?" — these checks answer that.
// The model is only asked to write the claim and the proposed comment for a
// candidate that already passed one of them. That is what keeps a ~$5 runtime
// budget viable across a whole day of polling, and it is the same rule the
// PR daemon used: handle what you can silently, escalate only what needs
// judgment.
//
// Every rule here is a claim about the WORLD, not about language, so it can be
// stated as a boolean and tested.

import type { Severity, Source } from './escalation.ts';

export interface Snapshot {
  key: string;                 // owner/repo#n
  kind: 'issue' | 'pull';
  state: 'open' | 'closed' | 'merged';
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  updatedAt: string;
  createdAt: string;
  /** PRs that reference this issue, with their own state. */
  linkedPulls: { number: number; state: 'open' | 'closed' | 'merged'; mergedAt: string | null }[];
  /** Latest CI conclusion on the head, when there is one. */
  ci: 'success' | 'failure' | 'pending' | null;
  /** External dependency names parsed out of the body, e.g. "lib-x". */
  externalDeps: string[];
}

export interface Candidate {
  key: string;
  severity: Severity;
  rule: string;                // which check fired — shown in the audit panel
  evidence: Source[];
  /** Cheap prior before any model call; corroboration moves it afterwards. */
  prior: number;
}

const DAY = 86_400_000;
const days = (iso: string, now: number): number => (now - Date.parse(iso)) / DAY;

const src = (system: Source['system'], excerpt: string, at: string, url = '#'): Source =>
  ({ system, url, excerpt, at });

/**
 * An open issue whose linked PR already merged. The single most common
 * stale-state bug on any board, and it is decidable without a model.
 */
function mergedPullOpenIssue(s: Snapshot, now: number): Candidate | null {
  if (s.kind !== 'issue' || s.state !== 'open') return null;
  const merged = s.linkedPulls.find((p) => p.state === 'merged' && p.mergedAt);
  if (!merged) return null;
  return {
    key: s.key, severity: 'conflict', rule: 'merged-pull-open-issue',
    prior: 0.75,
    evidence: [
      src('github', `Issue open, untouched ${Math.floor(days(s.updatedAt, now))}d`, s.updatedAt),
      src('github', `PR #${merged.number} merged, references this issue`, merged.mergedAt!),
    ],
  };
}

/** Approved-looking PR sitting on a red head. Nobody notices until release day. */
function redHeadOnOpenPull(s: Snapshot, now: number): Candidate | null {
  if (s.kind !== 'pull' || s.state !== 'open' || s.ci !== 'failure') return null;
  return {
    key: s.key, severity: 'conflict', rule: 'red-head-open-pull',
    prior: 0.7,
    evidence: [
      src('github', 'CI failing on head', s.updatedAt),
      src('github', `PR open ${Math.floor(days(s.createdAt, now))}d`, s.createdAt),
    ],
  };
}

/** Assigned and untouched. Weak on its own — deliberately below SURFACE_AT. */
function assignedButDormant(s: Snapshot, now: number, thresholdDays = 14): Candidate | null {
  if (s.state !== 'open' || !s.assignees.length) return null;
  const idle = days(s.updatedAt, now);
  if (idle < thresholdDays) return null;
  return {
    key: s.key, severity: 'stale', rule: 'assigned-but-dormant',
    prior: 0.4,
    evidence: [src('github',
      `Assigned to ${s.assignees[0]}, no activity in ${Math.floor(idle)}d`, s.updatedAt)],
  };
}

/** Names an external dependency as a blocker. Exa decides whether it's still true. */
function externalBlocker(s: Snapshot): Candidate | null {
  if (s.state !== 'open' || !s.externalDeps.length) return null;
  return {
    key: s.key, severity: 'external', rule: 'external-blocker',
    prior: 0.4,
    evidence: [src('github', `Body names "${s.externalDeps[0]}" as a blocker`, s.createdAt)],
  };
}

const RULES = [mergedPullOpenIssue, redHeadOnOpenPull, assignedButDormant, externalBlocker] as const;

/** Words that mark a body as claiming a blocked state. Intentionally small. */
const BLOCKER_RE = /\b(?:blocked (?:on|by)|waiting (?:on|for)|depends on|pending)\s+([a-z0-9@][a-z0-9._/-]{2,40})/gi;

/**
 * A dependency NAME, not an English word. This rule fired on issue #13 of this
 * very repo, whose body contains the phrase "blocked by policy" while
 * DESCRIBING the policy feature — and concluded the issue was blocked on a
 * package called "policy". Prose that merely talks about blocking is the most
 * common false positive an ambient agent can have, and a false card is far
 * more expensive than a missed one: it is what makes people switch the agent
 * off.
 *
 * So a candidate must LOOK like a package: a scope, a path, a version, an
 * internal hyphen or dot. A bare lowercase English word never qualifies.
 */
function looksLikeDependency(w: string): boolean {
  if (STOPWORDS.has(w)) return false;
  if (w.startsWith('@') || w.includes('/')) return true;     // @scope/pkg
  if (/\d/.test(w)) return true;                             // openssl3, node18
  if (/[.-]/.test(w)) return true;                           // lib-x, foo.bar
  return false;                                              // "policy", "review"
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'this', 'that', 'it', 'them', 'those', 'these',
  'review', 'merge', 'approval', 'ci', 'cd', 'policy', 'design', 'feedback',
  'confirmation', 'input', 'someone', 'anyone', 'you', 'us', 'me', 'him', 'her',
  'them-to', 'more', 'other', 'another', 'further', 'final', 'sign', 'signoff',
]);

export function parseExternalDeps(body: string): string[] {
  const out = new Set<string>();
  for (const m of body.matchAll(BLOCKER_RE)) {
    const w = m[1]?.toLowerCase().replace(/[.,;:)\]]+$/, '');
    if (w && looksLikeDependency(w)) out.add(w);
  }
  return [...out];
}

export interface SweepResult {
  candidates: Candidate[];
  checked: number;
  /** checked - candidates.length: resolved with zero tokens. The counter. */
  auto: number;
}

export function sweep(snapshots: Snapshot[], now = Date.now()): SweepResult {
  const candidates: Candidate[] = [];
  for (const s of snapshots) {
    for (const rule of RULES) {
      const c = rule(s, now);
      if (c) { candidates.push(c); break; }   // first rule wins; one card per artifact
    }
  }
  return { candidates, checked: snapshots.length, auto: snapshots.length - candidates.length };
}
