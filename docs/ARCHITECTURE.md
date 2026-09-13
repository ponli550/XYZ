# Sidecar — architecture

An agent that is already on the issue when you open it.

## The claim

Cross-system contradiction detection is not new. [Sentra](https://www.sentra.app)
does it across Slack, Jira and Confluence. Viktor monitors and proposes actions.
Rovo answers questions inside Atlassian.

Every one of them is **a place you go** — a dashboard, a graph UI, a query box.
They find the contradiction, then put it somewhere you have to visit.

Sidecar has no such place, and two things follow from that which a chat window
cannot reproduce:

1. **The finding renders on the artifact it concerns.** Opening the issue is the
   entire invocation.
2. **The watcher knows where your attention is.** The extension publishes the
   artifact you currently have open; the sweep checks that one first. The page is
   not where the agent displays — it is how the agent knows what to care about.

---

## The data model

Everything hangs off one type. An `Escalation` is an **artifact**, not a message:
written by a watcher, appended to across sweeps, rendered in place, and acted on
only by a human.

```
suspected ──► corroborating ──► confirmed ──► proposed ──► approved ──► verified
                                                  │            │
                                                  │            └──► proposed
                                                  │                 (write unconfirmed)
                                                  ▼
                                              dismissed ──► reopened
                                                  │           (watch condition fired)
                                                  └──► silence
                                                       (watch expired)
```

Transitions are immutable and illegal moves throw. Every move appends to
`history[]`, which is what the rail renders as a timeline — progression is
inspectable rather than asserted.

Two fields carry most of the design:

- **`confidence`** is recomputed from the number of *distinct* systems that agree,
  capped at 0.95. The agent never claims certainty, and re-deriving the same
  evidence twice does not move the number.
- **`watch`** is set when a human dismisses. It holds the condition under which
  the finding may return.

---

## The pipeline

```
  Trigger.dev cron ─────────┐   primary schedule; drafts
  Cloudflare cron ──────────┤   hourly fallback; drafts
  chrome.alarms ────────────┘   local; drafts only when no Worker is configured
            │
            ▼
    readRepo()              GitHub REST, read-only                    free
            │               issues, PRs, links, CI verdicts
            ▼
    sweep()                 deterministic rules                       free
            │                                                  ← 87.5% stop here
            ▼
    releaseEvidence()       Exa, external candidates only      ~1 search
            │
            ▼
    draftEscalation()       ONE model call per survivor        ~$0.0002
            │               wrapped in guarded()
            ▼
    merge() + evaluateWatches()
            │               adds, corroborates, retires, re-opens
            ▼
    chrome.storage ──► content script ──► shadow-DOM rail on the page
                   └──► chrome.notifications ──► native banner
```

Human approval is the only path to a write:

```
  Approve ──► checkPolicy() ──► execute() ──► verifyComment() ──► verified
                   │                               │
                   └──► blocked (audited)          └──► proposed (unconfirmed)
```

---

## Module map

| Module | Responsibility |
|---|---|
| `core/escalation.ts` | the type, the state machine, confidence |
| `core/heuristics.ts` | deterministic rules — decides *whether* something is wrong |
| `core/sources.ts` | GitHub reads: issues, PRs, issue links, CI verdicts |
| `core/exa.ts` | the only source reaching outside the org |
| `core/draft.ts` | the single model call — decides only *how to say it* |
| `core/budget.ts` | refusals defer work; they never advance state |
| `core/merge.ts` | folds sweeps together; retires; protects human decisions |
| `core/watch.ts` | dismissal conditions, re-open, expiry |
| `core/github.ts` | the entire write surface — two verbs, policy-gated |
| `core/audit.ts` | every decision, rendered in the page |
| `extension/src/extract.ts` | page context: what the human is looking at |
| `extension/src/rail.ts` · `creature.ts` | the in-page surface |
| `worker/src/index.ts` | shared store + fallback sweep |
| `src/trigger/sweep.ts` | primary schedule, retried per step |

`core/` has no browser or platform imports, which is why the same modules run in
an MV3 service worker, a Cloudflare Worker and a Trigger.dev task unchanged.

---

## Three watchers, one card

**Trigger.dev** runs the primary schedule: it retries each step independently, so
GitHub being briefly unreachable retries the *read* rather than re-spending the
model budget, and it keeps a run history you can point at.

**The Cloudflare Worker** is the shared store the sweep writes and the extension
reads, plus an hourly fallback sweep — a store that cannot refill itself is a
single point of failure.

**`chrome.alarms`** is the local path, and the only one that knows which artifact
you have open.

Escalation ids are `key:rule`, so a finding derived by any of the three is the
same card. Merging independent sweeps is idempotent by construction.

---

## Invariants

**The model never decides whether something is wrong.** `heuristics.ts` answers
that for zero tokens; the model only phrases what code already proved. The
failure mode is a missing card, never a wrong comment.

**Two write verbs, and that is the safety story.** Comment, and set open/closed.
The token may carry `repo` scope, but `github.ts` is the only thing that can
spend it. A third verb needs a code review.

**Default-deny, checked before the network call.** A fresh install can write
nowhere. During the first live write the agent proposed a close, the human
approved, the comment landed — and the issue stayed open, because that capability
was switched off.

**The draft may only promise what the policy permits.** The first real write said
*"Closing —"* on an issue it had no power to close. The system prompt now varies
with the granted capabilities.

**The human's decision outranks the watcher.** A dismissed, approved or verified
finding is never resurrected by re-derivation, and re-deriving the same evidence
does not inflate confidence. Progress theatre is a bug.

**A dismissal is parked, not deleted.** If its condition fires the card returns;
if it expires the card stays gone, because the human was right.

**A finding that stops being true is retired.**

**A bare English word is never a dependency.** The `external-blocker` rule once
fired on an issue whose body contained the phrase *"blocked by policy"* while
describing a policy feature. A false card costs far more than a missed one — it
is what makes people switch the agent off.

---

## Failure model

Every dependency degrades visibly rather than silently:

| Failure | Behaviour |
|---|---|
| A source errors | that source is listed in `degraded` and rendered in the rail |
| The model refuses (budget) | the candidate is **parked and replayed**, never marked done |
| A write cannot be read back | the card returns to `proposed`, not `verified` |
| The store is unreachable | `degraded — worker: 401`, and local findings still render |
| **Any** source degraded | **nothing is retired that sweep** — the sweep cannot know what it missed, and erasing real findings on every hiccup is worse than carrying a stale one |
| The watcher has not run | the heartbeat renders as *stale*, in red |

The last one is a rule in itself: a silent loop and a dead loop are
indistinguishable unless you draw the clock.

---

## Provenance

Derived from a Bitbucket PR-watcher daemon run in production — disposable
per-event runs, escalation-as-artifact, one narrow write capability,
retry-then-cached-fallback, and the incident that produced the
*refusals-defer-work* rule.

**Every line of Sidecar was written during the hackathon**, in a different
runtime: bash + tmux + nvim became TypeScript across MV3, Cloudflare Workers and
Trigger.dev.
