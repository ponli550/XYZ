// The scheduled sweep, with retries and a run history you can point at.
//
// This is the same pipeline the extension and the Worker run, moved somewhere
// that records every attempt. The extension's chrome.alarms stops when the
// browser does; the Worker's cron runs but leaves no trace you can show
// someone. Trigger.dev gives the sweep the one thing neither had: a durable,
// inspectable record that it ran at 03:14 and what it decided.
//
// Steps are separate tasks on purpose. GitHub being briefly unreachable should
// retry the READ, not re-run the drafting and spend the model budget again.

import { logger, schedules, task } from "@trigger.dev/sdk";
import { readRepo } from "../core/sources.ts";
import { sweep as runRules } from "../core/heuristics.ts";
import { draftEscalation } from "../core/draft.ts";
import { releaseEvidence } from "../core/exa.ts";
import { merge } from "../core/merge.ts";
import { BudgetGuard } from "../core/budget.ts";
import type { Candidate } from "../core/heuristics.ts";
import type { Escalation } from "../core/escalation.ts";

interface SweepState {
  escalations: Escalation[];
  heartbeat: string | null;
  counter: { checked: number; auto: number; escalated: number };
  degraded: string[];
}

const env = () => ({
  github: process.env.GITHUB_TOKEN!,
  openrouter: process.env.OPENROUTER_KEY!,
  exa: process.env.EXA_KEY,
  store: process.env.STORE_URL!,       // the Worker, which is now only a store
  storeKey: process.env.STORE_KEY!,
  repos: (process.env.REPOS ?? "").split(",").map((r) => r.trim()).filter(Boolean),
  model: process.env.MODEL ?? "openai/gpt-4o-mini",
});

/** Read GitHub. Retried on its own so a hiccup never re-spends model budget. */
export const readTask = task({
  id: "sidecar-read",
  run: async (payload: { repo: string }) => {
    const e = env();
    const [owner, repo] = payload.repo.split("/");
    const r = await readRepo({ token: e.github }, owner!, repo!);
    logger.info("read", { repo: payload.repo, snapshots: r.snapshots.length, degraded: r.degraded });
    return r;
  },
});

/** One model call for one candidate. Retried independently of every other. */
export const draftTask = task({
  id: "sidecar-draft",
  run: async (payload: { candidate: Candidate }) => {
    const e = env();
    const out = await draftEscalation(new BudgetGuard<Candidate>(), {
      apiKey: e.openrouter, model: e.model, capabilities: ["comment"],
    }, payload.candidate);
    return out.escalation;
  },
});

export const sweepSchedule = schedules.task({
  id: "sidecar-sweep",
  // Every five minutes. The extension is faster while Chrome is open; this is
  // what keeps running when it is not.
  cron: "*/5 * * * *",
  run: async () => {
    const e = env();
    const degraded: string[] = [];
    const candidates: Candidate[] = [];
    const snapshots = [];
    let checked = 0;

    for (const spec of e.repos) {
      const r = await readTask.triggerAndWait({ repo: spec.replace("/*", "") });
      if (!r.ok) { degraded.push(`read ${spec}: ${r.error}`); continue; }
      degraded.push(...r.output.degraded);
      snapshots.push(...r.output.snapshots);
      const res = runRules(r.output.snapshots);
      checked += res.checked;
      candidates.push(...res.candidates);
    }

    if (e.exa) {
      for (const c of candidates.filter((x) => x.severity === "external")) {
        const snap = snapshots.find((s) => s.key === c.key);
        const dep = snap?.externalDeps[0];
        if (!dep) continue;
        try {
          const ev = await releaseEvidence({ apiKey: e.exa }, dep, snap!.createdAt);
          if (ev) { c.evidence.push(ev); c.prior = Math.max(c.prior, 0.7); }
        } catch (err) {
          degraded.push(`exa ${dep}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const drafted: Escalation[] = [];
    for (const c of candidates) {
      const out = await draftTask.triggerAndWait({ candidate: c });
      if (out.ok && out.output) drafted.push(out.output);
      else if (!out.ok) degraded.push(`draft ${c.key}: ${out.error}`);
    }

    const prev = await fetch(`${e.store}/state`, { headers: { "x-sidecar-key": e.storeKey } })
      .then((r) => r.json() as Promise<SweepState>)
      .catch(() => ({ escalations: [], heartbeat: null,
                      counter: { checked: 0, auto: 0, escalated: 0 }, degraded: [] } as SweepState));

    // Retire only on a clean sweep — the same rule as everywhere else. Wiping
    // findings because GitHub hiccuped would be worse than keeping a stale one.
    const liveIds = degraded.length
      ? undefined
      : new Set(candidates.map((c) => `${c.key}:${c.rule}`));
    const { escalations, retired } = merge(prev.escalations, drafted, liveIds);

    const next: SweepState = {
      escalations,
      heartbeat: new Date().toISOString(),
      counter: {
        checked: prev.counter.checked + checked,
        auto: prev.counter.auto + (checked - drafted.length),
        escalated: escalations.filter((x) => x.state === "proposed").length,
      },
      degraded,
    };

    await fetch(`${e.store}/state`, {
      method: "POST",
      headers: { "x-sidecar-key": e.storeKey, "content-type": "application/json" },
      body: JSON.stringify(next),
    });

    logger.info("sweep complete", {
      checked, auto: checked - drafted.length, escalated: next.counter.escalated,
      retired: retired.length, degraded,
    });
    return next.counter;
  },
});
