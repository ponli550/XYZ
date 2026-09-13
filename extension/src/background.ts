// Service worker. Three jobs: wake on an alarm and notify, execute approvals,
// and keep the audit log. It is the only place in the extension that holds the
// token, so it is the only place that can spend it.
import type { Escalation } from '../../src/core/escalation.ts';
import { transition } from '../../src/core/escalation.ts';
import { execute, verifyComment, checkPolicy, DEFAULT_POLICY,
         type Policy, type GitHubConfig } from '../../src/core/github.ts';
import { entry, append, type AuditEntry } from '../../src/core/audit.ts';
import { FIXTURES } from '../../src/core/fixtures.ts';

const POLL_ALARM = 'sidecar-poll';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 2 });
  // Seed the demo escalations so Approve has something real to mutate. The
  // rail falls back to the same fixtures in memory, but the service worker
  // writes through storage, so they have to exist there too.
  const { escalations } = await chrome.storage.local.get('escalations');
  if (!escalations) await chrome.storage.local.set({ escalations: FIXTURES });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === POLL_ALARM) void poll();
});

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

async function poll(): Promise<void> {
  const { escalations = [], notified = [] } =
    await chrome.storage.local.get(['escalations', 'notified']);
  const fresh = (escalations as Escalation[])
    .filter((e) => e.state === 'proposed' && !notified.includes(e.id));
  if (!fresh.length) return;
  for (const e of fresh) {
    chrome.notifications.create(e.id, {
      type: 'basic', iconUrl: 'icon128.png',
      title: `${e.ticketKey} — ${e.severity}`, message: e.claim,
    });
  }
  await chrome.storage.local.set({ notified: [...notified, ...fresh.map((e) => e.id)] });
}

chrome.notifications.onClicked.addListener(async (id) => {
  const { escalations = [] } = await chrome.storage.local.get('escalations');
  const e = (escalations as Escalation[]).find((x) => x.id === id);
  if (e) await chrome.tabs.create({ url: `https://github.com/${e.ticketKey.replace('#', '/issues/')}` });
});

chrome.runtime.onMessage.addListener((msg: { type: string; id: string }) => {
  if (msg.type === 'approve') void approve(msg.id);
  if (msg.type === 'dismiss') void dismiss(msg.id);
  // Fire-and-forget: the rail repaints from storage.onChanged, not from a reply.
});
