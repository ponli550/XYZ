import { test } from 'node:test';
import assert from 'node:assert/strict';
import { merge } from './merge.ts';
import type { Escalation, Source } from './escalation.ts';

const s = (system: Source['system'], excerpt: string): Source =>
  ({ system, url: '#', excerpt, at: '2026-09-10T16:02:00Z' });

const esc = (over: Partial<Escalation> = {}): Escalation => ({
  id: 'o/r#5:merged-pull-open-issue', ticketKey: 'o/r#5', state: 'proposed',
  severity: 'conflict', claim: 'c', evidence: [s('github', 'a')], confidence: 0.75,
  proposal: { kind: 'comment', ticketKey: 'o/r#5', body: 'b' }, history: [],
  detectedAt: '2026-09-13T03:14:00Z', detectedBy: 'ambient', ...over,
});

test('a new finding surfaces and is flagged fresh', () => {
  const r = merge([], [esc()]);
  assert.equal(r.escalations.length, 1);
  assert.deepEqual(r.fresh, ['o/r#5:merged-pull-open-issue']);
});

test('a dismissed finding is NOT resurrected by the next sweep', () => {
  const r = merge([esc({ state: 'dismissed' })], [esc()]);
  assert.equal(r.escalations[0]!.state, 'dismissed');
  assert.deepEqual(r.fresh, [], 'and it does not re-notify');
});

test('a verified finding is not reopened by re-derivation', () => {
  const r = merge([esc({ state: 'verified' })], [esc()]);
  assert.equal(r.escalations[0]!.state, 'verified');
});

test('an in-flight approval is not clobbered mid-write', () => {
  const r = merge([esc({ state: 'approved' })], [esc()]);
  assert.equal(r.escalations[0]!.state, 'approved');
});

test('re-deriving the SAME evidence does not inflate confidence', () => {
  const before = esc({ state: 'corroborating', confidence: 0.4, evidence: [s('github', 'a')] });
  const r = merge([before], [esc({ evidence: [s('github', 'a')] })]);
  assert.equal(r.escalations[0]!.confidence, 0.4, 'progress theatre is a bug');
  assert.equal(r.escalations[0]!.history.length, 0);
});

test('genuinely new evidence moves confidence and records why', () => {
  const before = esc({ state: 'suspected', confidence: 0.4, evidence: [s('github', 'a')], history: [] });
  const r = merge([before], [esc({ evidence: [s('github', 'a'), s('exa', 'release notes')] })]);
  const after = r.escalations[0]!;
  assert.equal(after.evidence.length, 2);
  assert.ok(after.confidence > 0.4);
  assert.equal(after.history.length, 1);
  assert.match(after.history[0]!.why, /corroborated by exa/);
});

test('a suspected finding that gains a draft surfaces for the first time', () => {
  const before = esc({ state: 'suspected', proposal: null, evidence: [s('github', 'a')] });
  const r = merge([before], [esc({ claim: 'drafted claim' })]);
  assert.equal(r.escalations[0]!.state, 'proposed');
  assert.equal(r.escalations[0]!.claim, 'drafted claim');
  assert.deepEqual(r.fresh, ['o/r#5:merged-pull-open-issue']);
});

test('an unchanged proposed finding does not re-notify every two minutes', () => {
  const r = merge([esc()], [esc()]);
  assert.deepEqual(r.fresh, []);
});

test('findings on other artifacts are preserved, not dropped', () => {
  const other = esc({ id: 'o/r#9:assigned-but-dormant', ticketKey: 'o/r#9' });
  const r = merge([other], [esc()]);
  assert.equal(r.escalations.length, 2);
});
