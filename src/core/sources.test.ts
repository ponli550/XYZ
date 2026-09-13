import { test } from 'node:test';
import assert from 'node:assert/strict';
import { referencedIssues, readRepo, type ReadConfig } from './sources.ts';

const cfg: ReadConfig = { token: 't' };

const routes = (map: Record<string, unknown>) => {
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace('https://api.github.com', '');
    const key = Object.keys(map).find((k) => path.startsWith(k));
    if (!key) return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
    return { ok: true, json: async () => map[key] };
  }) as unknown as typeof fetch;
};

const issue = (n: number, over: Record<string, unknown> = {}) => ({
  number: n, title: `t${n}`, body: '', state: 'open',
  labels: [], assignees: [], created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z', ...over,
});

test('recovers issue links from the closes/fixes/resolves convention', () => {
  assert.deepEqual(referencedIssues('closes #5'), [5]);
  assert.deepEqual(referencedIssues('Fixed #12 and resolves #7'), [12, 7]);
  assert.deepEqual(referencedIssues('relates to #9'), [], 'a mention is not a link');
  assert.deepEqual(referencedIssues('see PR #3 for context'), []);
});

test('separates PRs from issues — a PR is not an issue with a badge', async () => {
  // GitHub returns PRs from the issues endpoint. They must be typed as pulls,
  // not dropped: rules differ by kind, and redHeadOnOpenPull needs 'pull'.
  routes({
    '/repos/o/r/issues': [issue(1), issue(2, { pull_request: {}, state: 'open' })],
    '/repos/o/r/pulls/2': { merged_at: null, head: { sha: 'abc' } },
    '/repos/o/r/commits/abc/check-runs': { check_runs: [] },
  });
  const { snapshots } = await readRepo(cfg, 'o', 'r');
  assert.deepEqual(
    snapshots.map((s) => `${s.key}:${s.kind}`).sort(),
    ['o/r#1:issue', 'o/r#2:pull']);
});

test('a merged PR attaches to the issue it closes', async () => {
  routes({
    '/repos/o/r/issues': [
      issue(5),
      issue(12, { pull_request: {}, state: 'closed', body: 'closes #5' }),
    ],
    '/repos/o/r/pulls/12': { merged_at: '2026-09-10T15:58:00Z' },
  });
  const { snapshots } = await readRepo(cfg, 'o', 'r');
  const five = snapshots.find((s) => s.key === 'o/r#5')!;
  assert.equal(five.linkedPulls.length, 1);
  assert.equal(five.linkedPulls[0]!.state, 'merged');
  assert.equal(five.linkedPulls[0]!.mergedAt, '2026-09-10T15:58:00Z');
});

test('a CLOSED-but-unmerged PR is not a merge — the distinction is the whole rule', async () => {
  routes({
    '/repos/o/r/issues': [issue(5), issue(12, { pull_request: {}, state: 'closed', body: 'closes #5' })],
    '/repos/o/r/pulls/12': { merged_at: null },
  });
  const { snapshots } = await readRepo(cfg, 'o', 'r');
  assert.equal(snapshots.find((s) => s.key === 'o/r#5')!.linkedPulls[0]!.state, 'closed');
});

test('PRs that close nothing cost no extra API calls', async () => {
  let calls = 0;
  globalThis.fetch = (async (url: string) => {
    calls++;
    const path = String(url).replace('https://api.github.com', '');
    if (path.startsWith('/repos/o/r/issues')) {
      return { ok: true, json: async () => [issue(1, { pull_request: {}, state: 'closed' })] };
    }
    return { ok: true, json: async () => ({ merged_at: null }) };
  }) as unknown as typeof fetch;
  await readRepo(cfg, 'o', 'r');
  assert.equal(calls, 1, 'no per-PR lookup when the body references no issue');
});

test('a failing source degrades the sweep, it does not kill it', async () => {
  routes({});   // every route 404s
  const r = await readRepo(cfg, 'o', 'r');
  assert.deepEqual(r.snapshots, []);
  assert.equal(r.degraded.length, 1);
  assert.match(r.degraded[0]!, /issues: github 404/);
});

