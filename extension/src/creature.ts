// The collapsed state of the rail.
//
// A panel pinned to the edge is still a panel — it reads as a sidebar, which is
// the thing this project is arguing against. A small creature sitting ON the
// page is a presence: it is somewhere, it reacts, and you can move it.
//
// It is text. No canvas, no WebGL, no animation library: a <pre>, a frame
// array, and pointer events. A content script that ships a 3D engine to draw
// characters would be absurd, and it would cost every GitHub page you open.

export type Mood = 'watching' | 'thinking' | 'found' | 'limited' | 'paused';

/** Two frames per mood. Anything more reads as fidgeting rather than breathing. */
const FRAMES: Record<Mood, [string, string]> = {
  watching: [
    String.raw`  ___
 ( o o )
 (  -  )
  \___/ `,
    String.raw`  ___
 ( - - )
 (  -  )
  \___/ `,
  ],
  thinking: [
    String.raw`  ___
 ( o o )  .
 (  ~  )
  \___/ `,
    String.raw`  ___
 ( o o )   .
 (  ~  )
  \___/ `,
  ],
  found: [
    String.raw`  _!_
 ( O O )
 (  o  )
  \___/ `,
    String.raw`  _!_
 ( O O )
 (  O  )
  \___/ `,
  ],
  limited: [
    String.raw`  ___
 ( x x )
 (  _  )
  \___/ `,
    String.raw`  ___
 ( x x )
 (  _  )
  \___/ `,
  ],
  paused: [
    String.raw`  ___
 ( - - )
 (  _  )
  \___/ `,
    String.raw`  ___
 ( - - )
 (  _  )
  \___/ `,
  ],
};

const LABEL: Record<Mood, string> = {
  watching: 'watching',
  thinking: 'looking into something',
  found: 'found something',
  limited: 'budget limited',
  paused: 'paused',
};

export const CREATURE_CSS = `
.creature {
  position: fixed; z-index: 2147483000; cursor: grab;
  font: 11px/1.05 ui-monospace, SFMono-Regular, Menlo, monospace;
  white-space: pre; user-select: none; padding: 8px 10px;
  background: #fff; color: #1f2328;
  border: 1px solid #d0d7de; border-radius: 8px;
  box-shadow: 0 2px 10px rgba(31,35,40,.12);
  transition: box-shadow .12s, transform .12s;
}
.creature:hover { box-shadow: 0 4px 16px rgba(31,35,40,.2); transform: translateY(-1px); }
.creature.dragging { cursor: grabbing; transition: none; }
.creature .badge {
  position: absolute; top: -6px; right: -6px; min-width: 16px; height: 16px;
  border-radius: 8px; background: #cf222e; color: #fff;
  font: 600 10px/16px -apple-system, sans-serif; text-align: center; padding: 0 4px;
}
.creature .cap { display: block; margin-top: 4px; font-size: 9px; opacity: .5;
  font-family: -apple-system, sans-serif; letter-spacing: .02em; }
@media (prefers-color-scheme: dark) {
  .creature { background: #22272b; color: #c7d1db; border-color: #2c333a; }
}
@media (prefers-reduced-motion: reduce) { .creature { transition: none; } }
`;

export interface CreatureState {
  mood: Mood;
  count: number;          // how many findings are waiting
  x: number; y: number;   // viewport position, persisted
}

export function moodFor(o: {
  paused?: boolean; limited?: boolean; pending?: number; waiting: number;
}): Mood {
  if (o.paused) return 'paused';
  if (o.limited) return 'limited';
  if (o.waiting > 0) return 'found';
  if (o.pending) return 'thinking';
  return 'watching';
}

/** Keeps the creature on screen when the window shrinks under it. */
export function clampToViewport(x: number, y: number, w: number, h: number,
                                vw: number, vh: number): { x: number; y: number } {
  return {
    x: Math.min(Math.max(8, x), Math.max(8, vw - w - 8)),
    y: Math.min(Math.max(8, y), Math.max(8, vh - h - 8)),
  };
}

export interface CreatureHandlers {
  onOpen(): void;
}

export function renderCreature(root: ShadowRoot, st: CreatureState, h: CreatureHandlers): void {
  root.replaceChildren();
  const style = document.createElement('style');
  style.textContent = CREATURE_CSS;
  root.append(style);

  const node = document.createElement('div');
  node.className = 'creature';
  node.style.left = `${st.x}px`;
  node.style.top = `${st.y}px`;
  node.setAttribute('role', 'button');
  node.setAttribute('tabindex', '0');
  node.setAttribute('aria-label', `Sidecar — ${LABEL[st.mood]}, ${st.count} waiting`);

  const art = document.createElement('span');
  const frames = FRAMES[st.mood];
  art.textContent = frames[0];
  node.append(art);

  const cap = document.createElement('span');
  cap.className = 'cap';
  cap.textContent = LABEL[st.mood];
  node.append(cap);

  if (st.count > 0) {
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = String(st.count);
    node.append(badge);
  }

  // Breathing. Slow on purpose: a fast blink in the corner of the eye is the
  // fastest way to make someone uninstall an extension.
  let f = 0;
  const timer = setInterval(() => {
    f = 1 - f;
    art.textContent = frames[f] ?? frames[0];
  }, st.mood === 'found' ? 600 : 2400);
  // The root is replaced wholesale on every repaint, so the interval has to be
  // released with the node it animates or they accumulate one per repaint.
  new MutationObserver((_m, obs) => {
    if (!node.isConnected) { clearInterval(timer); obs.disconnect(); }
  }).observe(root, { childList: true });

  // Drag. A click that never moved is an open; anything else is a reposition.
  let sx = 0, sy = 0, ox = 0, oy = 0, moved = false, dragging = false;

  node.addEventListener('pointerdown', (e) => {
    dragging = true; moved = false;
    sx = e.clientX; sy = e.clientY;
    ox = node.offsetLeft; oy = node.offsetTop;
    node.classList.add('dragging');
    node.setPointerCapture(e.pointerId);
  });

  node.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    const p = clampToViewport(ox + dx, oy + dy, node.offsetWidth, node.offsetHeight,
                              innerWidth, innerHeight);
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
  });

  node.addEventListener('pointerup', (e) => {
    dragging = false;
    node.classList.remove('dragging');
    node.releasePointerCapture(e.pointerId);
    if (moved) {
      void chrome.storage.local.set({
        creaturePos: { x: node.offsetLeft, y: node.offsetTop },
      });
    } else {
      h.onOpen();
    }
  });

  node.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.onOpen(); }
  });

  root.append(node);
}
