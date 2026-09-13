import { test } from 'node:test';
import assert from 'node:assert/strict';
import { entry, append, boundNotified, describe } from './audit.ts';

test('the log is newest-first and capped', () => {
  let log = [] as ReturnType<typeof entry>[];
  for (let i = 0; i < 250; i++) log = append(log, entry('proposed', `o/r#${i}`, 'x', 'agent'), 200);
  assert.equal(log.length, 200);
  assert.equal(log[0]!.key, 'o/r#249', 'newest first');
});

test('the notified set is bounded — it used to grow forever', () => {
  const ids = Array.from({ length: 500 }, (_, i) => `id-${i}`);
  const kept = boundNotified(ids, 300);
  assert.equal(kept.length, 300);
  assert.equal(kept.at(-1), 'id-499', 'the most recent window is what suppresses repeats');
  assert.deepEqual(boundNotified(['a', 'b'], 300), ['a', 'b'], 'under the cap is untouched');
});

test('the agent never records itself as the human', () => {
  assert.equal(entry('approved', 'o/r#5', 'x', 'human').actor, 'human');
  assert.equal(entry('wrote', 'o/r#5', 'x', 'agent').actor, 'agent');
});

test('every kind has a readable verb', () => {
  for (const k of ['proposed', 'approved', 'dismissed', 'wrote', 'verified',
                   'failed', 'deferred', 'blocked'] as const) {
    assert.match(describe(entry(k, 'o/r#5', 'x', 'agent')), /o\/r#5$/);
  }
});
