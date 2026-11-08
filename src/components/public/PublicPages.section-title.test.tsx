import { MantineProvider } from '@mantine/core';
import { describe, expect, it, mock } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import PublicAuthLayout from '@/components/public/PublicAuthLayout';
import { themes } from '@/styles/themes';

// bun tests see CSS modules as empty objects; substitute stable names so the
// rendered markup shows exactly which classes the layout combines.
mock.module('@/components/public/PublicPages.module.css', () => ({
  default: {
    sectionTitle: 'section-title',
    authSectionTitle: 'auth-section-title',
    heroTitle: 'hero-title',
    heroDescription: 'hero-description',
    authForm: 'auth-form',
    authArt: 'auth-art',
    authLayout: 'auth-layout',
  },
}));

/**
 * Issue #12: the German auth title (Kommandantenzugang) must hyphenate
 * instead of clipping its 390px column — scoped to the auth funnel only,
 * because .sectionTitle is shared by 14 public layouts.
 */
const renderLayout = () =>
  renderToStaticMarkup(
    <MantineProvider theme={themes.HUMAN}>
      <PublicAuthLayout
        title="Return to the War Room"
        description="Your kingdom"
        formTitle="Kommandantenzugang"
      >
        <p>form</p>
      </PublicAuthLayout>
    </MantineProvider>,
  );

describe('auth section title hyphenation (issue #12)', () => {
  it('applies the hyphenation modifier to the auth form title only', () => {
    const html = renderLayout();
    const title = html.match(/<h2[^>]*>Kommandantenzugang<\/h2>/)?.[0] ?? '';
    expect(title).toContain('class="section-title auth-section-title ');
    // The hero title keeps the plain shared class, no auth modifier.
    const hero = html.match(/<h2[^>]*>Return to the War Room<\/h2>/)?.[0] ?? '';
    expect(hero).toContain('class="hero-title ');
    expect(hero).not.toContain('auth-section-title');
    // Exactly one element wears the modifier.
    expect(html.match(/auth-section-title/g)?.length).toBe(1);
  });
});
