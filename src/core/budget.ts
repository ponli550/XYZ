// Budget guard. Ported from pr-watcher-daemon's usage-limit handling, which
// exists because of a specific failure: when `claude -p` rounds started being
// refused at the account cap, the belt filed each one as serviced, the state
// file ADVANCED anyway, pending work was written off, and the dashboard showed
// a healthy daemon doing nothing.
//
// The rule that came out of it, and the rule here:
//   a refused call DEFERS work. It never advances state, and it is never
//   silently swallowed.
//
// Our runtime LLM budget is ~$5 of OpenRouter, so refusals are expected, not
// exceptional. They are a normal control-flow path.

export interface LimitWindow {
  until: number;      // epoch ms
  reason: string;
}

const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000;

/** Does this response read as a rate/usage refusal rather than a real answer? */
export function isRefusal(text: string): boolean {
  if (/usage limit|rate.?limit|too many requests|overloaded|insufficient.?(credit|quota|balance)/i.test(text)) {
    return true;
  }
  // A bare 429 is ambiguous — "429 tickets in the backlog" is not a refusal.
  // Require it to sit next to transport vocabulary.
  return /\b429\b/.test(text) && /error|status|http|request|retry|rate|limit|response/i.test(text);
}

/** Parse a reset hint; fall back to a fixed cooldown when the refusal carries none. */
export function limitWindowFrom(text: string, now = Date.now()): LimitWindow {
  const epoch = text.match(/\b(1[0-9]{9})\b/)?.[1];
  const parsed = epoch ? Number(epoch) * 1000 : 0;
  return {
    until: parsed > now ? parsed : now + DEFAULT_COOLDOWN_MS,
    reason: text.slice(0, 140),
  };
}

export type Deferred<T> = { at: number; payload: T };

/**
 * Holds deferred work through a limit window and replays it on expiry.
 * Deliberately dumb and inspectable — the daemon's version was a file and a
 * while-read loop, and that was the right amount of machinery.
 */
export class BudgetGuard<T> {
  private window: LimitWindow | null = null;
  private queue: Deferred<T>[] = [];

  // Node's type-stripping runtime rejects parameter properties, so fields are
  // declared explicitly. Same constraint applies across the codebase.
  private readonly now: () => number;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /** True while inside a recorded limit window. Clears itself on expiry. */
  limited(): boolean {
    if (!this.window) return false;
    if (this.now() < this.window.until) return true;
    this.window = null;
    return false;
  }

  limitedUntil(): number | null {
    return this.limited() ? this.window!.until : null;
  }

  /** Record a refusal. Returns the window so the caller can surface it. */
  mark(text: string): LimitWindow {
    this.window = limitWindowFrom(text, this.now());
    return this.window;
  }

  /** Park work for later. Nothing is lost, nothing is marked done. */
  defer(payload: T): void {
    this.queue.push({ at: this.now(), payload });
  }

  /** Drains the queue once the window has passed; empty while still limited. */
  replay(): T[] {
    if (this.limited()) return [];
    const out = this.queue.map((d) => d.payload);
    this.queue = [];
    return out;
  }

  pending(): number {
    return this.queue.length;
  }
}

/**
 * Wraps a model call. On refusal: mark, defer, and report deferral — the
 * caller MUST NOT advance state on a 'deferred' result. That is the whole
 * point of this module.
 */
export async function guarded<T, R>(
  guard: BudgetGuard<T>,
  work: T,
  call: (work: T) => Promise<R>,
): Promise<{ ok: true; value: R } | { ok: false; deferred: true; until: number }> {
  if (guard.limited()) {
    guard.defer(work);
    return { ok: false, deferred: true, until: guard.limitedUntil()! };
  }
  try {
    return { ok: true, value: await call(work) };
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err);
    if (isRefusal(text)) {
      const w = guard.mark(text);
      guard.defer(work);
      return { ok: false, deferred: true, until: w.until };
    }
    throw err;
  }
}
