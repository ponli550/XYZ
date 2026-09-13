import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
  project: "proj_yfjutgclrfikrlzeumwe",
  dirs: ["./src/trigger"],
  maxDuration: 300,
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 3, minTimeoutInMs: 1000, maxTimeoutInMs: 10_000, factor: 2 },
  },
});
