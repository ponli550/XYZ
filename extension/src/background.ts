// Service worker. Wakes on an alarm, reads what the watcher found, and fires a
// native notification when something new needs a human. chrome.alarms is what
// lets this run with no window open — which is the whole ambient claim.
import type { Escalation } from '../../src/core/escalation.ts';

const POLL_ALARM = 'sidecar-poll';

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(POLL_ALARM, { periodInMinutes: 2 });
});

chrome.alarms.onAlarm.addListener(async (a) => {
  if (a.name !== POLL_ALARM) return;
  await poll();
});

async function poll(): Promise<void> {
  // #7 supplies the Trigger.dev public-token read here.
  const { escalations = [], notified = [] } =
    await chrome.storage.local.get(['escalations', 'notified']);

  const fresh = (escalations as Escalation[]).filter(
    (e) => e.state === 'proposed' && !notified.includes(e.id));
  if (!fresh.length) return;

  for (const e of fresh) {
    chrome.notifications.create(e.id, {
      type: 'basic',
      iconUrl: 'icon128.png',
      title: `${e.ticketKey} — ${e.severity}`,
      message: e.claim,
    });
  }
  await chrome.storage.local.set({ notified: [...notified, ...fresh.map((e) => e.id)] });
}

chrome.notifications.onClicked.addListener(async (id) => {
  const { escalations = [] } = await chrome.storage.local.get('escalations');
  const e = (escalations as Escalation[]).find((x) => x.id === id);
  if (e) await chrome.tabs.create({ url: `https://github.com/${e.ticketKey.replace('#', '/issues/')}` });
});

chrome.runtime.onMessage.addListener((msg) => {
  // #6 wires approve/dismiss to the real GitHub write here.
  console.info('[sidecar]', msg);
});
