// Seeded escalations. These drive the overlay before any real source is wired,
// and they double as the demo's cold-open state.
import type { Escalation, Source } from './escalation.ts';

const s = (system: Source['system'], excerpt: string, at: string, url = '#'): Source =>
  ({ system, url, excerpt, at });

export const FIXTURES: Escalation[] = [
  {
    id: 'e-5', ticketKey: 'ponli550/XYZ#5', state: 'proposed', severity: 'conflict',
    claim: 'Issue is open and unassigned, but its PR merged Thursday.',
    evidence: [
      s('github', 'Issue #5 open, no assignee, untouched since 4 Sep', '2026-09-04T09:00:00Z'),
      s('slack', '#eng-deploys: "agent tool layer is merged"', '2026-09-10T16:02:00Z'),
      s('github', 'PR #12 merged into main, closes #5', '2026-09-10T15:58:00Z'),
    ],
    confidence: 0.95,
    proposal: { kind: 'comment', ticketKey: 'ponli550/XYZ#5',
      body: 'Closing — PR #12 merged Thu 10 Sep 15:58 and implements this.' },
    history: [
      { from: 'suspected', to: 'corroborating', at: '2026-09-13T03:14:00Z', why: 'open 9 days, no activity', confidence: 0.40 },
      { from: 'corroborating', to: 'confirmed', at: '2026-09-13T05:02:00Z', why: 'merge message in #eng-deploys', confidence: 0.75 },
      { from: 'confirmed', to: 'proposed', at: '2026-09-13T05:03:00Z', why: 'PR #12 merged, closes #5', confidence: 0.95 },
    ],
    detectedAt: '2026-09-13T03:14:00Z', detectedBy: 'ambient',
  },
  {
    id: 'e-7', ticketKey: 'ponli550/XYZ#7', state: 'proposed', severity: 'external',
    claim: 'Blocked on an upstream lib-x fix. lib-x 2.4.1 shipped that fix 9 days ago.',
    evidence: [
      s('github', 'Body: "waiting on lib-x upstream"', '2026-09-01T10:00:00Z'),
      s('exa', 'lib-x 2.4.1 release notes — "fixes token refresh race"', '2026-09-04T00:00:00Z'),
    ],
    confidence: 0.70,
    proposal: { kind: 'comment', ticketKey: 'ponli550/XYZ#7',
      body: 'lib-x 2.4.1 (4 Sep) contains the upstream fix — worth a bump.' },
    history: [
      { from: 'suspected', to: 'corroborating', at: '2026-09-13T03:14:00Z', why: 'external dep named in description', confidence: 0.40 },
    ],
    detectedAt: '2026-09-13T03:14:00Z', detectedBy: 'ambient',
  },
  {
    id: 'e-9', ticketKey: 'ponli550/XYZ#9', state: 'dismissed', severity: 'stale',
    claim: 'Assigned 21 days ago with no commits on any matching branch.',
    evidence: [s('github', 'Assigned since 23 Aug, no linked branch', '2026-08-23T09:00:00Z')],
    confidence: 0.60, proposal: null,
    history: [
      { from: 'suspected', to: 'corroborating', at: '2026-09-12T03:14:00Z', why: 'no branch activity', confidence: 0.40 },
      { from: 'corroborating', to: 'dismissed', at: '2026-09-12T09:40:00Z', why: 'human: parked pending review', confidence: 0.60 },
    ],
    watch: {
      condition: 're-check if a branch appears or CI goes green',
      check: { kind: 'fieldChanged', ticketKey: 'ponli550/XYZ#9', field: 'state', from: 'open' },
      until: '2026-09-20T00:00:00Z',
    },
    detectedAt: '2026-09-12T03:14:00Z', detectedBy: 'ambient',
  },
];

/** The work counter. Restraint is the product, so it is rendered, not hidden. */
export const COUNTER = { checked: 41, auto: 38, escalated: 3 };
