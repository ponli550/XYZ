Most AI tools wait to be asked. This one was already on the page.

I built **Sidecar** at the AI Tinkerers Agents Everywhere hackathon — an agent
that lives inside GitHub, watches your repo while you're not looking, and finds
the places where an issue contradicts what the rest of your stack already knows.

You never prompt it. There's no chat box. That's the point.

A real finding from the demo: an issue said it was blocked on a dependency.
Sidecar checked the dependency's release notes and worked out that the fix had
shipped **eleven days before the issue was even filed**. Nobody had put those two
facts next to each other.

The part I didn't expect going in:

→ The page isn't where the agent *displays*. It's how the agent knows what to
**care about**. The extension tells the watcher which issue you have open, and
that one gets swept first — so a tiny model budget is spent where your attention
already is. That's the bit you can't reproduce in a chat window.

Numbers from the running system:
• 112 artifacts checked
• 98 resolved silently, with zero tokens — deterministic rules, not a model
• 2 escalated to a human
• the whole thing runs on a $5 budget

It can do exactly two things to your repo: comment, and open/close. Nothing else,
default-deny, every decision written to an audit log in the page. During the first
live write it proposed closing an issue, I approved, the comment landed — and the
issue stayed open, because I hadn't granted that capability.

Built in one day: 112 tests, three watchers, and a lot of bugs found the honest way.

What's actually in the build: OpenRouter for drafting, Exa for reaching outside
the org, Trigger.dev for the scheduled sweep and its run history, OpenAI's model
under the hood.

Demo (2 min): https://youtu.be/J8KygnKkwAc
Code: https://github.com/ponli550/XYZ

Thanks to AI Tinkerers and the partners behind the event — OpenAI, CopilotKit,
OpenRouter, Exa, Auth0, Ambiguous AI, Trigger.dev, Mozilla.ai, Google Cloud.

#AgentsEverywhere
