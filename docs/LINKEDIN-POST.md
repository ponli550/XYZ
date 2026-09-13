# LinkedIn post — version A (recommended)

Four hours into building an agent that finds contradictions in your GitHub repo,
I found one in mine.

My README linked to an architecture doc that didn't exist. The pull request had
merged into `develop` instead of `main`. I'd read that README a dozen times that
afternoon and never clicked the link.

That is the exact bug I'd spent the day teaching software to catch.

The tool is called Sidecar. It lives inside GitHub as a browser extension,
watches your repo while you're not looking, and when it finds something — an
issue whose PR already merged, a blocker that shipped weeks ago — it's waiting on
the page when you open it.

You never prompt it. There's no chat box. That's the whole idea.

The best finding from the demo: an issue said it was blocked on a dependency.
Sidecar checked that dependency's release notes and worked out the fix had
shipped eleven days before the issue was even filed.

The part I didn't expect:

The page isn't where the agent displays. It's how the agent knows what to care
about. The extension tells the watcher which issue you have open, and that one
gets checked first — so a tiny model budget goes where your attention already is.
You can't do that from a dashboard.

112 things checked. 98 resolved silently with zero tokens, because deterministic
rules decide what's wrong and the model only writes the sentence. 2 escalated to
me. The whole thing runs on a $5 budget.

It can do exactly two things to my repo: comment, and open/close. During the
first live write it proposed closing an issue, I approved, the comment landed —
and the issue stayed open, because I'd never granted that permission.

Built in a day at the AI Tinkerers Agents Everywhere hackathon.
Running on OpenRouter, Exa, and Trigger.dev.

Demo (2 min): https://youtu.be/J8KygnKkwAc
Code: https://github.com/ponli550/XYZ

Thanks to AI Tinkerers and the event partners — OpenAI, CopilotKit, OpenRouter,
Exa, Auth0, Ambiguous AI, Trigger.dev, Mozilla.ai, Google Cloud.

#AgentsEverywhere

---

# LinkedIn post — version B (short, ~120 words)

I built an agent that reads your GitHub issues and tells you when they're lying.

Not "summarise this thread." Something narrower and more useful: your issue says
it's blocked on a dependency — that dependency shipped the fix eleven days before
you filed. Your issue is open — its pull request merged on Thursday.

Sidecar sits inside GitHub and finds those while you're elsewhere. No prompt, no
chat box. It's already on the page when you open it.

112 checks. 98 resolved silently for zero tokens. 2 worth your attention.
It can comment and close. Nothing else.

Built in a day at the AI Tinkerers Agents Everywhere hackathon.

Demo (2 min): https://youtu.be/J8KygnKkwAc
Code: https://github.com/ponli550/XYZ

Thanks to AI Tinkerers and the event partners — OpenAI, CopilotKit, OpenRouter,
Exa, Auth0, Ambiguous AI, Trigger.dev, Mozilla.ai, Google Cloud.

#AgentsEverywhere
