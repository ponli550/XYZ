# Sidecar

An agent that is already on the issue when you open it.

## The claim

Cross-system contradiction detection is not new — [Sentra](https://www.sentra.app)
does it, Viktor monitors and proposes, Rovo answers questions inside Atlassian.
Every one of them is **a place you go**: a dashboard, a graph UI, a query box.

Sidecar is not. The finding is already on the artifact when you open it, and it
had no idea you were going to open it.

## Shape

```
chrome.alarms (fires with the window closed)
        │
        ▼
   readRepo()          GitHub REST, read-only          free
        │
        ▼
   sweep()             deterministic rules             free   ← ~90% stop here
        │
        ▼
   draftEscalation()   one model call per survivor     ~$0.0002
        │
        ▼
   merge() + evaluateWatches()
        │
        ▼
   chrome.storage ──► content script ──► shadow-DOM rail on the page
                                    └──► chrome.notifications (native banner)
```

## Rules that shaped it

**The model never decides whether something is wrong.** `heuristics.ts` answers
that for zero tokens. The model is only asked to phrase a finding that
deterministic code already proved. The failure mode is a missing card, never a
wrong comment.

**Two write verbs, and that is the safety story.** `github.ts` can comment and
can set open/closed. Nothing else. The token may carry `repo` scope, but this
module is the only thing that can spend it. A third verb needs a code review.

**Default-deny.** A fresh install can write nowhere until repos and capabilities
are switched on. Policy is checked *before* the network call.

**A refusal defers work; it never advances state.** Ported from a PR-watcher
daemon where refused runs were filed as serviced: the state advanced, pending
work was written off, and the dashboard showed a healthy loop doing nothing.

**The human's decision outranks the watcher.** A dismissed or verified finding is
never resurrected by re-derivation, and re-deriving the same evidence does not
inflate confidence. Progress theatre is a bug.

**A dismissal is parked, not deleted.** It carries a condition. If the condition
fires, the card comes back. If it expires, the card stays gone — the human was
right.

**The artifact you have open is swept first.** Scarce model budget goes where
your attention already is. That is the reason this agent lives on the page
rather than in a dashboard: not to display, but to know what to care about.

## Provenance

The architecture is derived from a Bitbucket PR-watcher daemon run in
production — disposable per-event runs, escalation-as-artifact, one narrow write
capability, retry-then-cached-fallback. Every line of Sidecar was written during
the hackathon, in a different runtime.
