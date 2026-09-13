import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sweep, parseExternalDeps, type Snapshot } from './heuristics.ts';
import { SURFACE_AT } from './escalation.ts';

const NOW = Date.parse('2026-09-13T12:00:00Z');
const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  key: 'o/r#1', kind: 'issue', state: 'open', title: 't', body: '',
  labels: [], assignees: [], updatedAt: ago(1), createdAt: ago(30),
  linkedPulls: [], ci: null, externalDeps: [], ...over,
});

test('open issue with a merged PR is the strongest candidate', () => {
  const { candidates, auto } = sweep([snap({
    linkedPulls: [{ number: 12, state: 'merged', mergedAt: ago(3) }],
  })], NOW);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]!.rule, 'merged-pull-open-issue');
  assert.equal(candidates[0]!.severity, 'conflict');
  assert.ok(candidates[0]!.prior > SURFACE_AT);
  assert.equal(auto, 0);
});

test('a closed issue with a merged PR is not a conflict', () => {
  const { candidates, auto } = sweep([snap({
    state: 'closed', linkedPulls: [{ number: 12, state: 'merged', mergedAt: ago(3) }],
  })], NOW);
  assert.equal(candidates.length, 0);
  assert.equal(auto, 1, 'resolved with zero tokens');
});

test('an open PR with a red head fires; a green one does not', () => {
  assert.equal(sweep([snap({ kind: 'pull', ci: 'failure' })], NOW).candidates.length, 1);
  assert.equal(sweep([snap({ kind: 'pull', ci: 'success' })], NOW).candidates.length, 0);
  assert.equal(sweep([snap({ kind: 'pull', ci: 'pending' })], NOW).candidates.length, 0);
});

test('dormancy is deliberately weak — below the surfacing floor on its own', () => {
  const { candidates } = sweep([snap({ assignees: ['ponli550'], updatedAt: ago(21) })], NOW);
  assert.equal(candidates[0]!.rule, 'assigned-but-dormant');
  assert.ok(candidates[0]!.prior < SURFACE_AT,
    'one weak signal must not reach the human without corroboration');
});

test('dormancy needs both an assignee and real idle time', () => {
  assert.equal(sweep([snap({ assignees: ['x'], updatedAt: ago(3) })], NOW).candidates.length, 0);
  assert.equal(sweep([snap({ assignees: [], updatedAt: ago(60) })], NOW).candidates.length, 0);
});

test('one card per artifact — the strongest rule wins', () => {
  const { candidates } = sweep([snap({
    assignees: ['x'], updatedAt: ago(40), body: 'blocked on lib-x',
    externalDeps: ['lib-x'],
    linkedPulls: [{ number: 12, state: 'merged', mergedAt: ago(3) }],
  })], NOW);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0]!.rule, 'merged-pull-open-issue');
});

test('the counter is real: most artifacts cost nothing', () => {
  const quiet = Array.from({ length: 38 }, (_, i) => snap({ key: `o/r#${i}` }));
  const loud = snap({ key: 'o/r#99', linkedPulls: [{ number: 1, state: 'merged', mergedAt: ago(2) }] });
  const r = sweep([...quiet, loud], NOW);
  assert.equal(r.checked, 39);
  assert.equal(r.auto, 38);
  assert.equal(r.candidates.length, 1);
});

test('external deps are parsed, filler words are not', () => {
  assert.deepEqual(parseExternalDeps('Blocked on lib-x upstream'), ['lib-x']);
  assert.deepEqual(parseExternalDeps('waiting for @octocat review'), []);
  assert.deepEqual(parseExternalDeps('blocked by the thing'), []);
  assert.deepEqual(parseExternalDeps('depends on openssl3 and blocked on lib-y'),
                   ['openssl3', 'lib-y']);
});

test('an empty sweep is not an error', () => {
  assert.deepEqual(sweep([], NOW), { candidates: [], checked: 0, auto: 0 });
});
