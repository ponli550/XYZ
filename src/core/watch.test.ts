import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateWatches, fired, expired } from './watch.ts';
import type { Escalation } from './escalation.ts';
import type { Snapshot } from './heuristics.ts';

const NOW = Date.parse('2026-09-13T15:00:00Z');
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  key: 'o/r#9', kind: 'issue', state: 'open', title: 't', body: '',
  labels: [], assignees: [], createdAt: '2026-08-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z', linkedPulls: [], ci: null, externalDeps: [], ...over,
});

const dismissed = (over: Partial<Escalation> = {}): Escalation => ({
  id: 'o/r#9:assigned-but-dormant', ticketKey: 'o/r#9', state: 'dismissed',
  severity: 'stale', claim: 'c', evidence: [], confidence: 0.6, proposal: null,
  history: [], detectedAt: '2026-09-12T03:14:00Z', detectedBy: 'ambient',
  watch: {
    condition: 're-check if this issue changes state',
    check: { kind: 'fieldChanged', ticketKey: 'o/r#9', field: 'state', from: 'open' },
    until: '2026-09-20T00:00:00Z',
  },
  ...over,
});

test('a dismissal stays dismissed while nothing changes', () => {
  const r = evaluateWatches([dismissed()], [snap()], NOW);
  assert.equal(r.escalations[0]!.state, 'dismissed');
  assert.deepEqual(r.reopened, []);
});

test('it re-opens when the world actually changed', () => {
  const r = evaluateWatches([dismissed()], [snap({ state: 'closed' })], NOW);
  assert.equal(r.escalations[0]!.state, 'reopened');
  assert.deepEqual(r.reopened, ['o/r#9:assigned-but-dormant']);
  assert.match(r.escalations[0]!.history.at(-1)!.why, /watch fired/);
});

test('a re-open clears its own watch so it cannot fire twice', () => {
  const r = evaluateWatches([dismissed()], [snap({ state: 'closed' })], NOW);
  assert.equal(r.escalations[0]!.watch, undefined);
});

test('an expired watch lapses into silence — it is NOT a re-open', () => {
  const late = Date.parse('2026-09-21T00:00:00Z');
  const r = evaluateWatches([dismissed()], [snap()], late);
  assert.equal(r.escalations[0]!.state, 'dismissed', 'the human was right');
  assert.equal(r.escalations[0]!.watch, undefined, 'but we stop watching');
  assert.deepEqual(r.reopened, []);
});

test('a watch never fires on a timer, only on a change', () => {
  const almost = Date.parse('2026-09-19T23:59:00Z');
  assert.deepEqual(evaluateWatches([dismissed()], [snap()], almost).reopened, []);
});

test('a missing artifact does not fire the watch', () => {
  assert.equal(fired(dismissed().watch!.check, []), false);
});

test('label and assignee changes are watchable too', () => {
  const onLabels = dismissed({ watch: { ...dismissed().watch!,
    check: { kind: 'fieldChanged', ticketKey: 'o/r#9', field: 'labels', from: '' } } });
  assert.equal(evaluateWatches([onLabels], [snap({ labels: ['bug'] })], NOW).reopened.length, 1);
  assert.equal(evaluateWatches([onLabels], [snap({ labels: [] })], NOW).reopened.length, 0);
});

test('non-dismissed findings are untouched', () => {
  const live = dismissed({ state: 'proposed', watch: undefined });
  const r = evaluateWatches([live], [snap({ state: 'closed' })], NOW);
  assert.equal(r.escalations[0]!.state, 'proposed');
});

test('expiry is a boundary, not a range', () => {
  const w = dismissed().watch!;
  assert.equal(expired(w, Date.parse('2026-09-19T23:59:59Z')), false);
  assert.equal(expired(w, Date.parse('2026-09-20T00:00:00Z')), true);
});
