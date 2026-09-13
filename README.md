> **Canonical reference:** <https://docs.exa.ai/reference/exa-mcp>
>
> If anything below looks outdated or contradicts real MCP behavior, fetch that URL — it is the source of truth for MCP setup, auth, and tools. Report staleness back to the user.

---

# Exa MCP Setup Guide

---

## 🔌 Exa MCP Server for ChatGPT & Codex

Give ChatGPT & Codex real-time web search and page fetching with Exa MCP.

Exa is an official plugin in OpenAI's plugin directory (shared by ChatGPT and Codex). The plugin bundles the hosted MCP server plus Exa's `search` and `exa-agent` skills, so there is no separate MCP or skill setup to do.

**You (the agent) cannot install a plugin on the user's behalf — walk the user through it:**

1. Open [chatgpt.com/plugins/exa](https://chatgpt.com/plugins/exa) — it opens **Exa** in the plugin directory.
2. Select the **+** button to install. Sign in to Exa when prompted (either during install or the first time ChatGPT/Codex uses it).
3. Start a **new** chat or Codex CLI session — skills only load in sessions started after the install.

Do not write MCP config files or run `codex mcp add` for this client; the plugin already provides the MCP connection.

**Verify it works:** in a fresh session after setup, ask the client something that needs the web, e.g. "Search for recent developments in AI agents and summarize the key trends." The `web_search_exa` tool should be called.

**Authentication:** the hosted server works without a key on a small free plan — there is no sign-in step unless the client installed Exa as a plugin. Once the free plan is used up the server answers with a 429 (some clients, Hermes included, show this as a search that hangs and times out rather than an error). To lift the limit or use it in production, add the user's [Exa API key](https://dashboard.exa.ai/api-keys) as a header wherever the client's config accepts one:

```json
{
  "exa": {
    "url": "https://mcp.exa.ai/mcp",
    "headers": {
      "x-api-key": "YOUR_EXA_API_KEY"
    }
  }
}
```

**Tools:** `web_search_exa` (search the web, get clean content) and `web_fetch_exa` (read a page as markdown) are on by default. `agent_run` (multi-step Exa Agent research; needs auth) and `web_search_advanced_exa` (category/domain/date filters, highlights, summaries, subpage crawling) are opt-in — append `?tools=` to the URL to choose exactly which tools the client sees:

```
https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_run,web_search_advanced_exa
```

**Troubleshooting:**

- Tools not appearing → restart the client after changing config; some clients need a full restart to detect new MCP servers.
- Rate limit error (429), or the first search hangs and times out with no result → the free plan is used up; add the `x-api-key` header above.
- Claude Desktop not connecting → use the built-in connector (**+** or **Add connectors** → **Connectors** → search **Exa** → **+**), not a config file.

📖 Full docs: [docs.exa.ai/reference/exa-mcp](https://docs.exa.ai/reference/exa-mcp)

---

## Resources

- Docs: <https://exa.ai/docs>
- Dashboard: <https://dashboard.exa.ai>
- API Status: <https://status.exa.ai>
TRIGGER: Use @trigger.dev/sdk v4.5.8 or later. Older SDK versions mint an unusable token when auth.createPublicToken() is called with this API key.

Set up Trigger.dev in this project.

Trigger.dev runs your background tasks. This is an existing codebase — add Trigger.dev to it and get one task running in the development environment.

Project reference: proj_yfjutgclrfikrlzeumwe

How to do it:

1. If you have the Trigger.dev MCP server available, use its "initialize_project" tool with the project reference above.
2. Otherwise run this and follow its output:
   npx trigger.dev@latest init -p proj_yfjutgclrfikrlzeumwe
3. If you set it up by hand, follow <https://trigger.dev/docs/manual-setup> and make sure you end up with:
   - "@trigger.dev/sdk" installed (latest) and "@trigger.dev/build" as a dev dependency
   - a trigger.config.ts with: import { defineConfig } from "@trigger.dev/sdk", project: "proj_yfjutgclrfikrlzeumwe", dirs: ["./src/trigger"], and a maxDuration
   - a src/trigger/ directory with at least one exported task created with task() from "@trigger.dev/sdk"
   - trigger.config.ts added to tsconfig "include", and ".trigger" added to .gitignore

Golden rules:

- Import from "@trigger.dev/sdk". Never "@trigger.dev/sdk/v3" or the deprecated client.defineJob.
- Export every task, including subtasks.
- Use the built-in fetch, not node-fetch.
- Never wrap wait.*, triggerAndWait, or batchTriggerAndWait in Promise.all.

Two steps I have to do myself — ask me when you need them:

- Running "npx trigger.dev@latest login" (it opens a browser).
- Giving you the development TRIGGER_SECRET_KEY from the dashboard to put in .env.

When you're done, run "npx trigger.dev@latest dev" and confirm the task shows up in the Trigger.dev dashboard.

Run `npx skills use "https://github.com/exa-labs/agent-skills" --skill "build-with-exa"` and follow the generated skill instructions now. Read its complete output, redirecting it to a temporary file first if necessary. Resolve relative paths from the supporting-files directory it provides.

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://exa.ai/docs/llms.txt>
> Use this file to discover all available pages before exploring further.

# Web Search MCP

> Complete setup guide for Exa MCP Server. Connect Claude Desktop, Cursor, VS Code, and 10+ AI assistants to Exa's web search, fetching, Exa Agent, and Exa Connect tools.

Exa MCP connects AI assistants to Exa's search capabilities, including web search, code search, [Exa Agent](/docs/reference/agent-api-guide), and [Exa Connect](/docs/reference/agent-api/connect/overview). It is open-source and available on [GitHub](https://github.com/exa-labs/exa-mcp-server).

<br />

# Installation

Exa's Search MCP can be installed in any MCP client with the server URL: `https://mcp.exa.ai/mcp`

<CardGroup cols={2}>
  <Card
    title="Install in Cursor"
    icon={
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 466.73 532.09">
    <path
      d="M457.43 125.94 244.42 2.96a22.127 22.127 0 0 0-22.12 0L9.3 125.94C3.55 129.26 0 135.4 0 142.05v247.99c0 6.65 3.55 12.79 9.3 16.11l213.01 122.98a22.127 22.127 0 0 0 22.12 0l213.01-122.98c5.75-3.32 9.3-9.46 9.3-16.11V142.05c0-6.65-3.55-12.79-9.3-16.11h-.01Zm-13.38 26.05L238.42 508.15c-1.39 2.4-5.06 1.42-5.06-1.36V273.58c0-4.66-2.49-8.97-6.53-11.31L24.87 145.67c-2.4-1.39-1.42-5.06 1.36-5.06h411.26c5.84 0 9.49 6.33 6.57 11.39h-.01Z"
      fill="#0765D9"
    />
  </svg>
}
    href="https://cursor.com/marketplace/exa"
  >
    Exa MCP is available on Cursor.
  </Card>

  <Card
    title="Install in VS Code"
    icon={
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <path
      d="M70.912 99.572a6.193 6.193 0 0 0 4.96-.191l20.588-9.958a6.285 6.285 0 0 0 3.54-5.661V16.239a6.286 6.286 0 0 0-3.54-5.662L75.873.62a6.2 6.2 0 0 0-7.104 1.216L29.355 37.98l-17.168-13.1a4.146 4.146 0 0 0-5.318.238l-5.506 5.035a4.205 4.205 0 0 0-.004 6.194L16.247 50 1.36 63.654a4.205 4.205 0 0 0 .004 6.194l5.506 5.034a4.145 4.145 0 0 0 5.318.238l17.168-13.1L68.77 98.166a6.205 6.205 0 0 0 2.143 1.407Zm4.103-72.39L45.11 50 75.015 72.82V27.18Z"
      fillRule="evenodd"
      fill="#0765D9"
    />
  </svg>
}
    href="<https://vscode.dev/redirect/mcp/install?name=exa&config=%7B%22type%22%3A%22http%22%2C%22url%22%3A%22https%3A%2F%2Fmcp.exa.ai%2Fmcp%22%7D>"
  >
    Exa MCP is available on VSCode.
  </Card>
</CardGroup>

<Tabs>
  <Tab title="ChatGPT & Codex">
    Install the [Exa plugin](https://chatgpt.com/plugins/exa?open_in_app), which includes the hosted MCP server plus Exa's `search` and `exa-agent` skills. See [Exa for ChatGPT and Codex](/docs/integrations/chatgpt-codex) for the full setup and workflow guide.

    To add just the MCP server in Codex:

    ```bash theme={null}
    codex mcp add exa --url https://mcp.exa.ai/mcp
    ```
  </Tab>

  <Tab title="Claude Code">
    Install the [Exa plugin](https://claude.com/plugins/exa) — it includes the MCP server plus Exa's skills. Run in terminal:

    ```bash theme={null}
    claude plugin install exa@claude-plugins-official
    ```

    Or in Claude Code, type `/plugin`, search for **Exa**, and install it.

    To add just the MCP server:

    ```bash theme={null}
    claude mcp add --transport http exa https://mcp.exa.ai/mcp
    ```
  </Tab>

  <Tab title="Claude Web, Desktop, or Cowork">
    Install one of the following — the [Exa plugin](https://claude.com/plugins/exa) from Claude's plugin marketplace (includes the connector plus Exa's skills), or the [Exa connector](https://claude.ai/directory/connectors/91408932-1110-4350-97c7-2d6b3a6d9694) on its own from the connector directory:

    1. Open Claude and click **Customize** from the sidebar
    2. Go to the **Plugins** tab
    3. Click Browse, open the Partners tab, and search for **Exa**
    4. Click **+** to add it

    Claude Team and Enterprise admins can provision the connector for everyone through their identity provider instead: see [Enterprise Managed Auth](/docs/reference/mcp-enterprise-managed-auth).
  </Tab>

  <Tab title="Grok Build">
    Exa is available on the [Grok Build](https://docs.x.ai/build/overview) marketplace.

    1. In Grok Build, run `/marketplace`
    2. Find **exa** in the list and press `i` to install it
    3. Run `/mcp`, select **exa**, and press `i` to sign in to your Exa account in the browser

    New accounts get free credits at signup.
  </Tab>

  <Tab title="Vercel fx">
    In the [fx](https://fx.sh) interactive shell:

    ```text theme={null}
    /mcp add --transport http exa https://mcp.exa.ai/mcp
    ```

    fx saves it to `~/.fx/mcp.json`. See [Exa in fx](/docs/integrations/fx) for manual config and API keys.
  </Tab>

  <Tab title="OpenCode">
    Add to your `opencode.json`:

    ```json theme={null}
    {
      "mcp": {
        "exa": {
          "type": "remote",
          "url": "https://mcp.exa.ai/mcp",
          "enabled": true
        }
      }
    }
    ```
  </Tab>

  <Tab title="Kiro">
    Add to `~/.kiro/settings/mcp.json`:

    ```json theme={null}
    {
      "mcpServers": {
        "exa": {
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```
  </Tab>

  <Tab title="Other">
    Exa MCP works with most other MCP clients — point them at `https://mcp.exa.ai/mcp`. The config key for the URL varies by client:

    | Client             | Where to add it                                                         | URL key                |
    | ------------------ | ----------------------------------------------------------------------- | ---------------------- |
    | Windsurf           | `~/.codeium/windsurf/mcp_config.json` (under `mcpServers`)              | `serverUrl`            |
    | Google Antigravity | Agent panel → Manage MCP Servers → View Raw config (under `mcpServers`) | `serverUrl`            |
    | Zed                | Zed `settings.json` (under `context_servers`)                           | `url`                  |
    | Gemini CLI         | `~/.gemini/settings.json` (under `mcpServers`)                          | `httpUrl`              |
    | Warp               | Settings → MCP Servers → Add MCP Server (top-level `exa`)               | `url`                  |
    | v0 by Vercel       | Prompt Tools → Add MCP                                                  | paste the URL directly |

    Most other clients use the standard `mcpServers` shape:

    ```json theme={null}
    {
      "mcpServers": {
        "exa": {
          "url": "https://mcp.exa.ai/mcp"
        }
      }
    }
    ```

    If your client doesn't support remote MCP servers directly, use the `mcp-remote` bridge:

    ```json theme={null}
    {
      "mcpServers": {
        "exa": {
          "command": "npx",
          "args": ["-y", "mcp-remote", "https://mcp.exa.ai/mcp"]
        }
      }
    }
    ```

    Or run the local [npm package](https://www.npmjs.com/package/exa-mcp-server) with your [Exa API key](https://dashboard.exa.ai/api-keys):

    ```json theme={null}
    {
      "mcpServers": {
        "exa": {
          "command": "npx",
          "args": ["-y", "exa-mcp-server"],
          "env": {
            "EXA_API_KEY": "your_api_key"
          }
        }
      }
    }
    ```
  </Tab>
</Tabs>

# API Key

<Card title="Get your Exa API key" icon="key" horizontal href="https://dashboard.exa.ai/api-keys" />

Exa MCP's free plan covers casual use. Add your own API key to lift the rate limits and use it in production:

```json theme={null}
{
  "exa": {
    "url": "https://mcp.exa.ai/mcp",
    "headers": {
      "x-api-key": "YOUR_EXA_API_KEY"
    }
  }
}
```

# Available Tools

**Enabled by default:**

| Tool             | Description                                                           |
| ---------------- | --------------------------------------------------------------------- |
| `web_search_exa` | Search the web for any topic and get clean, ready-to-use content      |
| `web_fetch_exa`  | Read a webpage's full content as clean markdown from one or more URLs |

**Additional tools** (enable via the `tools` parameter):

| Tool                      | Description                                                                                                                                                |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `agent_run`               | Run an [Exa Agent](#exa-agent) for multi-step research, list-building, enrichment, and structured output                                                   |
| `web_search_advanced_exa` | [Advanced search](#advanced-search) with full control over category filters, domain restrictions, date ranges, highlights, summaries, and subpage crawling |

Enable specific tools by only appending them to the MCP URL:

```
https://mcp.exa.ai/mcp?tools=web_search_exa
```

<br />

# Exa Agent

You can also run [Exa Agent](/docs/reference/agent-api-guide) through Exa MCP for multi-step research, list building, enrichment, and structured outputs. Use it for anything that needs more than a single search call.

Agent runs are usage-based, so the Agent tool requires authentication — connect with OAuth or pass your own [Exa API key](https://dashboard.exa.ai/api-keys).

Enable the Agent tool:

```
https://mcp.exa.ai/mcp?tools=agent_run
```

Or alongside the default search tools:

```json theme={null}
{
  "exa": {
    "url": "https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_run",
    "headers": {
      "x-api-key": "YOUR_EXA_API_KEY"
    }
  }
}
```

`agent_run` runs the entire agent loop in one call: it creates the run, streams updates until completion, and returns the final output.

1. **Run the agent** with `agent_run`, passing a natural-language `query`. Add an `outputSchema` when you need repeatable, structured results.
2. **Read the output.** When the run finishes, the response has `outputReady: true` with `output.text`, `output.structured` (when a schema was provided), and `output.grounding` citations, plus `usage` and cost.
3. **Long runs.** If a run outlives the call window (\~750s), `agent_run` returns `status: "running"` with the run's `id` instead of an error — the run keeps executing server-side. Call `agent_run` again with `runId` set to that `id` to keep waiting until it finishes.
4. **Continue.** Pass `previousRunId` (a completed run's `id`) to `agent_run` to refine or extend earlier work; use `input.exclusion` to avoid resurfacing prior results.

`agent_run` takes a natural-language `query`. Pass `runId` to wait for a retained run that is still executing. Pass `previousRunId` to continue from a completed run. Optional fields include `outputSchema`, `systemPrompt`, `input` (`data` to enrich, `exclusion` to avoid), `dataSources` ([Exa Connect](/docs/reference/agent-api/connect/overview) providers, up to 5), and `effort` (`minimal`, `low`, `medium`, `high`, `xhigh`, or `auto`; defaults to `low`).

See the [Exa Agent guide](/docs/reference/agent-api-guide) for schema patterns, effort modes, Exa Connect data sources, and pricing.

<br />

# Advanced Search

`web_search_advanced_exa` exposes the full [Exa Search](/docs/reference/search) API as an MCP tool. Use `web_search_exa` for simple, fast lookups; use the advanced tool when you need precise control over results, including category and domain filters, date ranges, text constraints, geo-targeting, query expansion, summaries, highlights, freshness control, and subpage crawling.

Use it for targeted retrieval, like "research papers about X on arxiv.org from the last year", "news about Y excluding site Z", or "crawl the docs subpages of this company's site". For everyday searches, stick with `web_search_exa`.

Enable it via the `tools` parameter:

```
https://mcp.exa.ai/mcp?tools=web_search_advanced_exa
```

Or alongside the default search tools:

```json theme={null}
{
  "exa": {
    "url": "https://mcp.exa.ai/mcp?tools=web_search_exa,web_fetch_exa,agent_run,web_search_advanced_exa",
    "headers": {
      "x-api-key": "YOUR_EXA_API_KEY"
    }
  }
}
```

The tool's parameters mirror the [Search API](/docs/reference/search) — see that reference for what each filter and content option does.

<br />

# Resources

- [**GitHub**](https://github.com/exa-labs/exa-mcp-server) - View Exa MCP source code
- [**npm**](https://www.npmjs.com/package/exa-mcp-server) - Install Exa MCP npm package

<Accordion title="Usage Examples" icon="magnifying-glass">
  **Web Search**

  ```
  Search for recent developments in AI agents and summarize the key trends.
  ```

  **Code Search**

  ```
  Find Python examples for implementing OAuth 2.0 authentication.
  ```

  **Read a Page**

  ```
  Fetch the full content of https://exa.ai and summarize what the company does.
  ```

</Accordion>

<Accordion title="Troubleshooting" icon="wrench">
  **Rate limit error (429)**

  You've hit the free plan rate limit. Add your own API key to continue:

  ```json theme={null}
  {
    "exa": {
      "url": "https://mcp.exa.ai/mcp",
      "headers": {
        "x-api-key": "YOUR_EXA_API_KEY"
      }
    }
  }
  ```

  [Get your API key](https://dashboard.exa.ai/api-keys)

  **Tools not appearing**

  Restart your MCP client after updating the config file. Some clients require a full restart to detect new MCP servers.

  **Claude Desktop not connecting**

  Use the built-in Connector: click **+** (or **Add connectors**) → **Connectors** tab → search for **Exa** → click **+**.

  **Config file not found**

  Common config locations:

- Cursor: `~/.cursor/mcp.json`
- fx: `~/.fx/mcp.json`
- VS Code: `.vscode/mcp.json` (in project root)
- Claude Desktop (macOS): `~/Library/Application Support/Claude/claude_desktop_config.json`
- Claude Desktop (Windows): `%APPDATA%\Claude\claude_desktop_config.json`
</Accordion>

> ## Documentation Index
>
> Fetch the complete documentation index at: <https://trigger.dev/docs/llms.txt>
> Use this file to discover all available pages before exploring further.

# MCP Introduction

> Learn how to install and configure the Trigger.dev MCP Server

## What is the Trigger.dev MCP Server?

The Trigger.dev MCP (Model Context Protocol) Server enables AI assistants to interact directly with your Trigger.dev projects. It provides a comprehensive set of tools to:

- Search Trigger.dev documentation
- Initialize new Trigger.dev projects
- List and manage your projects and organizations
- Get task information and trigger task runs
- Deploy projects to different environments
- Monitor run details and list runs with filtering options
- Query your data with TRQL and run built-in dashboard metrics

## Installation

The quickest way to get set up is the interactive installer:

```bash theme={"theme":"css-variables"}
npx trigger.dev@latest install-mcp
```

It will detect your installed clients and configure them automatically. You can also copy-paste the config for your client below.

## Client Configuration

Each client has a slightly different config format. Copy the snippet for your client into the appropriate file.

<Tabs>
  <Tab title="Claude Code">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client claude-code
    ```

    Or add this configuration to `~/.claude.json` (user) or `.mcp.json` (project):

    ```json theme={"theme":"css-variables"}
    {
      "mcpServers": {
        "trigger": {
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    [View Claude Code MCP docs ↗](https://code.claude.com/docs/en/mcp)
  </Tab>

  <Tab title="Cursor">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client cursor
    ```

    Or add this configuration to `~/.cursor/mcp.json` (user) or `.cursor/mcp.json` (project):

    ```json theme={"theme":"css-variables"}
    {
      "mcpServers": {
        "trigger": {
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    [View Cursor MCP docs ↗](https://cursor.com/docs/context/mcp)
  </Tab>

  <Tab title="Windsurf">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client windsurf
    ```

    Or add this configuration to `~/.codeium/windsurf/mcp_config.json`:

    ```json theme={"theme":"css-variables"}
    {
      "mcpServers": {
        "trigger": {
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    [View Windsurf MCP docs ↗](https://docs.windsurf.com/windsurf/cascade/mcp)
  </Tab>

  <Tab title="VS Code">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client vscode
    ```

    Or add this configuration to `.vscode/mcp.json` (project) or `~/Library/Application Support/Code/User/mcp.json` (user, macOS):

    ```json theme={"theme":"css-variables"}
    {
      "servers": {
        "trigger": {
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    <Note>VS Code uses `servers` instead of `mcpServers`.</Note>

    [View VS Code MCP docs ↗](https://code.visualstudio.com/docs/copilot/chat/mcp-servers)
  </Tab>

  <Tab title="Zed">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client zed
    ```

    Or add this configuration to `~/.config/zed/settings.json`:

    ```json theme={"theme":"css-variables"}
    {
      "context_servers": {
        "trigger": {
          "source": "custom",
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    [View Zed context servers docs ↗](https://zed.dev/docs/ai/mcp)
  </Tab>

  <Tab title="Cline">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client cline
    ```

    Or add this configuration to `~/Library/Application Support/Code/User/globalStorage/saoudrizwan.claude-dev/settings/cline_mcp_settings.json`:

    ```json theme={"theme":"css-variables"}
    {
      "mcpServers": {
        "trigger": {
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    [View Cline MCP docs ↗](https://docs.cline.bot/mcp/configuring-mcp-servers)
  </Tab>

  <Tab title="Gemini CLI">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client gemini-cli
    ```

    Or add this configuration to `~/.gemini/settings.json` (user) or `.gemini/settings.json` (project):

    ```json theme={"theme":"css-variables"}
    {
      "mcpServers": {
        "trigger": {
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```
  </Tab>

  <Tab title="AMP">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client amp
    ```

    Or add this configuration to `~/.config/amp/settings.json`:

    ```json theme={"theme":"css-variables"}
    {
      "amp.mcpServers": {
        "trigger": {
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    [View Sourcegraph AMP MCP docs ↗](https://ampcode.com/manual#mcp)
  </Tab>

  <Tab title="Codex CLI">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client openai-codex
    ```

    Or add this configuration to `~/.codex/config.toml`:

    ```toml theme={"theme":"css-variables"}
    [mcp_servers.trigger]
    command = "npx"
    args = ["trigger.dev@latest", "mcp"]
    startup_timeout_sec = 30
    ```

    <Note>The `startup_timeout_sec = 30` is recommended. Codex defaults to 10 seconds, which may not be enough for `npx` to download the package on first run.</Note>
  </Tab>

  <Tab title="Crush">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client crush
    ```

    Or add this configuration to `.crush.json` (project), `crush.json`, or `~/.config/crush/crush.json` (user). Files are loaded in priority order: `.crush.json` → `crush.json` → `$HOME/.config/crush/crush.json`.

    ```json theme={"theme":"css-variables"}
    {
      "mcp": {
        "trigger": {
          "type": "stdio",
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```

    [View Charm MCP docs ↗](https://github.com/charmbracelet/crush)
  </Tab>

  <Tab title="opencode">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client opencode
    ```

    Or add this configuration to `~/.config/opencode/opencode.json` (user) or `./opencode.json` (project):

    ```json theme={"theme":"css-variables"}
    {
      "mcp": {
        "trigger": {
          "type": "local",
          "command": ["npx", "trigger.dev@latest", "mcp"],
          "enabled": true
        }
      }
    }
    ```

    [View opencode MCP docs ↗](https://opencode.ai/docs/mcp-servers/)
  </Tab>

  <Tab title="Ruler">
    Install using the command line:

    ```bash theme={"theme":"css-variables"}
    npx trigger.dev@latest install-mcp --client ruler
    ```

    Or add this configuration to `.ruler/mcp.json`:

    ```json theme={"theme":"css-variables"}
    {
      "mcpServers": {
        "trigger": {
          "type": "stdio",
          "command": "npx",
          "args": ["trigger.dev@latest", "mcp"]
        }
      }
    }
    ```
  </Tab>
</Tabs>

After adding the config, restart your client. You should see a server named **trigger** connect automatically.

## Authentication

The `search_docs` tool works without authentication. All other tools require you to be logged in via the [Trigger.dev CLI](/docs/cli-login-commands). The first time you use an authenticated tool, your MCP client will prompt you to log in.

<Accordion title="CLI Options">
  The `install-mcp` command supports these options:

  **Core Options**

- `-p, --project-ref <project ref>` — Scope the MCP server to a specific project
- `-t, --tag <package tag>` — CLI package version to use (default: latest)
- `--dev-only` — Restrict to the dev environment only
- `--readonly` — Read-only mode. Hides write tools (`deploy`, `trigger_task`, `cancel_run`) so the AI cannot make changes to your account
- `--yolo` — Install into all supported clients automatically
- `--scope <scope>` — `user`, `project`, or `local`
- `--client <clients...>` — Install into specific client(s)

  **Configuration Options**

- `--log-file <log file>` — Write logs to a file
- `-a, --api-url <value>` — Custom Trigger.dev API URL
- `-l, --log-level <level>` — Log level (debug, info, log, warn, error, none)

  **Examples**

  Install for all supported clients:

  ```bash theme={"theme":"css-variables"}
  npx trigger.dev@latest install-mcp --yolo
  ```

  Install for specific clients:

  ```bash theme={"theme":"css-variables"}
  npx trigger.dev@latest install-mcp --client claude-code cursor --scope user
  ```

  Restrict to dev environment for a specific project:

  ```bash theme={"theme":"css-variables"}
  npx trigger.dev@latest install-mcp --dev-only --project-ref proj_abc123
  ```

  Read-only mode (prevents AI from deploying or triggering tasks):

  ```bash theme={"theme":"css-variables"}
  npx trigger.dev@latest install-mcp --readonly
  ```

  To add these options to a manual config, append them to the `args` array:

  ```json theme={"theme":"css-variables"}
  {
    "args": ["trigger.dev@latest", "mcp", "--dev-only", "--project-ref", "proj_abc123"]
  }
  ```

</Accordion>

## Getting Started

Once installed, you can start using the MCP server by asking your AI assistant questions like:

- `"Search the trigger docs for a ffmpeg example"`
- `"Initialize trigger.dev in my project"`
- `"Get all tasks in my project"`
- `"Trigger my foobar task with a sample payload"`
- `"Get the details of the latest run for my foobar task"`
- `"List all runs for my foobar task"`
- `"Deploy my project to staging"`
- `"Deploy my project to production"`
- `"How many runs failed in the last 7 days?"`
- `"Show me the overview dashboard metrics"`
- `"What tables can I query?"`

## Next Steps

<CardGroup cols={2}>
  <Card title="MCP Tools" icon="wrench" href="/docs/mcp-tools">
    Explore all available MCP tools for managing your projects.
  </Card>

  <Card title="Skills" icon="wand-magic-sparkles" href="/docs/skills">
    Portable instruction sets that teach AI assistants Trigger.dev patterns.
  </Card>
</CardGroup>
