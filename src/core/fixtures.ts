// Seeded escalations. These drive the overlay before any real source is wired,
// and they double as the demo's cold-open state.
import type { Escalation, Source } from './escalation.ts';

const s = (system: Source['system'], excerpt: string, at: string, url = '#'): Source =>
  ({ system, url, excerpt, at });

export const FIXTURES: Escalation[] = [
  {
    id: 'e-142', ticketKey: 'GTI-142', state: 'proposed', severity: 'conflict',
    claim: 'Ticket is Blocked on the auth migration. That shipped Thursday.',
    evidence: [
      s('jira', 'Status: BLOCKED — unchanged since 4 Sep', '2026-09-04T09:00:00Z'),
      s('slack', '#eng-deploys: "auth-migration is live in prod"', '2026-09-10T16:02:00Z'),
      s('calendar', 'Auth cutover — 10 Sep, completed', '2026-09-10T11:00:00Z'),
    ],
    confidence: 0.95,
    proposal: { kind: 'comment', ticketKey: 'GTI-142',
      body: 'Unblocking — the auth migration shipped Thu 10 Sep (#eng-deploys 16:02).' },
    history: [
      { from: 'suspected', to: 'corroborating', at: '2026-09-13T03:14:00Z', why: 'status stale 9 days', confidence: 0.40 },
      { from: 'corroborating', to: 'confirmed', at: '2026-09-13T05:02:00Z', why: 'deploy message in #eng-deploys', confidence: 0.75 },
      { from: 'confirmed', to: 'proposed', at: '2026-09-13T05:03:00Z', why: 'calendar cutover completed', confidence: 0.95 },
    ],
    detectedAt: '2026-09-13T03:14:00Z', detectedBy: 'ambient',
  },
  {
    id: 'e-207', ticketKey: 'GTI-207', state: 'proposed', severity: 'external',
    claim: 'Blocked on an upstream lib-x fix. lib-x 2.4.1 shipped that fix 9 days ago.',
    evidence: [
      s('jira', 'Description: "waiting on lib-x upstream"', '2026-09-01T10:00:00Z'),
      s('exa', 'lib-x 2.4.1 release notes — "fixes token refresh race"', '2026-09-04T00:00:00Z'),
    ],
    confidence: 0.70,
    proposal: { kind: 'comment', ticketKey: 'GTI-207',
      body: 'lib-x 2.4.1 (4 Sep) contains the upstream fix — worth a bump.' },
    history: [
      { from: 'suspected', to: 'corroborating', at: '2026-09-13T03:14:00Z', why: 'external dep named in description', confidence: 0.40 },
    ],
    detectedAt: '2026-09-13T03:14:00Z', detectedBy: 'ambient',
  },
  {
    id: 'e-198', ticketKey: 'GTI-198', state: 'dismissed', severity: 'stale',
    claim: 'In Progress for 21 days with no commits on its branch.',
    evidence: [s('jira', 'Status: In Progress since 23 Aug', '2026-08-23T09:00:00Z')],
    confidence: 0.60, proposal: null,
    history: [
      { from: 'suspected', to: 'corroborating', at: '2026-09-12T03:14:00Z', why: 'no branch activity', confidence: 0.40 },
      { from: 'corroborating', to: 'dismissed', at: '2026-09-12T09:40:00Z', why: 'human: parked pending review', confidence: 0.60 },
    ],
    watch: {
      condition: 're-check if the pipeline goes green',
      check: { kind: 'fieldChanged', ticketKey: 'GTI-198', field: 'status', from: 'In Progress' },
      until: '2026-09-20T00:00:00Z',
    },
    detectedAt: '2026-09-12T03:14:00Z', detectedBy: 'ambient',
  },
];

/** The work counter. Restraint is the product, so it is rendered, not hidden. */
export const COUNTER = { checked: 41, auto: 38, escalated: 3 };
