// The rail. Rendered into a shadow root so GitHub's stylesheet cannot reach it
// and ours cannot reach GitHub's — a content script that leaks CSS into the host
// app is the fastest way to look broken on someone else's page.
import type { Escalation } from '../../src/core/escalation.ts';

const CSS = `
:host { all: initial; }
.rail {
  position: fixed; top: 0; right: 0; width: 340px; height: 100vh;
  overflow-y: auto; z-index: 2147483000;
  font: 13px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  background: #fff; color: #172b4d; border-left: 1px solid #dfe1e6;
  box-shadow: -2px 0 12px rgba(9,30,66,.08);
}
@media (prefers-color-scheme: dark) {
  .rail { background: #1d2125; color: #c7d1db; border-left-color: #2c333a; }
  .card { background: #22272b; border-color: #2c333a; }
  .proposal { background: #1d2125; }
}
.head { position: sticky; top: 0; background: inherit; padding: 12px 14px;
  border-bottom: 1px solid #dfe1e6; display: flex; flex-direction: column; gap: 4px; }
.brand { font-weight: 600; letter-spacing: .02em; }
.counter { font-size: 11px; opacity: .65; font-variant-numeric: tabular-nums; }
.beat { font-size: 11px; opacity: .5; }
.beat.stale { color: #ae2e24; opacity: 1; }
.card { margin: 10px; padding: 12px; border: 1px solid #dfe1e6; border-radius: 6px;
  background: #fff; display: flex; flex-direction: column; gap: 8px; }
.top { display: flex; align-items: center; gap: 6px; font-size: 11px; }
.chip { padding: 1px 6px; border-radius: 3px; font-weight: 600; text-transform: uppercase;
  font-size: 10px; letter-spacing: .04em; }
.chip.conflict { background: #ffecea; color: #ae2e24; }
.chip.external { background: #e9f2ff; color: #0055cc; }
.chip.stale     { background: #fff7d6; color: #7f5f01; }
.chip.duplicate { background: #f3f0ff; color: #5e4db2; }
.conf { margin-left: auto; opacity: .6; font-variant-numeric: tabular-nums; }
.claim { font-weight: 500; }
details > summary { cursor: pointer; font-size: 12px; opacity: .75; list-style: none; }
details > summary::-webkit-details-marker { display: none; }
details > summary::before { content: '▸ '; }
details[open] > summary::before { content: '▾ '; }
.rows { margin: 6px 0 0; padding-left: 14px; display: flex; flex-direction: column; gap: 5px; }
.row { font-size: 12px; display: flex; gap: 6px; }
.sys { flex: 0 0 62px; opacity: .55; text-transform: uppercase; font-size: 10px; padding-top: 2px; }
.when { opacity: .5; font-size: 11px; }
.proposal { background: #f7f8f9; border-radius: 4px; padding: 8px; font-size: 12px; }
.cap { font-size: 11px; opacity: .6; border-top: 1px solid #dfe1e6; padding: 8px 14px; }
.acts { display: flex; gap: 6px; }
button { font: inherit; font-size: 12px; padding: 5px 10px; border-radius: 4px;
  border: 1px solid #dfe1e6; background: #f7f8f9; color: inherit; cursor: pointer; }
button.primary { background: #0c66e4; border-color: #0c66e4; color: #fff; }
button:hover { filter: brightness(.97); }
.empty { padding: 24px 14px; font-size: 12px; opacity: .55; }
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
}

export interface RailHandlers {
  onApprove(id: string): void;
  onDismiss(id: string): void;
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

function renderCard(e: Escalation, h: RailHandlers): HTMLElement {
  const card = el('div', 'card');

  const top = el('div', 'top');
  top.append(el('span', `chip ${e.severity}`, e.severity));
  top.append(el('span', undefined, e.ticketKey));
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
  head.append(el('div', 'brand', 'Sidecar'));
  const { checked, auto, escalated } = model.counter;
  head.append(el('div', 'counter', `${checked} checked · ${auto} auto · ${escalated} for you`));
  const stale = model.heartbeat === null ||
    Date.now() - Date.parse(model.heartbeat) > STALE_AFTER_MS;
  head.append(el('div', `beat${stale ? ' stale' : ''}`,
    model.heartbeat === null ? 'watcher has never run'
      : stale ? `watcher last ran ${ago(model.heartbeat)} — stale`
      : `watching · last poll ${ago(model.heartbeat)}`));
  rail.append(head);

  const live = model.escalations.filter((e) => e.state !== 'verified');
  if (!live.length) {
    rail.append(el('div', 'empty', 'Nothing to raise on this ticket.'));
  }
  for (const e of live) rail.append(renderCard(e, h));

  rail.append(el('div', 'cap', '🔒 can comment · transition — read-only everywhere else'));
  root.append(rail);
}
