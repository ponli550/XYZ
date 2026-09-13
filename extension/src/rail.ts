// The rail. Rendered into a shadow root so GitHub's stylesheet cannot reach it
// and ours cannot reach GitHub's — a content script that leaks CSS into the host
// app is the fastest way to look broken on someone else's page.
import type { Escalation } from '../../src/core/escalation.ts';
import { describe as describeEntry, type AuditEntry } from '../../src/core/audit.ts';
import { TOKENS } from './tokens.ts';

const CSS = `
:host { all: initial; }
.rail {
  ${TOKENS}
  position: fixed; top: 0; right: 0; width: 360px; height: 100vh;
  overflow-y: auto; z-index: 2147483000;
  font: 13px/1.55 var(--ds-font);
  background: var(--ds-bg); color: var(--ds-ink);
  border-left: 1px solid var(--ds-line);
  box-shadow: var(--ds-shadow-3);
}
.head { position: sticky; top: 0; z-index: 1; background: var(--ds-bg);
  padding: var(--ds-space-4); border-bottom: 1px solid var(--ds-line);
  display: flex; flex-direction: column; gap: var(--ds-space-1); }
.brand { font-family: var(--ds-font-display); font-size: 17px; font-weight: 600;
  letter-spacing: -.01em; display: flex; align-items: center; }
.collapse { margin-left: auto; border: 0; background: none; font-size: 17px;
  line-height: 1; padding: 0 2px; cursor: pointer; color: var(--ds-ink-muted); }
.collapse:hover { color: var(--ds-ink); }
.counter { font-size: 11px; color: var(--ds-ink-muted); font-variant-numeric: tabular-nums; }
.beat { font-size: 11px; color: var(--ds-ink-muted); }
.beat.stale { color: var(--ds-danger); }

.card { margin: var(--ds-space-3); padding: var(--ds-space-4);
  border: 1px solid var(--ds-line); border-radius: var(--ds-radius-lg);
  background: var(--ds-surface); box-shadow: var(--ds-shadow-1);
  display: flex; flex-direction: column; gap: var(--ds-space-2); }
.top { display: flex; align-items: center; gap: var(--ds-space-2); font-size: 11px; }
.chip { padding: 2px 9px; border-radius: var(--ds-radius-pill); font-weight: 600;
  text-transform: uppercase; font-size: 9px; letter-spacing: .06em; }
.chip.conflict  { background: var(--ds-danger-soft); color: var(--ds-danger-soft-ink); }
.chip.external  { background: var(--ds-accent-soft); color: var(--ds-accent-soft-ink); }
.chip.stale     { background: var(--ds-warn-soft);   color: var(--ds-warn-soft-ink); }
.chip.duplicate { background: var(--ds-surface-warm); color: var(--ds-ink-muted); }
.conf { margin-left: auto; color: var(--ds-ink-muted); font-variant-numeric: tabular-nums; }
.claim { font-family: var(--ds-font-display); font-size: 15px; line-height: 1.4;
  letter-spacing: -.005em; }

details > summary { cursor: pointer; font-size: 12px; color: var(--ds-ink-muted);
  list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: '\u25B8 '; }
details[open] > summary::before { content: '\u25BE '; }
.rows { margin: var(--ds-space-2) 0 0; padding-left: var(--ds-space-3);
  display: flex; flex-direction: column; gap: var(--ds-space-1); }
.row { font-size: 12px; display: flex; gap: var(--ds-space-2); }
.sys { flex: 0 0 60px; color: var(--ds-ink-muted); text-transform: uppercase;
  font-size: 9px; letter-spacing: .05em; padding-top: 3px; }
.when { color: var(--ds-ink-muted); font-size: 11px; }

.proposal { background: var(--ds-surface-warm); border-radius: var(--ds-radius);
  padding: var(--ds-space-3); font-size: 12px; line-height: 1.5;
  border-left: 2px solid var(--ds-almond); }
.acts { display: flex; gap: var(--ds-space-2); margin-top: var(--ds-space-1); }
button { font: inherit; font-size: 12px; padding: 7px 14px;
  border-radius: var(--ds-radius-pill); border: 1px solid var(--ds-line);
  background: var(--ds-surface); color: var(--ds-ink); cursor: pointer;
  transition: background .12s, border-color .12s; }
button:hover { background: var(--ds-surface-warm); }
button.primary { background: var(--ds-accent); border-color: var(--ds-accent);
  color: var(--ds-accent-ink); }
button.primary:hover { background: var(--ds-accent-hover); }

.cap { font-size: 11px; color: var(--ds-ink-muted);
  border-top: 1px solid var(--ds-line); padding: var(--ds-space-3) var(--ds-space-4); }
.empty { padding: var(--ds-space-6) var(--ds-space-4); font-size: 12px;
  color: var(--ds-ink-muted); }
.activity { border-top: 1px solid var(--ds-line); padding: var(--ds-space-3) var(--ds-space-4); }
.activity > summary { font-size: 12px; }
.log { margin: var(--ds-space-2) 0 0; display: flex; flex-direction: column; gap: var(--ds-space-1); }
.logrow { display: flex; gap: var(--ds-space-2); font-size: 11px; align-items: baseline; }
.logtime { flex: 0 0 34px; color: var(--ds-ink-muted); font-variant-numeric: tabular-nums; }
.logkind { flex: 0 0 54px; text-transform: uppercase; font-size: 9px;
  letter-spacing: .05em; padding-top: 1px; color: var(--ds-ink-muted); }
.logkind.blocked, .logkind.failed { color: var(--ds-danger); }
.logkind.verified, .logkind.wrote { color: var(--ds-ok); }
.logkind.deferred { color: var(--ds-warn); }
.logwho { color: var(--ds-ink-muted); }
`;

