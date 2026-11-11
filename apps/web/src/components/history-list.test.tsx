import type { HistoryListProps } from './history-list';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { HistoryList } from './history-list';

function noop() {}

const conversations = [
  { id: '550e8400-e29b-41d4-a716-446655440001', title: 'VPN on Windows', updatedAt: '2026-01-15T12:00:00.000Z' },
  { id: '550e8400-e29b-41d4-a716-446655440002', title: '<img src=x onerror=alert(1)>', updatedAt: '2026-01-14T12:00:00.000Z' },
];

function render(overrides: Partial<HistoryListProps> = {}): string {
  return renderToStaticMarkup(
    <HistoryList
      status="ready"
      conversations={conversations}
      onOpen={noop}
      onRetryLoad={noop}
      onStartRename={noop}
      onCancelRename={noop}
      onRename={noop}
      onConfirmDelete={noop}
      onCancelDelete={noop}
      onDelete={noop}
      onStartChat={noop}
      {...overrides}
    />,
  );
}

it('shows a labelled loading state while the list loads', () => {
  const html = render({ status: 'loading', conversations: [] });

  expect(html).toContain('role="status"');
  expect(html).toContain('Loading conversations');
  expect(html).not.toContain('<ul');
});

it('says nothing is saved yet and offers to start a chat', () => {
  const html = render({ conversations: [] });

  expect(html).toContain('No saved conversations yet');
  expect(html).toContain('Start a chat');
});

it('shows a plain-language error with a retry action', () => {
  const html = render({ status: 'error', conversations: [], loadError: 'We couldn\'t load your conversations.' });

  expect(html).toContain('role="alert"');
  expect(html).toContain('We couldn&#x27;t load your conversations.');
  expect(html).toContain('Try again');
});

it('lists conversations in a labelled list, each with named rename and delete controls', () => {
  const html = render();

  expect(html).toContain('aria-label="Saved conversations"');
  expect(html).toContain('VPN on Windows');
  expect(html).toContain('aria-label="Rename VPN on Windows"');
  expect(html).toContain('aria-label="Delete VPN on Windows"');
  expect(html.match(/<li/g)).toHaveLength(2);
});

it('shows titles as literal text', () => {
  const html = render();

  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

it('marks the open conversation as current for screen readers', () => {
  const html = render({ openId: conversations[0]!.id });

  expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  expect(html).toContain('data-current="true"');
});

it('shows an inline rename field labelled with the title, limited to 60 characters', () => {
  const html = render({ renamingId: conversations[0]!.id });

  expect(html).toContain('aria-label="Title for VPN on Windows"');
  expect(html).toContain('maxLength="60"');
  expect(html).toContain('aria-label="Save title"');
  expect(html).toContain('aria-label="Cancel rename"');
});

it('asks for confirmation before deleting, with a way to cancel', () => {
  const html = render({ confirmDeleteId: conversations[0]!.id });

  expect(html).toContain('aria-label="Confirm deleting VPN on Windows"');
  expect(html).toContain('Delete this conversation for good?');
  expect(html).toContain('Cancel');
  // Only the other row still offers the one-click delete icon.
  expect(html).not.toContain('aria-label="Delete VPN on Windows"');
  expect(html).toContain('aria-label="Delete &lt;img');
});

it('shows progress while a conversation opens and while a delete runs', () => {
  expect(render({ openingId: conversations[0]!.id })).toContain('Opening…');
  expect(render({ confirmDeleteId: conversations[0]!.id, deletePending: true })).toContain('Deleting…');
});

it('shows an action failure above the list', () => {
  const html = render({ actionError: 'That conversation no longer exists.' });

  expect(html).toContain('role="alert"');
  expect(html).toContain('That conversation no longer exists.');
});
