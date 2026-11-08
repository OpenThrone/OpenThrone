import { Button, MantineProvider } from '@mantine/core';
import { describe, expect, it, mock } from 'bun:test';
import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nextProvider } from 'react-i18next';

import Form from '@/components/form';
import { themes } from '@/styles/themes';

// Captcha must be off when the form renders, whatever the surrounding
// environment (or a co-running captcha test) left behind; the form reads
// these at render time, not import time.
delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_ID;
process.env.NEXT_PUBLIC_DISABLE_TURNSTILE = 'true';

// Static render only; router and next-auth are only exercised in handlers.
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

const renderForm = (type: 'login' | 'register') =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MantineProvider theme={themes.HUMAN}>
        <Form type={type} layout="bare" />
      </MantineProvider>
    </I18nextProvider>,
  );

const submitButtonMarkup = (html: string) =>
  html.match(/<button[^>]*data-testid="submit-button"[^>]*>/)?.[0] ?? '';

describe('auth form submit/pending contract (issue #12)', () => {
  it('renders the shared Mantine button with its label, not a private pending widget', () => {
    const html = renderForm('login');
    const button = submitButtonMarkup(html);
    expect(button).toContain('type="submit"');
    // No bespoke LoadingDots swap: the label itself renders inside the button
    // (Mantine's Button-label wraps it; i18n key renders without resources).
    const label = html.match(
      /data-testid="submit-button"[\s\S]*?mantine-Button-label[^>]*>(?:<[^>]+>)*\s*auth\.signIn/,
    );
    expect(label).not.toBeNull();
    // The form rides Mantine's loading machinery: data-loading drives the
    // shared .button[data-loading] plate, and the typography now comes from
    // the shared Controls override, not inline button styles (React renders
    // inline styles kebab-cased).
    expect(button).not.toContain('font-family:');
    // Captcha is off in this environment (no site id): nothing disables it.
    expect(button).not.toContain('disabled');
  });

  it('exposes the pending state through Mantine loading, label kept', () => {
    // The primitive the form rides: data-loading drives the shared
    // .button[data-loading] plate, disabled is automatic, the label survives.
    const html = renderToStaticMarkup(
      <MantineProvider theme={themes.HUMAN}>
        <Button loading size="md" styles={{ root: { minHeight: 48 } }}>
          Sign In
        </Button>
      </MantineProvider>,
    );
    expect(html).toContain('data-loading="true"');
    expect(html).toContain('disabled');
    expect(html).toContain('Sign In');
  });
});
