// Service worker. Three jobs: wake on an alarm and notify, execute approvals,
// and keep the audit log. It is the only place in the extension that holds the
// token, so it is the only place that can spend it.
import type { Escalation } from '../../src/core/escalation.ts';
import { transition } from '../../src/core/escalation.ts';
import { execute, verifyComment, checkPolicy, DEFAULT_POLICY,
         type Policy, type GitHubConfig } from '../../src/core/github.ts';
import { entry, append, type AuditEntry } from '../../src/core/audit.ts';
import { readRepo } from '../../src/core/sources.ts';
import { sweep } from '../../src/core/heuristics.ts';
import { draftEscalation } from '../../src/core/draft.ts';
import { merge } from '../../src/core/merge.ts';
import { evaluateWatches } from '../../src/core/watch.ts';
import type { Snapshot } from '../../src/core/heuristics.ts';
import { BudgetGuard } from '../../src/core/budget.ts';
import { releaseEvidence } from '../../src/core/exa.ts';
import type { Candidate } from '../../src/core/heuristics.ts';

// One guard for the life of the worker. A refusal recorded on one sweep must
// still be in force on the next, or the budget window means nothing.
const guard = new BudgetGuard<Candidate>();

const POLL_ALARM = 'sidecar-poll';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 2 });
  // Fixtures were scaffolding for building the rail before the watcher
  // existed. The watcher is real now, so a fresh install starts empty and
  // fills from the repo — seeded cards alongside real ones is just confusing.
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === POLL_ALARM) void poll();
});

// Sweep once on wake rather than waiting up to two minutes for the first
// alarm — otherwise a freshly reloaded extension looks dead.
void poll();

async function settings(): Promise<{ cfg: GitHubConfig; policy: Policy; paused: boolean }> {
  const s = await chrome.storage.local.get(['githubToken', 'repos', 'capabilities', 'paused']);
  return {
    cfg: { token: s.githubToken ?? '' },
    policy: s.repos?.length || s.capabilities?.length
      ? { allowed: s.capabilities ?? [], repos: s.repos ?? [] }
      : DEFAULT_POLICY,
    paused: Boolean(s.paused),
  };
}

async function audit(e: AuditEntry): Promise<void> {
  const { auditLog = [] } = await chrome.storage.local.get('auditLog');
  await chrome.storage.local.set({ auditLog: append(auditLog as AuditEntry[], e) });
}

async function patch(id: string, fn: (e: Escalation) => Escalation): Promise<Escalation | null> {
  const { escalations = [] } = await chrome.storage.local.get('escalations');
  const list = escalations as Escalation[];
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return null;
  const next = fn(list[i]!);
  list[i] = next;
  await chrome.storage.local.set({ escalations: list });
  return next;
}

