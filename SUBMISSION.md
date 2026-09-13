# Sidecar

**An agent that is already on the issue when you open it.**

Repo: <https://github.com/ponli550/XYZ> · Demo: [https://youtu.be/J8KygnKkwAc](https://youtu.be/J8KygnKkwAc) (2 min 13 s) · Built 12–13 September 2026

> **Issues #5 and #17 are left open on purpose** — they are the two live findings
> the agent raises in the demo. Closing either makes its card retire, which is
> the retirement rule working, not a bug.

---

## The one-liner

Sidecar watches your GitHub repo while you are not looking, finds the places
where an issue contradicts what the rest of your stack already knows, and is
waiting with the answer — on the page — the moment you open it.

**You never prompt it. There is no chat box. That is the point.**

## The problem

The answer already existed in another system, and nobody told you.

An issue sits open for nine days. Its pull request merged on Thursday. Another
says it is blocked on a dependency that shipped the fix eleven days *before the
issue was filed*. Every one of those facts is visible. Nobody put them next to
each other.

## Why the environment is the product, not a wrapper

Cross-system contradiction detection is not new. [Sentra](https://www.sentra.app)
does it across Slack, Jira and Confluence. Viktor monitors and proposes actions.
Rovo answers questions inside Atlassian.

Every one of them is **a place you go**: a dashboard, a graph UI, a query box.
They find the contradiction, then put it somewhere you have to visit.

Sidecar has no such place. Two consequences fall out of living on the page, and
neither is reproducible in a chat window:

1. **It renders on the artifact it is about, unprompted.** Opening the issue is
   the entire invocation.
2. **It knows where your attention is.** The extension publishes the artifact
   you currently have open, and the watcher sweeps that one first. Scarce model
   budget is spent where you are already looking. The page is not where the
   agent displays — it is how the agent knows what to care about.

It also needs **zero integration**. It inherits your existing GitHub session, so
it works on any repo you can already see, private ones included, with no OAuth
flow and no deployment. Sentra needs an enterprise rollout against your org.

## How it works

```
Trigger.dev cron ──┐
Cloudflare cron ───┼──► readRepo()        GitHub REST, read-only        free
chrome.alarms ─────┘         │
                             ▼
                        sweep()           deterministic rules           free   ← 87.5% stop here
                             │
                             ▼
                        Exa               has the blocker already shipped?
                             │
                             ▼
                        draft()           ONE model call per survivor   ~$0.0002
                             │
                             ▼
                  merge() + evaluateWatches()
                             │
              ┌──────────────┴───────────────┐
              ▼                              ▼
     shadow-DOM rail on the page    chrome.notifications (native banner)
```

**Live numbers from the running system: 112 artifacts checked, 98 resolved with
zero tokens, 2 escalated to a human.** The counter in the UI is the real
accounting, not decoration — it is why the whole thing runs on a $5 budget.

## The rules that shaped it

**The model never decides whether something is wrong.** Deterministic rules
answer that for free. The model is only asked to *phrase* a finding that code
already proved. The failure mode is a missing card, never a wrong comment.

**Two write verbs, and that is the safety story.** It can comment, and set
open/closed. Nothing else. During the first live write the agent proposed a
close, the human approved, the comment landed — and the issue stayed open,
because `open/close` was switched off. Default-deny held on a real write without
anyone testing for it.

**A refusal defers work; it never advances state.** Ported from a PR-watcher
daemon where refused runs were filed as serviced: state advanced, pending work
was written off, and the dashboard showed a healthy loop doing nothing.

**The human's decision outranks the watcher.** A dismissed or verified finding is
never resurrected by re-derivation, and re-deriving the *same* evidence does not
inflate confidence. Progress theatre is a bug.

**A dismissal is parked, not deleted** — it carries a condition. If the condition
fires the card returns; if it expires the card stays gone, because the human was
right. **And a finding that stops being true is retired**, so a stale card cannot
outlive its cause.

## Sponsor tools, each doing something the others cannot

| | Role |
|---|---|
| **Trigger.dev** | the scheduled sweep — retried per step, with a run history you can point at: *"here is the run that fired at 05:30, unattended"* |
| **Cloudflare** | the shared store the sweep writes and the extension reads, plus an hourly fallback sweep so the store can refill itself |
| **OpenRouter** | drafts every claim and every proposed comment |
| **Exa** | the only source reaching outside the org — found that `@trigger.dev/sdk` v4.5.16 shipped before the issue claiming to be blocked on it was filed |

## Built during the event

28 commits, 11 core modules, **112 tests**, typechecked across three projects.

The architecture is derived from a Bitbucket PR-watcher daemon run in production
— disposable per-event runs, escalation-as-artifact, one narrow write capability,
retry-then-cached-fallback. **Every line of Sidecar was written during the
hackathon**, in a different runtime (bash/tmux → TypeScript/MV3/Workers).

## Known limits, stated rather than hidden

- The GitHub token lives in `chrome.storage.local`, which is not encrypted. It
  never enters the page context, but disk access reveals it. Encrypting it
  in-extension would be theatre — the key would ship alongside. The real control
  is a fine-grained PAT scoped to one repo, which the install instructions
  recommend.
- One shared secret guards both read and write on the store. They should be
  separate keys; that is a ten-minute change deliberately not made before
  recording.
- One page of issues per sweep (40). Larger repos need pagination.
- Not on the Chrome Web Store — listing requires a privacy policy and review.
