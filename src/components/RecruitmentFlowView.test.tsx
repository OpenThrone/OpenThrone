import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';

import RecruitmentFlowView from '@/components/RecruitmentFlowView';

import common from '../../public/locales/en/common.json';
// next-i18next uses the CommonJS provider; use its context in this SSR test.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { I18nextProvider } = require('react-i18next');

const noop = () => {};

describe('RecruitmentFlowView embedded success', () => {
  it('says the recruits left are with this player, not a daily total (#339)', () => {
    const i18n = createInstance();
    i18n.init({
      lng: 'en',
      initImmediate: false,
      resources: { en: { common } },
    });
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MantineProvider>
          <RecruitmentFlowView
            isExternal={false}
            signedIn
            embedded
            submitting={false}
            error={null}
            succeeded
            ready
            showCaptcha={false}
            allowance={{}}
            userInfo={null}
            targetName="Nightjar"
            pairProgress={{
              name: 'Nightjar',
              used: 1,
              limit: 5,
              left: 4,
              resetsAt: '4:00 PM',
            }}
            formRef={{ current: null }}
            onSubmit={noop}
            onRetry={noop}
            onRegister={noop}
          />
        </MantineProvider>
      </I18nextProvider>,
    );
    expect(html).toContain(
      'You can recruit with Nightjar 4 more times today. Resets at 4:00 PM.',
    );
  });

  const render = (props: Record<string, unknown>) => {
    const i18n = createInstance();
    i18n.init({
      lng: 'en',
      initImmediate: false,
      resources: { en: { common } },
    });
    return renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MantineProvider>
          <RecruitmentFlowView
            isExternal
            signedIn={false}
            submitting={false}
            error={null}
            succeeded={false}
            ready
            showCaptcha
            allowance={{}}
            userInfo={{
              display_name: 'Ravenhold',
              level: 42,
              race: 'HUMAN',
              class: 'FIGHTER',
            }}
            formRef={{ current: null }}
            onSubmit={noop}
            onRetry={noop}
            onRegister={noop}
            {...props}
          />
        </MantineProvider>
      </I18nextProvider>,
    );
  };

  it('describes the self-hosted check, not Cloudflare, when ALTCHA is in use', () => {
    const html = render({ captchaProvider: 'altcha' });
    expect(html).toContain('quick check');
    expect(html).toContain('sends nothing to a third party');
    expect(html).not.toContain('Cloudflare');
  });

  it('keeps the Cloudflare wording for Turnstile', () => {
    const html = render({ captchaProvider: 'turnstile' });
    expect(html).toContain('Cloudflare&#x27;s captcha');
  });

  it('offers a retry after a failed check on the full page, not only when embedded', () => {
    const failed = render({
      captchaProvider: 'altcha',
      showCaptcha: false,
      error: 'Verification failed. Please try again.',
      retryable: true,
    });
    expect(failed).toContain('Try again');
    const refused = render({
      showCaptcha: false,
      error: 'You have reached the limit.',
    });
    expect(refused).not.toContain('Try again');
  });
});
