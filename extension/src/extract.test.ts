import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { extract, completeness, embeddedPayload, titleFromDocumentTitle } from './extract.ts';

const doc = (html: string, title = 'x') =>
  new JSDOM(`<!doctype html><title>${title}</title>${html}`).window.document;

// The modern React Issues UI: data-testid, no legacy classes.
const REACT = `
<script type="application/json">{"payload":{"title":"agent: scoped run + tools","issue":{"number":5}}}</script>
<div data-testid="header-state">Open</div>
<div data-testid="issue-labels"><a href="/o/r/labels/track:ext">track:ext</a></div>
<div data-testid="issue-assignees"><a data-hovercard-type="user">ponli550</a></div>
<div data-testid="markdown-body">Cross-system contradiction is the product.</div>
<div data-testid="comment-viewer-outer-box"><div data-testid="markdown-body">body</div></div>
<div data-testid="comment-viewer-outer-box">
  <a data-hovercard-type="user">octocat</a>
  <relative-time datetime="2026-09-10T16:02:00Z"></relative-time>
  <div data-testid="markdown-body">merged in #12</div>
</div>`;

// The legacy Turbo markup still used on PR pages.
const TURBO = `
<h1><bdi class="js-issue-title">ext: shadow-DOM rail</bdi></h1>
<span class="State">Merged</span>
<div class="js-issue-labels"><a href="/o/r/labels/demo">demo</a></div>
<div class="markdown-body">The rail renders into a shadow root.</div>
<div class="timeline-comment"><div class="markdown-body">The rail renders into a shadow root.</div></div>
<div class="timeline-comment">
  <a class="author">ponli550</a>
  <relative-time datetime="2026-09-11T09:00:00Z"></relative-time>
  <div class="markdown-body">ship it</div>
</div>
<div class="merge-status-list"><div class="status-heading">All checks have passed</div></div>`;

test('React UI: embedded payload wins for title', () => {
  const c = extract(doc(REACT), 'o/r#5', 'issue');
  assert.equal(c.title, 'agent: scoped run + tools');
  assert.ok(c.via.includes('embedded:title'));
  assert.equal(c.state, 'open');
  assert.deepEqual(c.labels, ['track:ext']);
  assert.deepEqual(c.assignees, ['ponli550']);
  assert.match(c.body!, /contradiction is the product/);
});

test('Turbo UI: legacy classes still extract', () => {
  const c = extract(doc(TURBO), 'o/r#12', 'pull');
  assert.equal(c.title, 'ext: shadow-DOM rail');
  assert.equal(c.state, 'merged');
  assert.deepEqual(c.labels, ['demo']);
  assert.equal(c.ciStatus, 'All checks have passed');
});

test('first markdown block is the body, the rest are comments', () => {
  const c = extract(doc(REACT), 'o/r#5', 'issue');
  assert.equal(c.comments.length, 1, 'the body comment is not counted twice');
  assert.equal(c.comments[0]!.author, 'octocat');
  assert.equal(c.comments[0]!.at, '2026-09-10T16:02:00Z');
});

test('falls back to document.title when every selector misses', () => {
  const c = extract(doc('<div></div>', 'ui: ASCII creature · Issue #14 · ponli550/XYZ'), 'o/r#14', 'issue');
  assert.equal(c.title, 'ui: ASCII creature');
  assert.ok(c.via.includes('dom:title'));
});

test('never throws on a page it does not understand', () => {
  const c = extract(doc('<main>nothing familiar here</main>', 'random'), 'o/r#1', 'issue');
  assert.equal(c.title, null);
  assert.equal(c.state, null);
  assert.deepEqual(c.comments, []);
  assert.equal(completeness(c), 0, 'thin extraction is visible, not pretended');
});

test('completeness reports degradation instead of hiding it', () => {
  assert.ok(completeness(extract(doc(REACT), 'o/r#5', 'issue')) >= 0.8);
  assert.ok(completeness(extract(doc('<div class="State">Open</div>'), 'o/r#1', 'issue')) < 0.5);
});

test('ignores JSON blobs that are not GitHub payloads', () => {
  assert.equal(embeddedPayload(doc('<script type="application/json">{"ads":[1,2]}</script>')), null);
});

test('document.title parsing handles both issue and PR forms', () => {
  assert.equal(titleFromDocumentTitle('Fix the thing · Issue #5 · o/r'), 'Fix the thing');
  assert.equal(titleFromDocumentTitle('Fix the thing · Pull Request #5 · o/r'), 'Fix the thing');
  assert.equal(titleFromDocumentTitle('ponli550/XYZ'), null);
});
