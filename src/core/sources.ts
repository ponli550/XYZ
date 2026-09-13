// Reading GitHub. Every call here is read-only — the write surface lives in
// github.ts and nowhere else.
//
// The watcher runs this on a timer, so it is written to be cheap and to fail
// soft: a source that errors degrades the sweep rather than killing it. The PR
// daemon's lesson was that a single transient hiccup must never take the loop
// down, and that a stale cache is better than a dead poller.

import type { Snapshot } from './heuristics.ts';
import { parseExternalDeps } from './heuristics.ts';

export interface ReadConfig {
  token: string;
  baseUrl?: string;
}

interface GhIssue {
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: { name: string }[];
  assignees: { login: string }[];
  created_at: string;
  updated_at: string;
  pull_request?: unknown;      // present => this "issue" is really a PR
  draft?: boolean;
}

async function get<T>(cfg: ReadConfig, path: string): Promise<T> {
  const res = await fetch(`${cfg.baseUrl ?? 'https://api.github.com'}${path}`, {
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!res.ok) {
    throw new Error(`github ${res.status} ${res.statusText} on ${path}`);
  }
  return res.json() as Promise<T>;
}

/**
 * Which PRs reference which issues. GitHub's REST API does not expose this
 * directly, so it is recovered from PR bodies and titles — the same
 * "closes #5" convention GitHub itself parses.
 */
const CLOSES_RE = /\b(?:close[sd]?|fixe[sd]?|resolve[sd]?)\s+#(\d+)\b/gi;

export function referencedIssues(text: string): number[] {
  return [...text.matchAll(CLOSES_RE)].map((m) => Number(m[1])).filter((n) => Number.isFinite(n));
}

export interface RepoState {
  snapshots: Snapshot[];
  /** Sources that failed this sweep. Rendered, not swallowed. */
  degraded: string[];
}

export async function readRepo(cfg: ReadConfig, owner: string, repo: string,
                               limit = 40): Promise<RepoState> {
  const degraded: string[] = [];
  const full = `${owner}/${repo}`;

  let raw: GhIssue[] = [];
  try {
    // state=all so a recently-closed issue still shows up for the re-open watch.
    raw = await get<GhIssue[]>(cfg, `/repos/${full}/issues?state=all&per_page=${limit}&sort=updated`);
  } catch (e) {
    degraded.push(`issues: ${e instanceof Error ? e.message : String(e)}`);
    return { snapshots: [], degraded };
  }

  const pulls = raw.filter((i) => i.pull_request);
  const issues = raw.filter((i) => !i.pull_request);

  // Merge state for PRs needs a second call each, so only ask about the PRs
  // that actually claim to close something. Most don't.
  const linkage = new Map<number, { number: number; state: 'open' | 'closed' | 'merged'; mergedAt: string | null }[]>();
  for (const p of pulls) {
    const refs = referencedIssues(`${p.title}\n${p.body ?? ''}`);
    if (!refs.length) continue;
    let state: 'open' | 'closed' | 'merged' = p.state;
    let mergedAt: string | null = null;
    if (p.state === 'closed') {
      try {
        const detail = await get<{ merged_at: string | null }>(cfg, `/repos/${full}/pulls/${p.number}`);
        if (detail.merged_at) { state = 'merged'; mergedAt = detail.merged_at; }
      } catch (e) {
        degraded.push(`pull ${p.number}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    for (const n of refs) {
      linkage.set(n, [...(linkage.get(n) ?? []), { number: p.number, state, mergedAt }]);
    }
  }

  const snapshots: Snapshot[] = issues.map((i) => ({
    key: `${full}#${i.number}`,
    kind: 'issue',
    state: i.state,
    title: i.title,
    body: i.body ?? '',
    labels: i.labels.map((l) => l.name),
    assignees: i.assignees.map((a) => a.login),
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    linkedPulls: linkage.get(i.number) ?? [],
    ci: null,
    externalDeps: parseExternalDeps(i.body ?? ''),
  }));

  return { snapshots, degraded };
}
