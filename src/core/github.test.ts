import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKey, checkPolicy, execute, comment, verifyComment,
         DEFAULT_POLICY, type Policy, type GitHubConfig } from './github.ts';
import type { Action } from './escalation.ts';

const cfg: GitHubConfig = { token: 't' };
const open: Policy = { allowed: ['comment', 'transition'], repos: ['ponli550/XYZ'] };
const say = (key: string): Action => ({ kind: 'comment', ticketKey: key, body: 'hello' });

const stub = (impl: (url: string, init?: RequestInit) => unknown) => {
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const r = impl(String(url), init);
    return { ok: true, json: async () => r, text: async () => '' };
  }) as unknown as typeof fetch;
};

test('parses owner/repo#n, rejects anything else', () => {
  assert.deepEqual(parseKey('ponli550/XYZ#5'), { owner: 'ponli550', repo: 'XYZ', number: 5 });
  assert.equal(parseKey('XYZ#5'), null);
  assert.equal(parseKey('ponli550/XYZ'), null);
  assert.equal(parseKey('ponli550/XYZ#abc'), null);
});

test('policy is DEFAULT-DENY: the shipped default can touch nothing', () => {
  const v = checkPolicy(DEFAULT_POLICY, say('ponli550/XYZ#5'));
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /not in the allowed repos/);
});

test('an unlisted repo is refused even with every capability on', () => {
  const v = checkPolicy({ allowed: ['comment', 'transition'], repos: ['ponli550/XYZ'] },
                        say('someone/else#1'));
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /someone\/else/);
});

test('a switched-off capability is refused on an allowed repo', () => {
  const v = checkPolicy({ allowed: ['comment'], repos: ['ponli550/XYZ'] },
                        { kind: 'transition', ticketKey: 'ponli550/XYZ#5', to: 'closed' });
  assert.equal(v.ok, false);
  assert.match((v as { reason: string }).reason, /switched off/);
});

test('owner/* globs scope to an owner, not to everyone', () => {
  const p: Policy = { allowed: ['comment'], repos: ['ponli550/*'] };
  assert.equal(checkPolicy(p, say('ponli550/anything#1')).ok, true);
  assert.equal(checkPolicy(p, say('ponli551/anything#1')).ok, false);
});

test('execute refuses before it spends the token', async () => {
  let called = false;
  stub(() => { called = true; return {}; });
  await assert.rejects(() => execute(cfg, DEFAULT_POLICY, say('ponli550/XYZ#5')),
                       /blocked by policy/);
  assert.equal(called, false, 'policy is checked BEFORE the network call');
});

test('comment posts to the right endpoint and returns the proof URL', async () => {
  let seen = '';
  stub((url) => { seen = url; return { html_url: 'https://github.com/ponli550/XYZ/issues/5#c1' }; });
  const r = await comment(cfg, 'ponli550/XYZ#5', 'hello');
  assert.equal(seen, 'https://api.github.com/repos/ponli550/XYZ/issues/5/comments');
  assert.match(r.url, /issues\/5#c1/);
});

test('transition maps to the issues PATCH, not a second comment', async () => {
  const urls: string[] = [];
  stub((url) => { urls.push(url); return { html_url: 'u' }; });
  await execute(cfg, open, { kind: 'transition', ticketKey: 'ponli550/XYZ#5', to: 'closed' });
  assert.equal(urls[0], 'https://api.github.com/repos/ponli550/XYZ/issues/5');
});

test('verification reads the comment back — an unconfirmed write is not verified', async () => {
  stub(() => [{ body: 'hello' }, { body: 'unrelated' }]);
  assert.equal(await verifyComment(cfg, 'ponli550/XYZ#5', 'hello'), true);
  assert.equal(await verifyComment(cfg, 'ponli550/XYZ#5', 'never posted'), false);
});

test('a GitHub error surfaces as an error, never as a silent success', async () => {
  globalThis.fetch = (async () => ({
    ok: false, status: 403, statusText: 'Forbidden', text: async () => 'token lacks scope',
  })) as unknown as typeof fetch;
  await assert.rejects(() => comment(cfg, 'ponli550/XYZ#5', 'hi'), /github 403/);
});

test('writes carry a User-Agent too', async () => {
  let headers: Record<string, string> = {};
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    headers = init.headers as Record<string, string>;
    return { ok: true, json: async () => ({ html_url: 'u' }), text: async () => '' };
  }) as unknown as typeof fetch;
  await comment(cfg, 'ponli550/XYZ#5', 'hi');
  assert.ok(headers['User-Agent']);
});
