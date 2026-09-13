// Design tokens, lifted from the Sidecar Triage design.
//
// Warm cream and terracotta rather than GitHub's blue-grey. That is deliberate:
// the agent should read as a distinct presence sitting on the page, not as a
// panel GitHub shipped. A convincing imitation of the host chrome would be
// worse — a user must never be unsure whether GitHub or the agent said
// something.
export const TOKENS = `
  --ds-bg:            #FAF6EE;
  --ds-surface:       #FFFFFF;
  --ds-surface-warm:  #F4ECE0;
  --ds-ink:           #1B1613;
  --ds-ink-muted:     #7A7066;
  --ds-line:          #ECE3D6;
  --ds-almond:        #EED3BA;

  --ds-accent:        #9E3B33;
  --ds-accent-hover:  #8B342D;
  --ds-accent-ink:    #FDF0EE;
  --ds-accent-soft:   #F3E1DE;
  --ds-accent-soft-ink:#7A2A24;

  --ds-danger:        #C0392B;
  --ds-danger-soft:   #F6E0DD;
  --ds-danger-soft-ink: #8A2A22;
  --ds-warn:          #B6791F;
  --ds-warn-soft:     #F6EAD2;
  --ds-warn-soft-ink: #7C5410;
  --ds-ok:            #3F7A54;
  --ds-ok-soft:       #E3F0E7;
  --ds-ok-soft-ink:   #2C5B3C;

  --ds-radius-sm:     6px;
  --ds-radius:        8px;
  --ds-radius-lg:     16px;
  --ds-radius-pill:   999px;

  --ds-space-1: 4px;  --ds-space-2: 8px;  --ds-space-3: 12px;
  --ds-space-4: 16px; --ds-space-5: 24px; --ds-space-6: 32px;

  --ds-shadow-1: 0 1px 2px rgba(0,0,0,.05);
  --ds-shadow-2: 0 4px 12px -6px rgba(0,0,0,.14);
  --ds-shadow-3: 0 14px 32px -16px rgba(0,0,0,.24);

  --ds-font-display: "Fraunces", "Iowan Old Style", Georgia, serif;
  --ds-font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
`;
