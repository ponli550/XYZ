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
 *
 * The window deliberately does NOT start at the issue's own date. The first
 * version of this required the release to POSTDATE the claim, which is
 * backwards: a release that predates it is the more damning finding — you filed
 * this saying you were blocked, and it had already shipped. The relationship is
 * recorded in the excerpt so the draft can say which case it is, rather than
 * being used to discard the evidence.
 */
export async function releaseEvidence(
  cfg: ExaConfig,
  dep: string,
  since: string,
  now = new Date(),
  windowDays = 180,
): Promise<Source | null> {
  const from = new Date(now.getTime() - windowDays * 86_400_000);

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

  // A result with no publish date cannot be placed on the timeline, and the
  // timeline is the argument — so undated results are skipped, not dated by
  // guess. Take the most recent of what remains.
  const dated = (body.results ?? [])
    .filter((r) => r.url && r.publishedDate && (r.summary || r.title))
    .sort((a, b) => Date.parse(b.publishedDate!) - Date.parse(a.publishedDate!));

  const hit = dated[0];
  if (!hit) return null;

  const claimed = Date.parse(since);
  const shipped = Date.parse(hit.publishedDate!);
  const relation = shipped <= claimed
    ? 'already shipped before this was filed'
    : 'shipped since this was filed';

  return {
    system: 'exa',
    url: hit.url!,
    excerpt: `${(hit.title ?? hit.summary ?? '').replace(/\s+/g, ' ').trim().slice(0, 110)} — ${relation}`,
    at: hit.publishedDate!,
  };
}
