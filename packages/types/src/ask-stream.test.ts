import { describe, expect, it } from 'vitest';
import { createAskStreamParser } from './ask-stream';

const FRAMES = [
  'event: status\ndata: {"stage":"routing"}\n\n',
  'event: citations\ndata: {"sources":[{"n":1,"kind":"kb","documentId":"d1","filename":"vpn.md"},{"n":2,"kind":"web","title":"VPN","url":"https://example.com/vpn"}]}\n\n',
  'event: token\ndata: {"text":"Install "}\n\n',
  'event: done\ndata: {"answerSource":"kb","sourceConfidence":"high"}\n\n',
  'event: error\ndata: {"type":"https://omni-it-copilot.dev/problems/upstream","title":"Upstream service failed","requestId":"r1"}\n\n',
];

describe('ask stream parser', () => {
  it('parses all five event types', () => {
    const parser = createAskStreamParser();
    const events = parser.push(FRAMES.join(''));

    expect(events.map(e => e.event)).toEqual([
      'status',
      'citations',
      'token',
      'done',
      'error',
    ]);
    expect(events[0]).toEqual({
      event: 'status',
      data: { stage: 'routing' },
    });
    expect(events[2]).toEqual({
      event: 'token',
      data: { text: 'Install ' },
    });
    expect(events[3]).toEqual({
      event: 'done',
      data: { answerSource: 'kb', sourceConfidence: 'high' },
    });
  });

  it('gives the same events however the body is chunked', () => {
    const body = FRAMES.join('');
    const whole = createAskStreamParser().push(body);

    for (const size of [1, 3, 7, 50]) {
      const parser = createAskStreamParser();
      const events = [];
      for (let i = 0; i < body.length; i += size)
        events.push(...parser.push(body.slice(i, i + size)));
      events.push(...parser.end());
      expect(events).toEqual(whole);
    }
  });

  it('handles CRLF line endings, comments and a final frame without a blank line', () => {
    const parser = createAskStreamParser();
    const events = [
      ...parser.push(': keep-alive\r\n\r\nevent: token\r\ndata: {"text":"a"}\r\n\r\nevent: token\r\ndata: {"text":"b"}'),
      ...parser.end(),
    ];

    expect(events).toEqual([
      {
        event: 'token',
        data: { text: 'a' },
      },
      {
        event: 'token',
        data: { text: 'b' },
      },
    ]);
  });

  it('keeps text tokens exactly, including leading spaces and newlines', () => {
    const events = createAskStreamParser().push('event: token\ndata: {"text":" a\\nb"}\n\n');

    expect(events).toEqual([
      {
        event: 'token',
        data: { text: ' a\nb' },
      },
    ]);
  });

  it('rejects an unknown event name and an invalid payload', () => {
    expect(() => createAskStreamParser().push('event: nope\ndata: {}\n\n')).toThrow('Unknown ask stream event');
    expect(() => createAskStreamParser().push('event: done\ndata: {"answerSource":"x"}\n\n')).toThrow('Invalid payload');
  });
});
