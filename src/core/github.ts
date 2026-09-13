// The agent's entire write surface.
//
// Two verbs. That is not a limitation to apologise for — it is the safety
// story. The token may have repo scope, but this module is the only thing that
// can spend it, and it can only comment or set an issue's open/closed state.
// Adding a third verb is a deliberate act with a code review attached.

import type { Action } from './escalation.ts';

export interface GitHubConfig {
  token: string;
  baseUrl?: string;
}

/** Everything the agent may be permitted to do. Checked before every call. */
export type Capability = 'comment' | 'transition';

export interface Policy {
  /** Capabilities the user has left switched on. */
  allowed: Capability[];
  /** Repos the agent may touch at all, as owner/repo globs. Empty = none. */
  repos: string[];
}

export const DEFAULT_POLICY: Policy = { allowed: ['comment'], repos: [] };

export interface Parsed { owner: string; repo: string; number: number }

export function parseKey(key: string): Parsed | null {
  const m = key.match(/^([^/\s]+)\/([^#\s]+)#(\d+)$/);
  return m ? { owner: m[1]!, repo: m[2]!, number: Number(m[3]) } : null;
}

function repoMatches(pattern: string, owner: string, repo: string): boolean {
  const full = `${owner}/${repo}`;
  if (pattern === full) return true;
  if (pattern.endsWith('/*')) return full.startsWith(pattern.slice(0, -1));
  return false;
}

export type PolicyVerdict = { ok: true } | { ok: false; reason: string };

/** Default-deny. An unlisted repo or a switched-off capability is a no. */
export function checkPolicy(policy: Policy, action: Action): PolicyVerdict {
  const p = parseKey(action.ticketKey);
  if (!p) return { ok: false, reason: `unparseable key ${action.ticketKey}` };
  if (!policy.repos.some((r) => repoMatches(r, p.owner, p.repo))) {
    return { ok: false, reason: `${p.owner}/${p.repo} is not in the allowed repos` };
  }
  if (!policy.allowed.includes(action.kind)) {
    return { ok: false, reason: `capability "${action.kind}" is switched off` };
  }
  return { ok: true };
}

async function api(cfg: GitHubConfig, path: string, init: RequestInit = {}): Promise<unknown> {
  const res = await fetch(`${cfg.baseUrl ?? 'https://api.github.com'}${path}`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      // GitHub REJECTS any request without a User-Agent with a 403. curl and
      // Chrome supply one automatically, so the extension never noticed — the
      // Cloudflare Worker sends none and every call came back Forbidden.
      'User-Agent': 'sidecar-agent',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`github ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 200)}`);
  }
  return res.json();
}

export interface WriteResult {
  /** The URL of what landed — proof, and what the audit entry cites. */
  url: string;
}

export async function comment(cfg: GitHubConfig, key: string, body: string): Promise<WriteResult> {
  const p = parseKey(key);
  if (!p) throw new Error(`unparseable key ${key}`);
  const r = await api(cfg, `/repos/${p.owner}/${p.repo}/issues/${p.number}/comments`, {
    method: 'POST', body: JSON.stringify({ body }),
  }) as { html_url?: string };
  return { url: r.html_url ?? '' };
}

export async function setState(cfg: GitHubConfig, key: string, state: 'open' | 'closed'): Promise<WriteResult> {
  const p = parseKey(key);
  if (!p) throw new Error(`unparseable key ${key}`);
  const r = await api(cfg, `/repos/${p.owner}/${p.repo}/issues/${p.number}`, {
    method: 'PATCH', body: JSON.stringify({ state }),
  }) as { html_url?: string };
  return { url: r.html_url ?? '' };
}

/** Read back what we wrote. A write we cannot confirm is not 'verified'. */
export async function verifyComment(cfg: GitHubConfig, key: string, body: string): Promise<boolean> {
  const p = parseKey(key);
  if (!p) return false;
  const r = (await api(
    cfg, `/repos/${p.owner}/${p.repo}/issues/${p.number}/comments?per_page=10`,
  )) as { body?: string }[];
  return r.some((c) => c.body?.trim() === body.trim());
}

export async function execute(cfg: GitHubConfig, policy: Policy, action: Action): Promise<WriteResult> {
  const verdict = checkPolicy(policy, action);
  if (!verdict.ok) throw new Error(`blocked by policy: ${verdict.reason}`);
  return action.kind === 'comment'
    ? comment(cfg, action.ticketKey, action.body)
    : setState(cfg, action.ticketKey, action.to === 'closed' ? 'closed' : 'open');
}
