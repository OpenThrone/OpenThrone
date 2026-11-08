import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { createInstance } from 'i18next';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { StatCard } from '@/pages/home/levels';

import home from '../../../../public/locales/en/home.json';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { I18nextProvider } = require('react-i18next');

const i18n = createInstance();
i18n.init({
  lng: 'en',
  ns: ['home'],
  defaultNS: 'home',
  initImmediate: false,
  resources: { en: { home } },
});

describe('Levels StatCard', () => {
  it('names the +/- buttons after the proficiency they change', () => {
    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MantineProvider>
          <StatCard
            title="Dexterity"
            currentLevel={3}
            onAdd={() => {}}
            onReduce={() => {}}
            canAdd
            canReduce
            icon={undefined}
          />
        </MantineProvider>
      </I18nextProvider>,
    );
    expect(html).toContain('aria-label="Increase Dexterity"');
    expect(html).toContain('aria-label="Decrease Dexterity"');
  });
});

describe('Levels StatCard bonus', () => {
  const render = (points: number) =>
    renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <MantineProvider>
          <StatCard
            title="Wealth"
            currentLevel={points}
            onAdd={() => {}}
            onReduce={() => {}}
            canAdd
            canReduce
            icon={undefined}
          />
        </MantineProvider>
      </I18nextProvider>,
    );

  it('shows the bonus the game applies, not the number of points', () => {
    // 1 point: 0.35 * 1 / 251 = 0.139%, not 1%.
    const html = render(1);
    expect(html).toContain('0.14%');
    expect(html).not.toContain('>1%<');
    expect(html).toContain('1 / 75 points');
  });

  it('shows the real bonus at the 75-point cap', () => {
    expect(render(75)).toContain('8.08%');
  });
});
