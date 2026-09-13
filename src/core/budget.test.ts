import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BudgetGuard, isRefusal, limitWindowFrom, guarded } from './budget.ts';

test('recognises refusals, not real answers', () => {
  for (const s of ['usage limit reached', 'HTTP 429', 'rate limit exceeded',
                   'Overloaded', 'insufficient credits']) {
    assert.ok(isRefusal(s), s);
  }
  assert.ok(!isRefusal('the ticket says blocked on the auth migration'));
  assert.ok(!isRefusal('429 tickets in the backlog'), 'bare number is not a 429 status');
});

test('parses a reset epoch, else falls back to a cooldown', () => {
  const now = 1_800_000_000_000;
  assert.equal(limitWindowFrom('limit|1800003600', now).until, 1_800_003_600_000);
  assert.equal(limitWindowFrom('rate limited', now).until, now + 3_600_000);
  assert.ok(limitWindowFrom('limit|1000000000', now).until > now, 'stale epoch ignored');
});

test('a refusal defers work and does NOT report success', async () => {
  let clock = 0;
  const guard = new BudgetGuard<string>(() => clock);
  const res = await guarded(guard, 'GTI-142', async () => { throw new Error('429 too many requests'); });
  assert.equal(res.ok, false);
  assert.equal(guard.pending(), 1, 'work is parked, not lost');
  assert.ok(guard.limited());
});

test('subsequent calls short-circuit into the queue without calling out', async () => {
  let clock = 0, calls = 0;
  const guard = new BudgetGuard<string>(() => clock);
  await guarded(guard, 'a', async () => { throw new Error('usage limit'); });
  await guarded(guard, 'b', async () => { calls++; return 'x'; });
  await guarded(guard, 'c', async () => { calls++; return 'x'; });
  assert.equal(calls, 0, 'no spend while limited');
  assert.equal(guard.pending(), 3);
});

test('replay is empty while limited, drains once the window passes', async () => {
  let clock = 0;
  const guard = new BudgetGuard<string>(() => clock);
  await guarded(guard, 'a', async () => { throw new Error('usage limit'); });
  assert.deepEqual(guard.replay(), [], 'nothing replays inside the window');
  clock = 3_600_001;
  assert.deepEqual(guard.replay(), ['a']);
  assert.equal(guard.pending(), 0);
  assert.ok(!guard.limited(), 'window cleared itself');
});

test('non-refusal errors propagate — they are bugs, not budget', async () => {
  const guard = new BudgetGuard<string>();
  await assert.rejects(
    () => guarded(guard, 'a', async () => { throw new TypeError('undefined is not a function'); }),
    TypeError);
  assert.equal(guard.pending(), 0, 'a real bug is not parked as deferred work');
});

test('success passes the value through and spends nothing from the queue', async () => {
  const guard = new BudgetGuard<string>();
  const res = await guarded(guard, 'a', async () => 'claim');
  assert.deepEqual(res, { ok: true, value: 'claim' });
  assert.equal(guard.pending(), 0);
});
