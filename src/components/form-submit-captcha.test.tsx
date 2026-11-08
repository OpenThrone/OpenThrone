import { MantineProvider } from '@mantine/core';
import { describe, expect, it, mock } from 'bun:test';
import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';

import Form from '@/components/form';
import { themes } from '@/styles/themes';

// Captcha must be enabled before the form module is imported: a site id is
// present and the disable flags are unset (they must not leak from the env).
process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID = 'test-site-key';
delete process.env.NEXT_PUBLIC_USE_CAPTCHA;
delete process.env.NEXT_PUBLIC_DISABLE_TURNSTILE;
delete process.env.DISABLE_TURNSTILE;

mock.module('next/router', () => ({
  useRouter: () => ({
    push: () => undefined,
    replace: () => undefined,
    query: {},
    events: { on: () => undefined, off: () => undefined },
  }),
}));
mock.module('next-auth/react', () => ({
  getSession: () => Promise.resolve(null),
  signIn: () => Promise.resolve({ ok: false }),
  useSession: () => ({ data: null, status: 'unauthenticated' }),
}));

const i18n = createInstance();
i18n.init({
  lng: 'en',
  initImmediate: false,
  resources: {
    en: { account: { auth: { signIn: 'Sign In', signUp: 'Sign Up' } } },
  },
});

describe('auth form captcha-disabled contract (issue #12)', () => {
  it('disables the submit button until a captcha token exists', () => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MantineProvider theme={themes.HUMAN}>
          <Form type="login" layout="bare" />
        </MantineProvider>
      </I18nextProvider>,
    );
    const button =
      html.match(/<button[^>]*data-testid="submit-button"[^>]*>/)?.[0] ?? '';
    expect(button).toContain('disabled');
  });
});
