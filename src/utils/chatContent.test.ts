import { describe, expect, it } from 'bun:test';

import {
  chatPlainText,
  isSafeChatLink,
  parseChatRichContent,
} from './chatContent';

const rich = (content: unknown[]) => ({
  version: 1,
  doc: { type: 'doc', content },
});
const paragraph = (text: string, marks?: unknown[]) => ({
  type: 'paragraph',
  content: [{ type: 'text', text, ...(marks ? { marks } : {}) }],
});

describe('chat rich-content boundary', () => {
  it('preserves basic formatting and derives searchable plain text', () => {
    const content = parseChatRichContent(
      rich([
        paragraph('Hold the bridge', [{ type: 'bold' }]),
        { type: 'blockquote', content: [paragraph('At dusk')] },
        {
          type: 'codeBlock',
          attrs: { language: 'js' },
          content: [{ type: 'text', text: '<script>alert(1)</script>' }],
        },
      ]),
    );
    expect(chatPlainText(content.doc)).toBe(
      'Hold the bridge\nAt dusk\n<script>alert(1)</script>',
    );
    expect(content.doc.content?.[2]).not.toHaveProperty('attrs');
  });
  it.each([
    // eslint-disable-next-line no-script-url -- Deliberately rejected input.
    'javascript:alert(1)',
    'data:text/html,evil',
    '//evil.test',
    'https:\\evil.test',
    'java\nscript:alert(1)',
  ])('rejects unsafe links: %s', (href) => {
    expect(isSafeChatLink(href)).toBe(false);
    expect(() =>
      parseChatRichContent(
        rich([paragraph('link', [{ type: 'link', attrs: { href } }])]),
      ),
    ).toThrow();
  });
  it.each([
    'https://example.test/path',
    'http://example.test',
    'mailto:test@example.test',
    '/battle/results/42',
  ])('allows safe links: %s', (href) => {
    expect(isSafeChatLink(href)).toBe(true);
    expect(
      parseChatRichContent(
        rich([
          paragraph('link', [
            { type: 'link', attrs: { href, onclick: 'evil' } },
          ]),
        ]),
      ).doc.content?.[0]?.content?.[0]?.marks?.[0]?.attrs,
    ).toEqual({ href });
  });
  it('rejects HTML nodes, unsupported versions, empty text nodes, and excessive size/depth', () => {
    expect(() =>
      parseChatRichContent(rich([{ type: 'image', attrs: { src: 'evil' } }])),
    ).toThrow();
    expect(() => parseChatRichContent({ ...rich([]), version: 2 })).toThrow();
    expect(() => parseChatRichContent(rich([paragraph('')]))).toThrow();
    expect(() =>
      parseChatRichContent(rich([paragraph('x'.repeat(4001))])),
    ).toThrow();
    let nested: unknown = paragraph('nested');
    for (let i = 0; i < 15; i += 1)
      nested = { type: 'blockquote', content: [nested] };
    expect(() => parseChatRichContent(rich([nested]))).toThrow();
  });
});
