import { test } from 'node:test';
import assert from 'node:assert/strict';
import { releaseEvidence, type ExaConfig } from './exa.ts';

const cfg: ExaConfig = { apiKey: 'k' };
const SINCE = '2026-09-01T00:00:00Z';
const NOW = new Date('2026-09-13T16:00:00Z');

const reply = (results: unknown[]) => {
  globalThis.fetch = (async () => ({ ok: true, json: async () => ({ results }) })) as unknown as typeof fetch;
};

test('a dated release becomes evidence', async () => {
  reply([{ url: 'https://x/rel', title: 'lib-x 2.4.1 fixes token refresh race',
           publishedDate: '2026-09-04T00:00:00Z' }]);
  const s = await releaseEvidence(cfg, 'lib-x', SINCE, NOW);
  assert.equal(s!.system, 'exa');
  assert.equal(s!.at, '2026-09-04T00:00:00Z');
  assert.match(s!.excerpt, /token refresh/);
  assert.equal(s!.url, 'https://x/rel');
});

test('predating releases are kept and labelled, not discarded', async () => {
  reply([{ url: 'https://x/old', title: 'lib-x 2.4.1', publishedDate: '2026-08-01T00:00:00Z' }]);
  const s = await releaseEvidence(cfg, 'lib-x', SINCE, NOW);
  assert.match(s!.excerpt, /already shipped before this was filed/);
});

test('a release after the claim is labelled the other way', async () => {
  reply([{ url: 'https://x/new', title: 'lib-x 2.5.0', publishedDate: '2026-09-04T00:00:00Z' }]);
  const s = await releaseEvidence(cfg, 'lib-x', SINCE, NOW);
  assert.match(s!.excerpt, /shipped since this was filed/);
});

test('the most recent dated result wins', async () => {
  reply([
    { url: 'https://x/a', title: 'old', publishedDate: '2026-06-01T00:00:00Z' },
    { url: 'https://x/b', title: 'newer', publishedDate: '2026-08-20T00:00:00Z' },
  ]);
  const s = await releaseEvidence(cfg, 'lib-x', SINCE, NOW);
  assert.equal(s!.url, 'https://x/b');
});

test('an undated result is dropped rather than guessed', async () => {
  reply([{ url: 'https://x/none', summary: 'a page with no date' }]);
  assert.equal(await releaseEvidence(cfg, 'lib-x', SINCE, NOW), null,
    'the timeline IS the argument; a guessed date would fabricate it');
});

test('no results is a normal answer, not an error', async () => {
  reply([]);
  assert.equal(await releaseEvidence(cfg, 'lib-x', SINCE, NOW), null);
});

test('the search window starts at the claim, not at the epoch', async () => {
  let sent = '';
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    sent = String(init.body);
    return { ok: true, json: async () => ({ results: [] }) };
  }) as unknown as typeof fetch;
  await releaseEvidence(cfg, 'lib-x', SINCE, NOW);
  assert.match(sent, /"startPublishedDate":"2026-03-/, 'a 180-day window, not the issue date');
  assert.match(sent, /lib-x release notes changelog fix/);
});

test('an Exa failure surfaces as an error, never as a silent null', async () => {
  globalThis.fetch = (async () => ({
    ok: false, status: 429, statusText: 'Too Many Requests', text: async () => 'rate limited',
  })) as unknown as typeof fetch;
  await assert.rejects(() => releaseEvidence(cfg, 'lib-x', SINCE, NOW), /exa 429/);
});
