import { MantineProvider } from '@mantine/core';
import { describe, expect, it, mock } from 'bun:test';
import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
// Static render only; router and next-auth are exercised in handlers alone.
import { I18nextProvider } from 'react-i18next';

import Login from '@/pages/account/login';
import { themes } from '@/styles/themes';

// bun tests see CSS modules as empty objects; substitute stable names so the
// rendered markup shows exactly which classes the login page combines.
mock.module('@/components/public/PublicPages.module.css', () => ({
  default: {
    prose: 'prose',
    actions: 'actions',
    authActionButton: 'auth-action-button',
    authActionButtonLabel: 'auth-action-button-label',
    authSectionTitle: 'auth-section-title',
    sectionTitle: 'section-title',
    heroTitle: 'hero-title',
    heroDescription: 'hero-description',
    authForm: 'auth-form',
    authArt: 'auth-art',
    authLayout: 'auth-layout',
  },
}));

mock.module('next/router', () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    query: {},
    asPath: '/account/login',
    pathname: '/account/login',
    events: { on: () => undefined, off: () => undefined },
  }),
}));
mock.module('next-auth/react', () => ({
  getSession: () => Promise.resolve(null),
  signIn: () => Promise.resolve({ ok: false }),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

// Captcha off and no pending state: the submit button renders enabled.
delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID;
process.env.NEXT_PUBLIC_DISABLE_TURNSTILE = 'true';

const i18n = createInstance();
i18n.init({ lng: 'en', initImmediate: false, resources: { en: {} } });

/**
 * Issue #12: the long German action labels (Einen Kommandanten erstellen,
 * Ein verlorenes Konto wiederherstellen) must be capped to their column and
 * wrap, instead of spilling past the 390px login layout.
 */
describe('login action-button wrapping (issue #12)', () => {
  it('applies the wrap classes to the scene CTAs and the recover button', () => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MantineProvider theme={themes.HUMAN}>
          <Login />
        </MantineProvider>
      </I18nextProvider>,
    );

    // Exactly three auth-action buttons: the two scene CTAs inside .actions
    // and the recover-account button.
    expect(html.match(/auth-action-button /g)?.length).toBe(3);
    // The inner Mantine label carries the wrap class too: the root class
    // alone cannot override the label's nowrap + overflow hidden.
    expect(html.match(/auth-action-button-label/g)?.length).toBe(3);
    expect(
      (html.match(/<span[^>]*auth-action-button-label[^>]*>/g) ?? []).length,
    ).toBe(3);
    expect(
      (html.match(/<a[^>]*auth-action-button /g) ?? []).length,
    ).toBeGreaterThanOrEqual(3);
  });
});
