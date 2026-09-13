// The only source that reaches outside your walls.
//
// heuristics.ts can see that an issue NAMES an upstream dependency as a
// blocker. It cannot see whether that dependency has since shipped the fix —
// that fact lives on the public internet, and it is the half of the finding
// that makes it worth raising.
//
// Called only for candidates that already matched external-blocker, so it is
// a handful of searches per sweep, not one per issue.

import type { Source } from './escalation.ts';

export interface ExaConfig {
  apiKey: string;
  baseUrl?: string;
}

interface ExaResult {
  title?: string;
  url?: string;
  publishedDate?: string;
  text?: string;
  summary?: string;
}

/**
 * Recent release/changelog evidence for a dependency, or null.
 *
 * `null` is a normal outcome, not an error: most named blockers have no recent
 * release, and the candidate then stays a weak single-source signal below the
 * surfacing floor. Inventing evidence to reach the threshold would be the worst
 * bug this codebase could have.
 */
export async function releaseEvidence(
  cfg: ExaConfig,
  dep: string,
  since: string,
  now = new Date(),
): Promise<Source | null> {
  // Only look at the window since the issue claimed to be blocked. A release
  // that predates the claim proves nothing about it.
  const from = new Date(Math.max(Date.parse(since), now.getTime() - 180 * 86_400_000));

  const res = await fetch(`${cfg.baseUrl ?? 'https://api.exa.ai'}/search`, {
    method: 'POST',
    headers: { 'x-api-key': cfg.apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: `${dep} release notes changelog fix`,
      numResults: 3,
      startPublishedDate: from.toISOString(),
      type: 'auto',
      contents: { summary: { query: `Did ${dep} ship a fix or a new version?` } },
    }),
  });

  if (!res.ok) {
    throw new Error(`exa ${res.status} ${res.statusText}: ${(await res.text()).slice(0, 160)}`);
  }

  const body = await res.json() as { results?: ExaResult[] };
  const hit = (body.results ?? []).find((r) => r.url && (r.summary || r.title));
  if (!hit) return null;

  // A result with no publish date cannot be placed on the timeline, and the
  // timeline is the argument. Drop it rather than guess a date.
  if (!hit.publishedDate) return null;
  if (Date.parse(hit.publishedDate) <= Date.parse(since)) return null;

  return {
    system: 'exa',
    url: hit.url!,
    excerpt: (hit.summary ?? hit.title ?? '').replace(/\s+/g, ' ').trim().slice(0, 160),
    at: hit.publishedDate,
  };
}