const ago = (iso: string, now = Date.now()): string => {
  const m = Math.round((now - Date.parse(iso)) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.round(h / 24)}d ago`;
};

export interface RailModel {
  escalations: Escalation[];
  counter: { checked: number; auto: number; escalated: number };
  heartbeat: string | null;   // ISO of last successful poll; null = never ran
  /** Sources that failed this sweep. Shown, never swallowed. */
  degraded?: string[];
  /** Budget window, when the model refused. Also shown rather than hidden. */
  budget?: { limited: boolean; until: number | null; pending: number } | null;
  /** What the user has actually granted. The footer must not overstate this. */
  capabilities?: string[];
  paused?: boolean;
  /** Everything the agent decided, rendered in-page. */
  auditLog?: AuditEntry[];
  /** 'artifact' on an issue or PR; 'repo' anywhere else inside a repository. */
  scope?: 'artifact' | 'repo';
}

export interface RailHandlers {
  onApprove(id: string): void;
  onDismiss(id: string): void;
  onCollapse(): void;
  onOpenTicket(ticketKey: string): void;
}

const el = (tag: string, cls?: string, text?: string): HTMLElement => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text !== undefined) n.textContent = text;
  return n;
};

// A stale heartbeat must LOOK stale. The daemon's lesson: a silent loop and a
// dead loop are indistinguishable unless you render the clock.
const STALE_AFTER_MS = 6 * 60 * 1000;

function renderCard(e: Escalation, h: RailHandlers, scope: 'artifact' | 'repo'): HTMLElement {
  const card = el('div', 'card');

  const top = el('div', 'top');
  top.append(el('span', `chip ${e.severity}`, e.severity));
  const keyEl = el('span', undefined, e.ticketKey);
  top.append(keyEl);
  top.append(el('span', 'conf', `${Math.round(e.confidence * 100)}%`));
  card.append(top);

  card.append(el('div', 'claim', e.claim));

  const ev = el('details') as HTMLDetailsElement;
  ev.append(el('summary', undefined, `Evidence (${e.evidence.length})`));
  const rows = el('div', 'rows');
  for (const s of e.evidence) {
    const r = el('div', 'row');
    r.append(el('span', 'sys', s.system));
    const body = el('span');
    body.append(el('span', undefined, s.excerpt), el('span', 'when', ` · ${ago(s.at)}`));
    r.append(body);
    rows.append(r);
  }
  ev.append(rows);
  card.append(ev);

  if (e.history.length) {
    const tl = el('details') as HTMLDetailsElement;
    tl.append(el('summary', undefined, 'Timeline'));
    const trows = el('div', 'rows');
    for (const t of e.history) {
      const r = el('div', 'row');
      r.append(el('span', 'sys', new Date(t.at).toISOString().slice(11, 16)));
      const body = el('span');
      body.append(el('span', undefined, `${t.to} — ${t.why}`),
                  el('span', 'when', ` · ${Math.round(t.confidence * 100)}%`));
      r.append(body);
      trows.append(r);
    }
    tl.append(trows);
    card.append(tl);
  }

  if (e.watch) {
    card.append(el('div', 'when', `Parked — ${e.watch.condition}`));
  }

  // From the repo view a card is a signpost: the action belongs on the artifact
  // it is about, where the human can see the thing before approving a change
  // to it. Approving blind from a list is how an agent gets rubber-stamped.
  if (scope === 'repo') {
    const go = el('button', undefined, `Open ${e.ticketKey.split('#')[1] ? '#' + e.ticketKey.split('#')[1] : ''}`) as HTMLButtonElement;
    go.addEventListener('click', () => h.onOpenTicket(e.ticketKey));
    const acts = el('div', 'acts');
    acts.append(go);
    card.append(acts);
    return card;
  }

  if (e.proposal) {
    const p = el('div', 'proposal');
    p.textContent = e.proposal.kind === 'comment'
      ? e.proposal.body
      : `Transition → ${e.proposal.to}`;
    card.append(p);

    const acts = el('div', 'acts');
    const approve = el('button', 'primary', 'Approve') as HTMLButtonElement;
    approve.addEventListener('click', () => h.onApprove(e.id));
    const dismiss = el('button', undefined, 'Dismiss') as HTMLButtonElement;
    dismiss.addEventListener('click', () => h.onDismiss(e.id));
    acts.append(approve, dismiss);
    card.append(acts);
  }

  return card;
}

export function renderRail(root: ShadowRoot, model: RailModel, h: RailHandlers): void {
  root.replaceChildren();
  const style = document.createElement('style');
  style.textContent = CSS;
  root.append(style);

  const rail = el('div', 'rail');

  const head = el('div', 'head');
  const brand = el('div', 'brand', 'Sidecar');
  const collapse = el('button', 'collapse', '\u00d7') as HTMLButtonElement;
  collapse.title = 'Collapse';
  collapse.addEventListener('click', () => h.onCollapse());
  brand.append(collapse);
  head.append(brand);
  const { checked, auto, escalated } = model.counter;
  head.append(el('div', 'counter', `${checked} checked · ${auto} auto · ${escalated} for you`));
  const stale = model.heartbeat === null ||
    Date.now() - Date.parse(model.heartbeat) > STALE_AFTER_MS;
  head.append(el('div', `beat${stale ? ' stale' : ''}`,
    model.heartbeat === null ? 'watcher has never run'
      : stale ? `watcher last ran ${ago(model.heartbeat)} — stale`
      : `watching · last poll ${ago(model.heartbeat)}`));
  if (model.budget?.limited) {
    const until = model.budget.until
      ? new Date(model.budget.until).toISOString().slice(11, 16) : '';
    head.append(el('div', 'beat stale',
      `budget limited until ${until} — ${model.budget.pending} parked, nothing lost`));
  }
  for (const d of model.degraded ?? []) {
    head.append(el('div', 'beat stale', `degraded — ${d}`));
  }
  rail.append(head);

  const live = model.escalations.filter((e) => e.state !== 'verified');
  if (!live.length) {
    rail.append(el('div', 'empty', model.scope === 'repo'
      ? 'Nothing to raise anywhere in this repo.'
      : 'Nothing to raise on this issue.'));
  }
  for (const e of live) rail.append(renderCard(e, h, model.scope ?? 'artifact'));

  // The footer stated "can comment · transition" regardless of what was
  // switched on. Claiming a power the agent does not have is the same class of
  // bug as drafting a comment that promises a close it cannot perform.
  const caps = model.capabilities ?? [];
  // The activity log renders here rather than living only in extension storage.
  // Showing a policy denial used to mean opening DevTools — which is where the
  // GitHub token is. The safety story should not require exposing the token to
  // tell it.
  const log = model.auditLog ?? [];
  if (log.length) {
    const act = el('details', 'activity') as HTMLDetailsElement;
    act.append(el('summary', undefined, `Activity (${log.length})`));
    const rows = el('div', 'log');
    for (const e of log.slice(0, 25)) {
      const row = el('div', 'logrow');
      row.append(el('span', 'logtime', new Date(e.at).toISOString().slice(11, 16)));
      row.append(el('span', `logkind ${e.kind}`, e.kind));
      const body = el('span');
      body.append(el('span', undefined, describeEntry(e)));
      if (e.detail) body.append(el('span', 'logwho', ` — ${e.detail.slice(0, 70)}`));
      row.append(body);
      rows.append(row);
    }
    act.append(rows);
    rail.append(act);
  }

  rail.append(el('div', 'cap',
    model.paused ? '⏸ paused — the agent will not act'
    : caps.length ? `🔒 can ${caps.join(' · ')} — read-only everywhere else`
    : '🔒 read-only — no write capability granted'));
  root.append(rail);
}
