// Content script. Two jobs: keep the shadow host alive across GitHub's SPA
// navigation, and keep the rail showing the escalations for whatever issue or
// PR is currently on screen.
//
// GitHub routes with Turbo: no page load between issues, the URL changes under
// you, and the <turbo-frame> swap replaces large subtrees. So the host element
// is appended to document.documentElement (outside anything Turbo owns) and
// re-checked on every route change.
import { renderRail, type RailModel } from './rail.ts';
import { extract, completeness } from './extract.ts';
import { renderCreature, moodFor } from './creature.ts';
import type { Escalation } from '../../src/core/escalation.ts';

const HOST_ID = 'sidecar-host';
const RAIL_W = 340;

/** Collapsed by default. The rail is what you open, not what greets you. */
let expanded = false;

/**
 * Reserve the rail's width on the document instead of floating over it.
 * Overlaying hid GitHub's own sidebar (assignees, labels), which makes the
 * agent look like something covering your work rather than part of it —
 * exactly the impression this whole design is trying to avoid.
 */
function reserveGutter(on: boolean): void {
  const root = document.documentElement;
  root.style.marginRight = on ? `${RAIL_W}px` : '';
  root.style.transition = 'margin-right .12s ease-out';
  // GitHub pins its own header; without this it stays full-bleed under the rail.
  root.style.setProperty('--sidecar-gutter', on ? `${RAIL_W}px` : '0px');
}

let shadow: ShadowRoot | null = null;
let current = '';

function ensureHost(): ShadowRoot {
  const existing = document.getElementById(HOST_ID);
  if (existing?.shadowRoot) return existing.shadowRoot;
  const host = document.createElement('div');
  host.id = HOST_ID;
  // documentElement, not body: Turbo swaps body subtrees.
  document.documentElement.append(host);
  return host.attachShadow({ mode: 'open' });
}

/**
 * "owner/repo#7" out of /owner/repo/issues/7 or /owner/repo/pull/7.
 * Issues and PRs share a number space on GitHub, so one key covers both and
 * an escalation raised on an issue still matches when you open its PR.
 */
export function ticketKeyFrom(url: string): string | null {
  const m = new URL(url, 'https://x.invalid').pathname
    .match(/^\/([^/]+)\/([^/]+)\/(?:issues|pull)\/(\d+)(?:\/|$)/);
  return m ? `${m[1]}/${m[2]}#${m[3]}` : null;
}

/** Reserved first path segments that are GitHub's own, not an account. */
const NOT_OWNERS = new Set([
  'settings', 'notifications', 'explore', 'marketplace', 'pulls', 'issues',
  'codespaces', 'sponsors', 'organizations', 'new', 'login', 'logout', 'about',
  'apps', 'topics', 'trending', 'collections', 'events', 'security', 'search',
  'dashboard', 'stars', 'watching', 'account', 'orgs',
]);

/**
 * "owner/repo" for any page inside a repository — the root, code, issues list,
 * actions, settings. Without this the agent only existed on a single issue,
 * which is the one place you have already found the problem.
 */
export function repoFrom(url: string): string | null {
  const seg = new URL(url, 'https://x.invalid').pathname.split('/').filter(Boolean);
  if (seg.length < 2) return null;
  if (NOT_OWNERS.has(seg[0]!.toLowerCase())) return null;
  return `${seg[0]}/${seg[1]}`;
}

/** Everything on this repo, for the repo-level view. */
function scopeToRepo(all: Escalation[], repo: string): Escalation[] {
  return all.filter((e) => e.ticketKey.split('#')[0] === repo);
}

async function load(ticketKey: string | null, repo: string | null): Promise<RailModel> {
  const stored = await chrome.storage.local.get(
    ['escalations', 'heartbeat', 'counter', 'degraded', 'budget',
     'capabilities', 'paused', 'auditLog']);
  const all: Escalation[] = stored.escalations ?? [];
  return {
    // On an artifact: just that artifact. Anywhere else in the repo: the whole
    // repo, so opening the repo at all tells you whether anything needs you.
    escalations: ticketKey
      ? all.filter((e) => e.ticketKey === ticketKey)
      : repo ? scopeToRepo(all, repo) : [],
    scope: ticketKey ? 'artifact' : 'repo',
    counter: stored.counter ?? { checked: 0, auto: 0, escalated: 0 },
    heartbeat: stored.heartbeat ?? null,
    degraded: stored.degraded ?? [],
    budget: stored.budget ?? null,
    capabilities: stored.capabilities ?? [],
    paused: Boolean(stored.paused),
    // Repo-wide, not filtered to this artifact: the point of an activity log is
    // seeing what the agent has been doing while you were elsewhere.
    auditLog: stored.auditLog ?? [],
  };
}

