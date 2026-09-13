// The sweep, off the laptop.
//
// chrome.alarms only fires while Chrome is running, so the extension's watcher
// stops when you close the lid. This Worker runs the SAME core modules on a
// cron trigger, so the agent keeps finding things while nothing of yours is on.
//
// It is deliberately not a token proxy. The extension keeps its own credential
// and its own sweep; this is a second, independent watcher whose results the
// extension merges in. Two sweeps that agree are idempotent — escalation ids
// are `key:rule`, so the same finding from either side is the same card.

import { readRepo } from '../../src/core/sources.ts';
import { sweep } from '../../src/core/heuristics.ts';
import { draftEscalation } from '../../src/core/draft.ts';
import { merge } from '../../src/core/merge.ts';
import { BudgetGuard } from '../../src/core/budget.ts';
import { releaseEvidence } from '../../src/core/exa.ts';
import type { Candidate } from '../../src/core/heuristics.ts';
import type { Escalation } from '../../src/core/escalation.ts';

export interface Env {
  SIDECAR: KVNamespace;
  GITHUB_TOKEN: string;
  OPENROUTER_KEY: string;
  EXA_KEY?: string;
  /** Shared secret the extension presents on read. Not a GitHub credential. */
  READ_KEY: string;
  REPOS: string;          // comma separated, e.g. "ponli550/XYZ"
  MODEL?: string;
}

const KEY = 'state';

interface State {
  escalations: Escalation[];
  heartbeat: string | null;
  counter: { checked: number; auto: number; escalated: number };
  degraded: string[];
}

const EMPTY: State = {
  escalations: [], heartbeat: null,
  counter: { checked: 0, auto: 0, escalated: 0 }, degraded: [],
};

async function load(env: Env): Promise<State> {
  return (await env.SIDECAR.get<State>(KEY, 'json')) ?? EMPTY;
}

export async function runSweep(env: Env): Promise<State> {
  const prev = await load(env);
  const guard = new BudgetGuard<Candidate>();
  const degraded: string[] = [];
  const candidates: Candidate[] = [];
  const snapshots = [];
  let checked = 0;

  for (const spec of env.REPOS.split(',').map((r) => r.trim()).filter(Boolean)) {
    const [owner, repo] = spec.replace('/*', '/').split('/');
    if (!owner || !repo) continue;
    const r = await readRepo({ token: env.GITHUB_TOKEN }, owner, repo);
    degraded.push(...r.degraded);
    snapshots.push(...r.snapshots);
    const result = sweep(r.snapshots);
    checked += result.checked;
    candidates.push(...result.candidates);
  }

  if (env.EXA_KEY) {
    for (const c of candidates.filter((x) => x.severity === 'external')) {
      const snap = snapshots.find((s) => s.key === c.key);
      const dep = snap?.externalDeps[0];
      if (!dep) continue;
      try {
        const ev = await releaseEvidence({ apiKey: env.EXA_KEY }, dep, snap!.createdAt);
        if (ev) { c.evidence.push(ev); c.prior = Math.max(c.prior, 0.7); }
      } catch (e) {
        degraded.push(`exa ${dep}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
  }

  const drafted: Escalation[] = [];
  for (const c of candidates) {
    const out = await draftEscalation(guard, {
      apiKey: env.OPENROUTER_KEY,
      model: env.MODEL ?? 'openai/gpt-4o-mini',
      capabilities: ['comment'],   // the Worker never writes; it only finds
    }, c).catch((e) => {
      degraded.push(`draft ${c.key}: ${e instanceof Error ? e.message : String(e)}`);
      return { escalation: null, deferred: false };
    });
    if (out.escalation) drafted.push({ ...out.escalation, detectedBy: 'ambient' });
  }

  const { escalations } = merge(prev.escalations, drafted);
  const next: State = {
    escalations,
    heartbeat: new Date().toISOString(),
    counter: {
      checked: prev.counter.checked + checked,
      auto: prev.counter.auto + (checked - drafted.length),
      escalated: escalations.filter((e) => e.state === 'proposed').length,
    },
    degraded,
  };
  await env.SIDECAR.put(KEY, JSON.stringify(next));
  return next;
}

export default {
  // Cron trigger. This is the whole point: it runs with your laptop shut.
  async scheduled(_c: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runSweep(env));
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    // The Worker is READ-ONLY to GitHub. It never writes to a repo and never
    // hands back a credential — it holds its own token, never the browser's.
    if (req.headers.get('x-sidecar-key') !== env.READ_KEY) {
      return new Response('unauthorized', { status: 401 });
    }

    // Forces a sweep now instead of waiting for the next cron tick. It changes
    // nothing about the ambient claim — the cron still runs on its own — it
    // just removes ten minutes of dead air when you are testing or demoing.
    if (url.pathname === '/sweep' && req.method === 'POST') {
      const state = await runSweep(env);
      return Response.json(state, { headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname !== '/state' || req.method !== 'GET') {
      return new Response('not found', { status: 404 });
    }

    const state = await load(env);
    return Response.json(state, {
      headers: { 'cache-control': 'no-store' },
    });
  },
};
