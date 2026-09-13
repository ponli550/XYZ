import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ticketKeyFrom } from './content.ts';

test('reads the ticket key from both Jira URL shapes', () => {
  assert.equal(ticketKeyFrom('https://x.atlassian.net/browse/GTI-142'), 'GTI-142');
  assert.equal(ticketKeyFrom('https://x.atlassian.net/browse/GTI-142?focusedId=9'), 'GTI-142');
  assert.equal(
    ticketKeyFrom('https://x.atlassian.net/jira/software/projects/GTI/boards/1?selectedIssue=GTI-207'),
    'GTI-207');
});

test('returns null off a ticket, so the rail unmounts instead of lingering', () => {
  assert.equal(ticketKeyFrom('https://x.atlassian.net/jira/your-work'), null);
  assert.equal(ticketKeyFrom('https://x.atlassian.net/browse/'), null);
  assert.equal(ticketKeyFrom('https://x.atlassian.net/browse/notaticket'), null);
});
