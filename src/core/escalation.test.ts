import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canTransition, transition, corroborate, confidenceFor,
  IllegalTransition, isActionable, SURFACE_AT,
  type Escalation, type Source,
} from './escalation.ts';

const src = (system: Source['system'], at = '2026-09-11T16:02:00Z'): Source =>
  ({ system, url: `https://example/${system}`, excerpt: 'x', at });

const seed = (over: Partial<Escalation> = {}): Escalation => ({
  id: 'e1', ticketKey: 'GTI-142', state: 'suspected', severity: 'conflict',
  claim: 'Ticket says blocked; the dependency shipped.',
  evidence: [src('jira')], confidence: 0.4, proposal: null, history: [],
  detectedAt: '2026-09-13T03:14:00Z', detectedBy: 'ambient', ...over,
});

test('legal moves only', () => {
  assert.ok(canTransition('suspected', 'corroborating'));
  assert.ok(!canTransition('suspected', 'approved'));
  assert.ok(!canTransition('verified', 'proposed'), 'verified is terminal');
  assert.throws(() => transition(seed(), 'approved', 'nope'), IllegalTransition);
});

test('dismissed can only reopen — a dismissal is parked, not deleted', () => {
  assert.deepEqual([...['reopened']], ['reopened']);
  assert.ok(canTransition('dismissed', 'reopened'));
  assert.ok(!canTransition('dismissed', 'proposed'));
});

test('transition is immutable and appends history', () => {
  const a = seed();
  const b = transition(a, 'corroborating', 'slack agrees', { confidence: 0.75 });
  assert.equal(a.state, 'suspected', 'original untouched');
  assert.equal(a.history.length, 0);
  assert.equal(b.state, 'corroborating');
  assert.equal(b.confidence, 0.75);
  assert.equal(b.history.length, 1);
  assert.deepEqual(
    { from: b.history[0]!.from, to: b.history[0]!.to, why: b.history[0]!.why },
    { from: 'suspected', to: 'corroborating', why: 'slack agrees' },
  );
});

test('confidence counts distinct systems, not repeated sources', () => {
  assert.equal(confidenceFor([src('jira')]), 0.4);
  assert.equal(confidenceFor([src('jira'), src('jira'), src('jira')]), 0.4);
  assert.equal(confidenceFor([src('jira'), src('slack')]), 0.75);
  assert.ok(confidenceFor([src('jira'), src('slack'), src('calendar')]) >= 0.8);
});

test('never claims certainty', () => {
  const all = [src('jira'), src('slack'), src('calendar'), src('exa')];
  assert.ok(confidenceFor(all) <= 0.95);
});

test('corroborating walks the ladder and confirms on its own', () => {
  let e = seed();
  e = corroborate(e, src('slack'), 'deploy message in #eng-deploys');
  assert.equal(e.state, 'corroborating');
  assert.equal(e.evidence.length, 2);
  e = corroborate(e, src('calendar'), 'cutover event completed');
  assert.equal(e.state, 'confirmed');
  assert.equal(e.history.length, 2, 'every step is inspectable');
  assert.ok(e.history[1]!.confidence > e.history[0]!.confidence, 'confidence climbs');
});

test('suppression floor: low confidence is never actionable', () => {
  const weak = seed({ confidence: SURFACE_AT - 0.01, proposal: { kind: 'comment', ticketKey: 'GTI-1', body: 'x' } });
  assert.ok(!isActionable(weak));
  const strong = { ...weak, confidence: SURFACE_AT };
  assert.ok(isActionable(strong));
});

test('confirmed without a proposal is not actionable', () => {
  assert.ok(!isActionable(seed({ state: 'confirmed', confidence: 0.9 })));
});

test('a failed write returns approved -> proposed, not verified', () => {
  const e = transition(
    transition(seed({ state: 'confirmed', confidence: 0.85 }), 'proposed', 'surfaced',
      { proposal: { kind: 'comment', ticketKey: 'GTI-142', body: 'unblocking' } }),
    'approved', 'human approved');
  assert.ok(canTransition(e.state, 'proposed'));
  assert.ok(canTransition(e.state, 'verified'));
});