async function approve(id: string): Promise<void> {
  const { cfg, policy, paused } = await settings();
  const { escalations = [] } = await chrome.storage.local.get('escalations');
  const e = (escalations as Escalation[]).find((x) => x.id === id);
  if (!e?.proposal) return;

  if (paused) {
    await audit(entry('blocked', e.ticketKey, 'agent is paused', 'human'));
    return;
  }

  const verdict = checkPolicy(policy, e.proposal);
  if (!verdict.ok) {
    await audit(entry('blocked', e.ticketKey, verdict.reason, 'agent'));
    return;
  }

  await patch(id, (x) => transition(x, 'approved', 'human approved'));
  await audit(entry('approved', e.ticketKey, e.claim, 'human'));

  try {
    const r = await execute(cfg, policy, e.proposal);
    await audit(entry('wrote', e.ticketKey, r.url || 'written', 'agent'));

    // A write we cannot read back is not verified. The state machine allows
    // approved -> proposed precisely so an unconfirmed write returns the card
    // to the human instead of claiming success.
    const confirmed = e.proposal.kind === 'comment'
      ? await verifyComment(cfg, e.ticketKey, e.proposal.body)
      : true;

    if (confirmed) {
      await patch(id, (x) => transition(x, 'verified', 'read back from GitHub'));
      await audit(entry('verified', e.ticketKey, 'confirmed on GitHub', 'agent'));
    } else {
      await patch(id, (x) => transition(x, 'proposed', 'write could not be confirmed'));
      await audit(entry('failed', e.ticketKey, 'write not found on read-back', 'agent'));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await patch(id, (x) => transition(x, 'proposed', `write failed: ${msg.slice(0, 80)}`));
    await audit(entry('failed', e.ticketKey, msg.slice(0, 200), 'agent'));
  }
}

async function dismiss(id: string): Promise<void> {
  const next = await patch(id, (x) => transition(x, 'dismissed', 'human dismissed', {
    // Dismissal parks the finding with a re-open condition rather than
    // deleting it. #9 evaluates these.
    watch: {
      condition: 're-check if this issue changes state',
      check: { kind: 'fieldChanged', ticketKey: x.ticketKey, field: 'state', from: 'open' },
      until: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    },
  }));
  if (next) await audit(entry('dismissed', next.ticketKey, next.claim, 'human'));
}

/**
 * The watcher. Runs on chrome.alarms, so it fires with the browser window
 * closed — that is the whole ambient claim, and it needs no cloud.
 *
 * Order matters and is the budget strategy: read (free) -> deterministic sweep
 * (free) -> model call ONLY for what survived. Most sweeps spend nothing.
 */
async function poll(): Promise<void> {
  const st = await chrome.storage.local.get(
    ['githubToken', 'openrouterKey', 'exaKey', 'model', 'repos', 'capabilities',
     'paused', 'escalations', 'notified', 'counter', 'viewing']);

  if (st.paused) return;
  if (!st.githubToken || !st.repos?.length) {
    await chrome.storage.local.set({ heartbeat: null, degraded: ['not configured'] });
    return;
  }

  const degraded: string[] = [];
  let checked = 0;
  const candidates: Candidate[] = [];
  const allSnapshots: Snapshot[] = [];

  for (const spec of st.repos as string[]) {
    const [owner, repo] = spec.replace('/*', '/').split('/');
    if (!owner || !repo) continue;
    const r = await readRepo({ token: st.githubToken }, owner, repo);
    degraded.push(...r.degraded);

    // The artifact the human currently has open goes first. Scarce model
    // budget is spent where their attention already is — the reason this
    // agent lives on the page rather than in a dashboard.
    const open = st.viewing?.key as string | undefined;
    const ordered = open
      ? [...r.snapshots].sort((a, b) => (a.key === open ? -1 : b.key === open ? 1 : 0))
      : r.snapshots;

    const result = sweep(ordered);
    checked += result.checked;
    candidates.push(...result.candidates);
    allSnapshots.push(...r.snapshots);
  }

  // Dismissals are evaluated BEFORE drafting: a re-opened finding already has
  // its claim and proposal, so it costs nothing to bring back. Free, and it is
  // the moment that reads as the agent having remembered.
  const watched = evaluateWatches((st.escalations ?? []) as Escalation[], allSnapshots);

  // An external-blocker candidate is a single weak signal: the issue SAYS it is
  // blocked on something. Exa supplies the other half — whether that something
  // has since shipped. Without it the candidate stays below the surfacing floor
  // and the human never sees it, which is the correct outcome, not a bug.
  if (st.exaKey) {
    for (const c of candidates) {
      if (c.severity !== 'external') continue;
      const snap = allSnapshots.find((s2) => s2.key === c.key);
      const dep = snap?.externalDeps[0];
      if (!dep) continue;
      try {
        const ev = await releaseEvidence({ apiKey: st.exaKey }, dep, snap!.createdAt);
        if (ev) { c.evidence.push(ev); c.prior = Math.max(c.prior, 0.7); }
      } catch (e) {
        degraded.push(`exa ${dep}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  // Draft only the candidates above the surfacing floor, and only until the
  // budget says stop. guarded() parks the rest for replay.
  const drafted: Escalation[] = [];
  for (const c of candidates) {
    const out = await draftEscalation(guard, {
      apiKey: st.openrouterKey ?? '',
      model: st.model ?? 'openai/gpt-4o-mini',
      capabilities: st.capabilities ?? ['comment'],
    }, c).catch((e) => {
      degraded.push(`draft ${c.key}: ${e instanceof Error ? e.message : String(e)}`);
      return { escalation: null, deferred: false };
    });
    if (out.escalation) drafted.push(out.escalation);
  }

  const { escalations, fresh } = merge(watched.escalations, drafted);
  // A re-open deserves a notification even though it is not a new finding.
  fresh.push(...watched.reopened);
  const notified: string[] = st.notified ?? [];

  for (const id of fresh) {
    const e = escalations.find((x) => x.id === id);
    if (!e || notified.includes(id)) continue;
    chrome.notifications.create(id, {
      type: 'basic', iconUrl: 'icon128.png',
      title: `${e.ticketKey} — ${e.severity}`, message: e.claim,
    });
  }

  await chrome.storage.local.set({
    escalations,
    // A re-opened finding was notified once already; it has to be allowed to
    // notify again, or "it came back" is invisible.
    notified: [...new Set([...notified.filter((n) => !watched.reopened.includes(n)), ...fresh])],
    heartbeat: new Date().toISOString(),
    degraded,
    // The counter is the real accounting, not decoration: checked minus what
    // reached a human is what the restraint claim rests on.
    counter: {
      checked: (st.counter?.checked ?? 0) + checked,
      auto: (st.counter?.auto ?? 0) + (checked - drafted.length),
      escalated: escalations.filter((e) => e.state === 'proposed').length,
    },
    budget: { limited: guard.limited(), until: guard.limitedUntil(), pending: guard.pending() },
  });
}

chrome.notifications.onClicked.addListener(async (id) => {
  const { escalations = [] } = await chrome.storage.local.get('escalations');
  const e = (escalations as Escalation[]).find((x) => x.id === id);
  if (e) await chrome.tabs.create({ url: `https://github.com/${e.ticketKey.replace('#', '/issues/')}` });
});

chrome.runtime.onMessage.addListener((msg: { type: string; id: string }) => {
  if (msg.type === 'approve') void approve(msg.id);
  if (msg.type === 'dismiss') void dismiss(msg.id);
  if (msg.type === 'poll') void poll();
  // Fire-and-forget: the rail repaints from storage.onChanged, not from a reply.
});
