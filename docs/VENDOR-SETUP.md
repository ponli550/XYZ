# Vendor setup notes

Project-specific facts only. Everything else is in the vendors' own docs.

## Trigger.dev
- Project reference: `proj_yfjutgclrfikrlzeumwe`
- **SDK must be >= v4.5.8.** Older versions mint an unusable token when
  `auth.createPublicToken()` is called with this API key.
- Not currently wired: the watcher runs on `chrome.alarms` instead, so the
  ambient claim does not depend on a cloud deploy. Trigger.dev is the upgrade
  path, not a dependency.

## Exa
- MCP URL: `https://mcp.exa.ai/mcp`
- Opt-in tools are appended to the URL:
  `?tools=web_search_exa,web_fetch_exa,agent_run,web_search_advanced_exa`
- The free plan answers 429 once used up; add `x-api-key` to lift it.
- Used for the `external-blocker` rule: when an issue names an upstream
  dependency, Exa checks whether that dependency has already shipped the fix.

Full docs: <https://docs.exa.ai/reference/exa-mcp>, <https://trigger.dev/docs>
