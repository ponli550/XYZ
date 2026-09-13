import { defineConfig } from "@trigger.dev/sdk";
import { syncEnvVars } from "@trigger.dev/build/extensions/core";

// Secrets are synced from the local .env at deploy time rather than pasted into
// a dashboard by hand. One source of truth, and nothing to forget when a key
// rotates. Names are listed explicitly — syncing the whole environment would
// ship whatever else happens to be exported.
// GITHUB_TOKEN is silently dropped by the platform — presumably reserved — so
// the token is namespaced rather than fought with. A variable that vanishes
// without an error is exactly the kind of thing to pin down in a comment.
const SYNCED = [
  "SIDECAR_GH_TOKEN", "OPENROUTER_KEY", "EXA_KEY",
  "STORE_URL", "STORE_KEY", "REPOS", "MODEL",
] as const;

export default defineConfig({
  project: "proj_yfjutgclrfikrlzeumwe",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    // A GitHub or OpenRouter hiccup should cost a retry, not a sweep.
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10_000, factor: 2 },
  },
  build: {
    extensions: [
      syncEnvVars(() =>
        SYNCED.flatMap((name) => {
          const value = process.env[name];
          return value ? [{ name, value }] : [];
        })),
    ],
  },
});
