import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDraft, draftEscalation, type ModelConfig } from './draft.ts';
import { BudgetGuard } from './budget.ts';
import type { Candidate } from './heuristics.ts';

const cand: Candidate = {
  key: 'ponli550/XYZ#5', severity: 'conflict', rule: 'merged-pull-open-issue', prior: 0.75,
  evidence: [
    { system: 'github', url: '#', excerpt: 'Issue open, untouched 9d', at: '2026-09-04T09:00:00Z' },
    { system: 'github', url: '#', excerpt: 'PR #12 merged', at: '2026-09-10T15:58:00Z' },
  ],
};
const cfg: ModelConfig = { apiKey: 'k', model: 'openai/gpt-4o-mini' };
const at = () => '2026-09-13T12:00:00Z';

/** No test may touch the network. Each one installs the response it expects. */
const stubOk = (content: string) => {
  globalThis.fetch = (async () => ({
    ok: true, json: async () => ({ choices: [{ message: { content } }] }),
  })) as unknown as typeof fetch;
};
const GOOD = '{"claim":"Issue is open but PR #12 merged on 10 Sep.","comment":"Closing — PR #12 merged 10 Sep 15:58."}';

test('parses strict JSON, rejects anything it cannot trust', () => {
  assert.deepEqual(parseDraft('{"claim":"c","comment":"m"}'), { claim: 'c', comment: 'm' });
  assert.deepEqual(parseDraft('here you go:\n{"claim":"c","comment":"m"}\nhope that helps'),
                   { claim: 'c', comment: 'm' });
  assert.equal(parseDraft('no json at all'), null);
  assert.equal(parseDraft('{"claim":"c"}'), null, 'half a draft is not a draft');
  assert.equal(parseDraft('{"claim":"","comment":"m"}'), null, 'empty is not a draft');
  assert.equal(parseDraft(`{"claim":"c","comment":"${'x'.repeat(401)}"}`), null, 'runaway output rejected');
});

test('emits a proposed escalation with a stable id', async () => {
  stubOk(GOOD);
  const guard = new BudgetGuard<Candidate>();
  const r = await draftEscalation(guard, cfg, cand, at);
  assert.equal(r.deferred, false);
  const e = r.escalation!;
  assert.equal(e.id, 'ponli550/XYZ#5:merged-pull-open-issue');
  assert.equal(e.state, 'proposed');
  assert.equal(e.proposal!.kind, 'comment');
  assert.equal(e.history.length, 1);
  assert.ok(e.confidence >= 0.75);
});

test('the same finding twice yields the same id — no duplicate cards', async () => {
  stubOk(GOOD);
  const guard = new BudgetGuard<Candidate>();
  const a = await draftEscalation(guard, cfg, cand, at);
  const b = await draftEscalation(guard, cfg, cand, at);
  assert.equal(a.escalation!.id, b.escalation!.id);
});

test('a refusal emits NOTHING and parks the candidate', async () => {
  const guard = new BudgetGuard<Candidate>();
  globalThis.fetch = (async () => ({
    ok: false, status: 429, statusText: 'Too Many Requests',
    text: async () => 'rate limit exceeded',
  })) as unknown as typeof fetch;

  const r = await draftEscalation(guard, cfg, cand, at);
  assert.equal(r.deferred, true);
  assert.equal(r.escalation, null,
    'a card with no drafted action is worse than no card');
  assert.equal(guard.pending(), 1, 'the candidate is parked for replay');
  assert.ok(guard.limited());
});

test('an unparseable draft is a hard failure, not a half-posted comment', async () => {
  const guard = new BudgetGuard<Candidate>();
  stubOk('I think maybe the issue is stale?');

  await assert.rejects(() => draftEscalation(guard, cfg, cand, at), /unparseable draft/);
  assert.equal(guard.pending(), 0, 'not a budget problem, so not parked');
});

test('a good response round-trips into the card', async () => {
  stubOk(GOOD);
  const guard = new BudgetGuard<Candidate>();
  const r = await draftEscalation(guard, cfg, cand, at);
  assert.match(r.escalation!.claim, /PR #12 merged/);
  assert.match((r.escalation!.proposal as { body: string }).body, /Closing/);
});