test('a failing PR lookup degrades that link only', async () => {
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace('https://api.github.com', '');
    if (path.startsWith('/repos/o/r/issues')) {
      return { ok: true, json: async () => [issue(5), issue(12, { pull_request: {}, state: 'closed', body: 'closes #5' })] };
    }
    return { ok: false, status: 502, statusText: 'Bad Gateway', text: async () => '' };
  }) as unknown as typeof fetch;
  const r = await readRepo(cfg, 'o', 'r');
  assert.equal(r.snapshots.length, 1, 'the issue still came through');
  assert.match(r.degraded[0]!, /pull 12: github 502/);
});

test('external deps are parsed off the issue body during the read', async () => {
  routes({ '/repos/o/r/issues': [issue(7, { body: 'blocked on lib-x upstream' })] });
  const { snapshots } = await readRepo(cfg, 'o', 'r');
  assert.deepEqual(snapshots[0]!.externalDeps, ['lib-x']);
});

test('CI verdict: any failure wins, and "no checks" is not "passed"', async () => {
  const { ciVerdict } = await import('./sources.ts');
  assert.equal(ciVerdict([]), null, 'nobody ran anything is not success');
  assert.equal(ciVerdict([{ status: 'completed', conclusion: 'success' }]), 'success');
  assert.equal(ciVerdict([
    { status: 'completed', conclusion: 'success' },
    { status: 'completed', conclusion: 'failure' },
  ]), 'failure', 'one red check makes the head red');
  assert.equal(ciVerdict([
    { status: 'completed', conclusion: 'success' },
    { status: 'in_progress', conclusion: null },
  ]), 'pending', 'still running is not yet passed');
  assert.equal(ciVerdict([{ status: 'completed', conclusion: 'timed_out' }]), 'failure');
  assert.equal(ciVerdict([{ status: 'completed', conclusion: 'skipped' }]), null,
    'everything skipped proves nothing');
});

test('open PRs become snapshots so the red-head rule can actually fire', async () => {
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace('https://api.github.com', '');
    if (path.startsWith('/repos/o/r/issues')) {
      return { ok: true, json: async () => [
        issue(1),
        issue(16, { pull_request: {}, state: 'open', title: 'pr' }),
      ] };
    }
    if (path.startsWith('/repos/o/r/pulls/16')) {
      return { ok: true, json: async () => ({ merged_at: null, head: { sha: 'abc' } }) };
    }
    if (path.includes('/check-runs')) {
      return { ok: true, json: async () => ({ check_runs: [{ status: 'completed', conclusion: 'failure' }] }) };
    }
    return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
  }) as unknown as typeof fetch;

  const { snapshots } = await readRepo(cfg, 'o', 'r');
  const pr = snapshots.find((s) => s.kind === 'pull')!;
  assert.equal(pr.key, 'o/r#16');
  assert.equal(pr.ci, 'failure');
});

test('closed PRs cost no check-run calls', async () => {
  const paths: string[] = [];
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace('https://api.github.com', '');
    paths.push(path);
    if (path.startsWith('/repos/o/r/issues')) {
      return { ok: true, json: async () => [issue(16, { pull_request: {}, state: 'closed' })] };
    }
    return { ok: true, json: async () => ({ merged_at: null, head: { sha: 'x' }, check_runs: [] }) };
  }) as unknown as typeof fetch;
  await readRepo(cfg, 'o', 'r');
  assert.equal(paths.filter((p) => p.includes('check-runs')).length, 0);
});

test('a failing checks lookup degrades that PR only', async () => {
  globalThis.fetch = (async (url: string) => {
    const path = String(url).replace('https://api.github.com', '');
    if (path.startsWith('/repos/o/r/issues')) {
      return { ok: true, json: async () => [issue(16, { pull_request: {}, state: 'open' })] };
    }
    return { ok: false, status: 502, statusText: 'Bad Gateway', text: async () => '' };
  }) as unknown as typeof fetch;
  const r = await readRepo(cfg, 'o', 'r');
  assert.equal(r.snapshots.length, 1, 'the PR still came through');
  assert.equal(r.snapshots[0]!.ci, null);
  assert.match(r.degraded[0]!, /checks 16/);
});

test('every GitHub request carries a User-Agent — without one GitHub 403s', async () => {
  let headers: Record<string, string> = {};
  globalThis.fetch = (async (_u: string, init: RequestInit) => {
    headers = init.headers as Record<string, string>;
    return { ok: true, json: async () => [] };
  }) as unknown as typeof fetch;
  await readRepo(cfg, 'o', 'r');
  assert.ok(headers['User-Agent'], 'curl and Chrome add one; a Worker does not');
});
