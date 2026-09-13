// Content script. Two jobs: keep the shadow host alive across Jira's SPA
// navigation, and keep the rail showing the escalations for whatever ticket is
// currently on screen.
//
// Jira Cloud is a React SPA with history-API routing: there is no page load
// between tickets, the URL changes under you, and React will happily unmount
// anything it thinks it owns. So the host element is appended to
// document.documentElement (outside Jira's React root) and re-checked on every
// route change.
import { renderRail, type RailModel } from './rail.ts';
import { FIXTURES, COUNTER } from '../../src/core/fixtures.ts';
import type { Escalation } from '../../src/core/escalation.ts';

const HOST_ID = 'sidecar-host';

let shadow: ShadowRoot | null = null;
let current = '';

function ensureHost(): ShadowRoot {
  const existing = document.getElementById(HOST_ID);
  if (existing?.shadowRoot) return existing.shadowRoot;
  const host = document.createElement('div');
  host.id = HOST_ID;
  // documentElement, not body: Jira re-renders body subtrees.
  document.documentElement.append(host);
  return host.attachShadow({ mode: 'open' });
}

/** GTI-142 out of /browse/GTI-142 or /jira/software/projects/GTI/boards/1?selectedIssue=GTI-142 */
export function ticketKeyFrom(url: string): string | null {
  const u = new URL(url, 'https://x.invalid');
  const q = u.searchParams.get('selectedIssue');
  if (q && /^[A-Z][A-Z0-9]+-\d+$/.test(q)) return q;
  return u.pathname.match(/\/browse\/([A-Z][A-Z0-9]+-\d+)/)?.[1] ?? null;
}

async function load(ticketKey: string): Promise<RailModel> {
  // #7 replaces this with a Trigger.dev public-token read. Until then the
  // fixtures render so the overlay can be built and demoed independently.
  const stored = await chrome.storage.local.get(['escalations', 'heartbeat']);
  const all: Escalation[] = stored.escalations ?? FIXTURES;
  return {
    escalations: all.filter((e) => e.ticketKey === ticketKey),
    counter: COUNTER,
    heartbeat: stored.heartbeat ?? null,
  };
}

async function paint(): Promise<void> {
  const key = ticketKeyFrom(location.href);
  if (!key) {
    document.getElementById(HOST_ID)?.remove();
    shadow = null;
    return;
  }
  shadow = ensureHost();
  const model = await load(key);
  renderRail(shadow, model, {
    onApprove: (id) => chrome.runtime.sendMessage({ type: 'approve', id }),
    onDismiss: (id) => chrome.runtime.sendMessage({ type: 'dismiss', id }),
  });
}

/**
 * Jira routes with pushState/replaceState, neither of which fires an event.
 * Patching them is the only way to hear the navigation the same tick it
 * happens; popstate covers back/forward. A MutationObserver on the whole
 * document would also work and would cost far more.
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
  // Jira sometimes swaps the issue view without touching history; a cheap poll
  // catches that without observing the entire document.
  setInterval(tick, 1000);
  tick();

  // A republished escalation (watcher found something while this tab was open)
  // repaints in place rather than waiting for the next navigation.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && ('escalations' in changes || 'heartbeat' in changes)) void paint();
  });
}
