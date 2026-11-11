import type { ChatMessage as ChatMessageData } from '@/lib/chat-state';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { ChatMessage } from './chat-message';

function render(overrides: Partial<ChatMessageData>): string {
  const message: ChatMessageData = {
    id: 'a',
    question: 'How do I connect?',
    status: 'done',
    text: 'Answer',
    sources: [],
    ...overrides,
  };
  return renderToStaticMarkup(<ChatMessage message={message} canRetry onRetry={() => {}} />);
}

it('shows HTML in the question and answer as literal text', () => {
  const html = render({
    question: '<img src=x onerror=alert(1)>',
    text: '<script>alert(1)</script> <b>bold</b>',
  });

  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<img');
  expect(html).not.toContain('<b>');
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
});

it('shows HTML in source titles and file names as literal text', () => {
  const html = render({
    sources: [
      {
        n: 1,
        kind: 'kb',
        documentId: 'd',
        filename: '<i>vpn</i>.md',
      },
      {
        n: 2,
        kind: 'web',
        title: '<u>Guide</u>',
        url: 'https://example.com/guide',
      },
    ],
  });

  expect(html).not.toContain('<i>');
  expect(html).not.toContain('<u>');
  expect(html).toContain('&lt;i&gt;vpn&lt;/i&gt;.md');
  expect(html).toContain('&lt;u&gt;Guide&lt;/u&gt;');
});

it('links http(s) web sources in a new tab without the referrer', () => {
  const html = render({
    sources: [
      {
        n: 1,
        kind: 'web',
        title: 'Guide',
        url: 'https://example.com/guide',
      },
    ],
  });

  expect(html).toContain('href="https://example.com/guide"');
  expect(html).toContain('target="_blank"');
  expect(html).toContain('rel="noopener noreferrer"');
});

it.each([
  'javascript:alert(1)',
  'data:text/html,<p>x</p>',
  'ftp://example.com/file',
])('does not link %s', (url) => {
  const html = render({
    sources: [
      { n: 1, kind: 'web', title: 'Bad', url },
    ],
  });

  expect(html).not.toContain('<a ');
  expect(html).not.toContain('href=');
  expect(html).toContain('Bad');
});

it('lists no sources section when there are none', () => {
  expect(render({})).not.toContain('Sources');
});

it.each([
  [
    'kb',
    'high',
    'From company documents',
    'High confidence',
  ],
  [
    'web',
    'medium',
    'From the web',
    'Medium confidence',
  ],
  [
    'fallback',
    'low',
    'General guidance',
    'Low confidence',
  ],
] as const)('labels a %s answer with %s confidence', (answerSource, confidence, label, confidenceLabel) => {
  const html = render({ answerSource, confidence });

  expect(html).toContain(label);
  expect(html).toContain(confidenceLabel);
});

it('warns that a fallback answer is not backed by company documents', () => {
  const html = render({ answerSource: 'fallback', confidence: 'low' });

  expect(html).toContain('role="note"');
  expect(html).toContain('not backed by company documents');
});

it('shows no confidence badge for a direct answer, whatever the API sent', () => {
  const html = render({ answerSource: 'direct', confidence: 'high' });

  expect(html).toContain('Direct answer');
  expect(html).not.toContain('confidence');
  expect(html).not.toContain('role="note"');
});

it('shows a friendly error with retry and request id, without raw text', () => {
  const html = render({
    status: 'error',
    text: 'Partial',
    error: { kind: 'stream_failed', requestId: 'req-42' },
  });

  expect(html).toContain('role="alert"');
  expect(html).toContain('This answer is incomplete.');
  expect(html).toContain('Reference: req-42');
  expect(html).toContain('Try again');
});
