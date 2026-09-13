// Page-context extractor.
//
// This is the part a chatbox cannot have: what the human is looking at, right
// now, without being told. It must never throw and never block rendering — a
// partial context still lets the rail show what the watcher already found.
//
// GitHub's Issues UI is React with unstable class names; PRs are still largely
// Turbo-rendered HTML. So every field is read through a LADDER of strategies,
// cheapest and most stable first:
//
//   1. embedded JSON      — react-app.embeddedData, GitHub's own payload
//   2. semantic/ARIA      — data-testid, role, aria-label
//   3. legacy class names — the Turbo markup still used on PRs
//   4. document.title     — last resort, but it always exists
//
// Anything that survives a GitHub redesign lives near the top of that ladder.

export interface PageComment {
  author: string;
  body: string;
  at: string | null;
}

export interface PageContext {
  key: string;                 // owner/repo#n
  kind: 'issue' | 'pull';
  title: string | null;
  state: string | null;        // open | closed | merged | draft
  assignees: string[];
  labels: string[];
  body: string | null;
  comments: PageComment[];
  ciStatus: string | null;
  /** Which strategies actually produced data. Rendered in the audit panel so a
   *  degraded extraction is visible rather than silently thin. */
  via: string[];
  extractedAt: string;
}

const text = (n: Element | null | undefined): string | null => {
  const t = n?.textContent?.trim();
  return t ? t.replace(/\s+/g, ' ') : null;
};

const first = (doc: Document, sels: string[]): Element | null => {
  for (const s of sels) {
    const n = doc.querySelector(s);
    if (n) return n;
  }
  return null;
};

const all = (doc: Document, sels: string[]): Element[] => {
  for (const s of sels) {
    const n = [...doc.querySelectorAll(s)];
    if (n.length) return n;
  }
  return [];
};

/** GitHub ships its own React payload in the page. When present it beats every
 *  DOM guess, and it survives redesigns that rename classes. */
export function embeddedPayload(doc: Document): Record<string, unknown> | null {
  for (const s of doc.querySelectorAll('script[type="application/json"]')) {
    const raw = s.textContent;
    if (!raw || raw.length > 2_000_000) continue;
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const payload = (parsed.payload ?? parsed) as Record<string, unknown>;
      if (payload && typeof payload === 'object' &&
          ('preloadedQueries' in payload || 'issue' in payload || 'title' in payload)) {
        return payload;
      }
    } catch { /* not our payload */ }
  }
  return null;
}

/** "Title · Issue #5 · owner/repo" — the one source that always exists. */
export function titleFromDocumentTitle(t: string): string | null {
  const m = t.match(/^(.*?)\s+·\s+(?:Issue|Pull Request)\s+#\d+/i);
  return m?.[1]?.trim() || null;
}

export function extract(doc: Document, key: string, kind: 'issue' | 'pull'): PageContext {
  const via: string[] = [];

  const payload = embeddedPayload(doc);
  if (payload) via.push('embedded');

  const title =
    (typeof payload?.title === 'string' ? payload.title : null) ??
    text(first(doc, [
      '[data-testid="issue-title"]',
      '[data-testid="issue-viewer-issue-title"]',
      'bdi.js-issue-title',
      '.js-issue-title',
      'h1 bdi',
    ])) ??
    titleFromDocumentTitle(doc.title);
  if (title) via.push(payload?.title ? 'embedded:title' : 'dom:title');

  const state = text(first(doc, [
    '[data-testid="header-state"]',
    '[data-testid="issue-state"]',
    '.State',
    '[class*="StateLabel"]',
  ]))?.toLowerCase() ?? null;
  if (state) via.push('dom:state');

  const assignees = all(doc, [
    '[data-testid="issue-assignees"] a',
    '[data-testid="sidebar-assignee"] a',
    '.js-issue-assignees a',
    'a[data-hovercard-type="user"][data-testid*="assignee"]',
  ]).map((n) => text(n) ?? '').filter(Boolean);
  if (assignees.length) via.push('dom:assignees');

  const labels = all(doc, [
    '[data-testid="issue-labels"] a',
    '.js-issue-labels a',
    'a[data-name][href*="/labels/"]',
  ]).map((n) => text(n) ?? '').filter(Boolean);
  if (labels.length) via.push('dom:labels');

  // The first markdown block on an issue page is the issue body; subsequent
  // ones are comments. Ordering is stable across both UIs.
  const markdown = all(doc, ['.markdown-body', '[data-testid="markdown-body"]']);
  const body = text(markdown[0]);
  if (body) via.push('dom:body');

  const commentNodes = all(doc, [
    '[data-testid="comment-viewer-outer-box"]',
    '.js-timeline-item .timeline-comment',
    '.timeline-comment',
  ]);
  const comments: PageComment[] = commentNodes.slice(1).map((n) => ({
    author: text(n.querySelector('a[data-hovercard-type="user"], .author')) ?? 'unknown',
    body: text(n.querySelector('.markdown-body, [data-testid="markdown-body"]')) ?? '',
    at: n.querySelector('relative-time')?.getAttribute('datetime') ?? null,
  })).filter((c) => c.body);
  if (comments.length) via.push('dom:comments');

  const ciStatus = text(first(doc, [
    '[data-testid="statuses-summary"]',
    '.merge-status-list .status-heading',
    '[class*="StatusCheck"]',
  ]));
  if (ciStatus) via.push('dom:ci');

  return {
    key, kind, title, state, assignees, labels, body, comments, ciStatus,
    via,
    extractedAt: new Date().toISOString(),
  };
}

/** How much of the page we actually got. Below 0.5 the rail says so rather
 *  than pretending it read the page. */
export function completeness(ctx: PageContext): number {
  const got = [ctx.title, ctx.state, ctx.body].filter(Boolean).length
            + (ctx.labels.length ? 1 : 0)
            + (ctx.comments.length ? 1 : 0);
  return Number((got / 5).toFixed(2));
}
