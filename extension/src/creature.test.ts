import { test } from 'node:test';
import assert from 'node:assert/strict';
import { moodFor, clampToViewport } from './creature.ts';

test('mood order: paused and limited outrank anything it found', () => {
  assert.equal(moodFor({ paused: true, waiting: 3, limited: true }), 'paused');
  assert.equal(moodFor({ limited: true, waiting: 3 }), 'limited');
  assert.equal(moodFor({ waiting: 1 }), 'found');
  assert.equal(moodFor({ pending: 2, waiting: 0 }), 'thinking');
  assert.equal(moodFor({ waiting: 0 }), 'watching');
});

test('a paused agent never looks like it is working', () => {
  assert.equal(moodFor({ paused: true, pending: 5, waiting: 0 }), 'paused');
});

test('it stays on screen when the window shrinks under it', () => {
  assert.deepEqual(clampToViewport(2000, 2000, 100, 60, 800, 600), { x: 692, y: 532 });
  assert.deepEqual(clampToViewport(-50, -50, 100, 60, 800, 600), { x: 8, y: 8 });
});

test('a viewport smaller than the creature still yields a visible corner', () => {
  const p = clampToViewport(500, 500, 300, 200, 120, 100);
  assert.equal(p.x, 8);
  assert.equal(p.y, 8);
});
