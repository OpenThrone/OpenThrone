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
});
