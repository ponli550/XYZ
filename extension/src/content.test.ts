import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticketKeyFrom } from './content.ts';

test('reads owner/repo#n from issue and PR URLs', () => {
  assert.equal(ticketKeyFrom('https://github.com/ponli550/XYZ/issues/5'), 'ponli550/XYZ#5');
  assert.equal(ticketKeyFrom('https://github.com/ponli550/XYZ/pull/12'), 'ponli550/XYZ#12');
  assert.equal(ticketKeyFrom('https://github.com/ponli550/XYZ/issues/5#issuecomment-99'), 'ponli550/XYZ#5');
  assert.equal(ticketKeyFrom('https://github.com/ponli550/XYZ/pull/12/files'), 'ponli550/XYZ#12');
});

test('issues and PRs share a number space, so one key covers both', () => {
  assert.equal(ticketKeyFrom('https://github.com/o/r/issues/7'),
               ticketKeyFrom('https://github.com/o/r/pull/7'));
});

test('returns null off an issue, so the rail unmounts instead of lingering', () => {
  assert.equal(ticketKeyFrom('https://github.com/ponli550/XYZ'), null);
  assert.equal(ticketKeyFrom('https://github.com/ponli550/XYZ/issues'), null);
  assert.equal(ticketKeyFrom('https://github.com/ponli550/XYZ/milestone/1'), null);
});
