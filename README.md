# Sidecar

**An agent that is already on the issue when you open it.**

A Chrome extension that watches your GitHub repo while you are not looking,
finds the places where an issue contradicts what the rest of the repo already
knows, and is waiting with a fix — on the page — the moment you open it.

You never prompt it. There is no chat box. That is the point.

**Demo: <https://youtu.be/J8KygnKkwAc>** (2 min 13 s)

---

## The problem

The answer already existed in another system, and nobody told you.

An issue sits open for nine days. Its pull request merged on Thursday. Both
facts are true, both are visible, and nobody put them next to each other.

## Why this is not a chatbot, a sidebar, or a dashboard

Cross-system contradiction detection is not new. [Sentra](https://www.sentra.app)
does it across Slack, Jira and Confluence. Viktor monitors and proposes actions.
Rovo answers questions inside Atlassian.

Every one of them is **a place you go**: a dashboard, a graph UI, a query box.
They find the contradiction and then put it somewhere you have to visit.

Sidecar has no such place. The finding renders on the artifact it is about, at
the moment you look at it, and it had no idea you were going to look. The
environment is not a wrapper around the agent — it is how the agent knows what
to care about.

> **The watcher sweeps the issue you currently have open first.** Scarce model
> budget is spent where your attention already is. That is the reason this lives
> on the page rather than in a dashboard: not to display, but to prioritise.

---

## What it does

| | |
|---|---|
| **Watches** | `chrome.alarms` fires every 2 min — with the browser window closed |
| **Detects** | deterministic rules over issues, PRs and their links. Zero tokens |
| **Drafts** | one small model call, only for candidates that already passed a rule |
| **Surfaces** | a card on the issue page, with evidence, timestamps and a timeline |
| **Acts** | on your approval only, and only via two verbs |
| **Remembers** | a dismissal is parked with a condition, not deleted |

A real finding, on this repo:

```
CONFLICT   ponli550/XYZ#5                              75%
The issue is still open despite the related pull request being merged.
  ▸ Evidence (2)     ▸ Timeline
  ┌──────────────────────────────────────────────────────────┐
  │ This looks resolved by PR #16 merged on 2026-09-13, but   │
  │ the issue remains open.                                   │
  └──────────────────────────────────────────────────────────┘
  [Approve]  [Dismiss]
🔒 can comment — read-only everywhere else
```

---

## Architecture

```
chrome.alarms  (fires with the window closed)
      │
      ▼
 readRepo()            GitHub REST, read-only              free
      │
      ▼
 sweep()               deterministic rules                 free   ← ~93% stop here
      │
      ▼
 draftEscalation()     one model call per survivor         ~$0.0002
      │
      ▼
 merge() + evaluateWatches()
      │
      ▼
 chrome.storage ──► content script ──► shadow-DOM rail on the page
                 └─► chrome.notifications ──► native macOS banner
```

The counter in the rail is the real accounting, not decoration. A typical sweep
of this repo reads **15 issues, resolves 14 for zero tokens, and escalates 1.**
That is why the whole thing runs on a $5 budget.

### The rules that shaped it

**The model never decides whether something is wrong.** `heuristics.ts` answers
that deterministically. The model is only asked to *phrase* a finding that code
already proved. The failure mode is a missing card, never a wrong comment.

**Two write verbs, and that is the safety story.** `github.ts` can comment and
can set open/closed. Nothing else. The token may carry `repo` scope, but that
module is the only thing that can spend it.

**Default-deny.** A fresh install can write nowhere until repos and capabilities
are switched on. Policy is checked *before* the network call. During the first
live write the agent proposed a close, the human approved, the comment landed —
and the issue stayed open, because `open/close` was switched off.

**A refusal defers work; it never advances state.** Ported from a PR-watcher
daemon where refused runs were filed as serviced: state advanced, pending work
was written off, and the dashboard showed a healthy loop doing nothing.

**The human's decision outranks the watcher.** A dismissed or verified finding is
never resurrected by re-derivation, and re-deriving the *same* evidence does not
inflate confidence. Progress theatre is a bug, with nine tests on that one rule.

**A dismissal is parked, not deleted.** It carries a condition. If the condition
fires, the card returns. If it expires, the card stays gone — the human was
right and should not hear about it again.

---

## Install

```bash
npm install
npm run build
```

`chrome://extensions` → Developer mode → **Load unpacked** → select `extension/`

Then **Details → Extension options** and grant what you want it to have:

| Field | |
|---|---|
| GitHub token | `gh auth token`, or a fine-grained PAT scoped to one repo |
| OpenRouter key | for drafting |
| Repos | e.g. `ponli550/XYZ` — **empty means it can write nowhere** |
| Capabilities | `comment` and/or `open/close` |
| Pause | stops the agent entirely |

Open any issue in an allowed repo. The rail appears on the right.

---

## Tests

```bash
npm test        # 82 tests, node:test, no network
npm run typecheck
```

Every rule that matters has a test named after the thing it prevents:
*a dismissed finding is NOT resurrected by the next sweep*, *re-deriving the same
evidence does not inflate confidence*, *an expired watch lapses into silence*,
*policy is checked BEFORE the network call*, *prose ABOUT blocking is not a
blocker*.

That last one is real: the `external-blocker` rule fired on this repo's own
issue #13, whose body contains the phrase *"blocked by policy"* while describing
the policy feature — and concluded the issue was blocked on a package named
"policy". A false card costs far more than a missed one; it is what makes people
switch the agent off.

---

## Provenance

Built during the Agents Everywhere hackathon, 12–13 September 2026.

The architecture is derived from a Bitbucket PR-watcher daemon run in production
— disposable per-event runs, escalation-as-artifact, one narrow write capability,
retry-then-cached-fallback. **Every line of Sidecar was written during the
event**, in a different runtime.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/VENDOR-SETUP.md`](docs/VENDOR-SETUP.md).

---

## Known limits

Stated rather than hidden, because a judge will find them anyway.

- **The token is stored in `chrome.storage.local`, which is not encrypted.** It
  never enters the page context — only the service worker and the options page
  touch it — but anyone with disk access to the Chrome profile can read it.
  Encrypting it in-extension would be theatre: the decryption key would have to
  ship alongside. The real control is a **fine-grained PAT scoped to one repo
  with a short expiry**, which is what the install instructions recommend.
- **One page of issues per sweep** (40, most recently updated). Large repos need
  pagination that is not written.
- **Not on the Chrome Web Store.** Listing requires a privacy policy and review.
  `npm run package` produces the zip; the rest is not done.
- **`external-blocker` depends on Exa having indexed the dependency.** No result
  is treated as no evidence, so the finding stays below the surfacing floor —
  quiet rather than wrong.

---

## Optional: the cloud watcher

`chrome.alarms` only fires while Chrome is running, so the extension's own sweep
stops when you close the lid. `worker/` is a Cloudflare Worker that runs the
**same core modules** on a cron trigger, so the agent keeps finding things while
nothing of yours is on.

It is deliberately **not** a token proxy. It holds its own credential, never sees
your browser's, and is read-only to the extension — it finds, it never writes.
Escalation ids are `key:rule`, so a finding derived by either watcher is the same
card: merging two independent sweeps is idempotent by construction, and the
merge still refuses to overwrite anything you decided.

```bash
cd worker
npx wrangler kv namespace create SIDECAR     # put the id in wrangler.jsonc
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put OPENROUTER_KEY
npx wrangler secret put EXA_KEY
npx wrangler secret put READ_KEY             # any random string
npx wrangler deploy
```

Then paste the deployed URL and the same `READ_KEY` into the extension's options.
Leave both blank and the extension works exactly as before — the Worker is an
upgrade, never a dependency.

```bash
# read what it has found
curl -H "x-sidecar-key: $READ_KEY" https://<worker>/state

# force a sweep instead of waiting for the next cron tick
curl -X POST -H "x-sidecar-key: $READ_KEY" https://<worker>/sweep
```

`/sweep` changes nothing about the ambient claim — the cron still runs on its
own. It just removes ten minutes of dead air when testing.