async function paint(): Promise<void> {
  const key = ticketKeyFrom(location.href);
  const repo = repoFrom(location.href);

  // Off GitHub's repo pages entirely — a profile, notifications, settings.
  // Nothing to say, so say nothing and take no space.
  if (!key && !repo) {
    document.getElementById(HOST_ID)?.remove();
    reserveGutter(false);
    shadow = null;
    return;
  }
  shadow = ensureHost();

  // What the human is looking at, right now. Published so the watcher can
  // prioritise the open artifact over everything else in its queue — that
  // prioritisation is the whole reason the agent lives on the page.
  if (key) {
    const ctx = extract(document, key, location.pathname.includes('/pull/') ? 'pull' : 'issue');
    void chrome.storage.local.set({ viewing: { ...ctx, completeness: completeness(ctx) } });
  }

  const model = await load(key, repo);
  const waiting = model.escalations.filter((e) => e.state === 'proposed').length;

  // Collapsed, the agent is a presence on the page rather than a panel beside
  // it. The gutter is only reserved once you open the rail — an agent that
  // reflows your page before you have asked for anything is an intrusion.
  if (!expanded) {
    reserveGutter(false);
    const { creaturePos } = await chrome.storage.local.get('creaturePos');
    renderCreature(shadow, {
      mood: moodFor({
        paused: model.paused,
        limited: model.budget?.limited,
        pending: model.budget?.pending,
        waiting,
      }),
      count: waiting,
      x: creaturePos?.x ?? window.innerWidth - 130,
      y: creaturePos?.y ?? window.innerHeight - 120,
    }, { onOpen: () => { expanded = true; void paint(); } });
    return;
  }

  reserveGutter(true);
  renderRail(shadow, model, {
    onApprove: (id) => chrome.runtime.sendMessage({ type: 'approve', id }),
    onDismiss: (id) => chrome.runtime.sendMessage({ type: 'dismiss', id }),
    onCollapse: () => { expanded = false; void paint(); },
    // From the repo view a card is a signpost, not a control: go to the thing.
    onOpenTicket: (ticketKey) => {
      location.href = `https://github.com/${ticketKey.replace('#', '/issues/')}`;
    },
  });
}

/**
 * GitHub's Turbo routes with pushState/replaceState, neither of which fires an
 * event. Patching them is the only way to hear the navigation the same tick it
 * happens; popstate covers back/forward. Turbo also emits turbo:load, but
 * patching history covers the cases Turbo doesn't drive.
 */
function onRouteChange(fn: () => void): void {
  for (const m of ['pushState', 'replaceState'] as const) {
    const orig = history[m];
    history[m] = function (this: History, ...args: Parameters<History['pushState']>) {
      const r = orig.apply(this, args);
      fn();
      return r;
    };
  }
  addEventListener('popstate', fn);
}

function tick(): void {
  if (location.href === current) return;
  current = location.href;
  void paint();
}

// Bootstrap only in a page. Guarding it keeps this module importable by the
// unit tests, which exercise ticketKeyFrom without a DOM.
if (typeof history !== 'undefined' && typeof chrome !== 'undefined') {
  onRouteChange(tick);
  // Turbo frame swaps can land without a history entry; a cheap poll catches
  // that without observing the entire document.
  setInterval(tick, 1000);
  tick();

  // A republished escalation (watcher found something while this tab was open)
  // repaints in place rather than waiting for the next navigation.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (['escalations', 'heartbeat', 'counter', 'degraded', 'budget',
         'capabilities', 'paused', 'auditLog'].some((k) => k in changes)) {
      void paint();
    }
  });
}
