import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';

import { StyledNews } from '@/components/game/StyledNews';

const renderPreview = (content: string) => {
  const i18n = createInstance();
  i18n.init({
    lng: 'en',
    initImmediate: false,
    resources: { en: { home: {} } },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MantineProvider>
        <StyledNews
          news={[
            {
              id: 1,
              title: 'Dispatch',
              content,
              created_timestamp: '2026-10-06T12:00:00Z',
              read: false,
            },
          ]}
        />
      </MantineProvider>
    </I18nextProvider>,
  );
};

describe('dispatch Markdown preview', () => {
  it('strips active HTML, event handlers and unsafe URLs', () => {
    // Malicious URL is deliberate test input; it must never reach an anchor.
    const maliciousContent =
      '<script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">Unsafe</a><iframe src="https://example.com"></iframe>';
    const html = renderPreview(maliciousContent);
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    // eslint-disable-next-line no-script-url
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<iframe');
  });

  it('preserves paragraphs, safe links and GFM excerpt content', () => {
    const html = renderPreview(
      'First **dispatch**.\n\nSecond paragraph with [details](https://example.com).\n\n- Supplies\n- Reinforcements',
    );
    expect(html).toContain('<p>First <strong>dispatch</strong>.</p>');
    expect(html).toContain('<p>Second paragraph');
    expect(html).toContain('href="https://example.com"');
    expect(html).toContain('<li>Supplies</li>');
    expect(html).not.toContain('<p><p>');
  });

  it('keeps heading levels through the shared MarkdownArticle renderer', () => {
    const html = renderPreview('# Era\n\n## New\n\n- Planner');
    expect(html).toMatch(/<h1[^>]*>Era<\/h1>/);
    expect(html).toMatch(/<h2[^>]*>New<\/h2>/);
    expect(html).not.toContain('<strong>Era</strong>');
  });
});
