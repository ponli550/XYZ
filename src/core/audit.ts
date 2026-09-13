// Every decision the agent makes, written down.
//
// The PR daemon's rule: governance rides artifacts, not presence. If the only
// record of what the agent did is that it happened, nobody can check it. So
// every allow, every deny, every write and every failure gets an entry — and
// the entries are what the panel renders, not a summary of them.

export type AuditKind =
  | 'proposed'      // agent surfaced something
  | 'approved'      // human said yes
  | 'dismissed'     // human said no
  | 'wrote'         // a real change landed
  | 'verified'      // the change was read back
  | 'failed'        // the write did not land
  | 'deferred'      // budget refused, work parked
  | 'blocked';      // policy said no

export interface AuditEntry {
  at: string;
  kind: AuditKind;
  key: string;            // owner/repo#n
  detail: string;
  /** Who caused it. The agent never records itself as the human. */
  actor: 'agent' | 'human';
}

export function entry(kind: AuditKind, key: string, detail: string, actor: AuditEntry['actor'],
                      at = new Date().toISOString()): AuditEntry {
  return { at, kind, key, detail, actor };
}

/** Newest first, capped. An unbounded log in extension storage is a leak. */
export function append(log: AuditEntry[], e: AuditEntry, cap = 200): AuditEntry[] {
  return [e, ...log].slice(0, cap);
}
