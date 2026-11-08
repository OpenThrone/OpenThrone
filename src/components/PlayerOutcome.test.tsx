import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { createInstance } from 'i18next';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import battle from '../../public/locales/en/battle.json';
import PlayerOutcome from './PlayerOutcome';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { I18nextProvider } = require('react-i18next');

const i18n = createInstance();
i18n.init({
  lng: 'en',
  ns: ['battle'],
  defaultNS: 'battle',
  initImmediate: false,
  resources: { en: { battle } },
});

/** Rendered text a reader gets, without the SVG icon's own markup. */
const render = (winner: number) =>
  renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MantineProvider>
        <table>
          <tbody>
            <tr>
              <PlayerOutcome
                type="attack"
                log={
                  {
                    id: 22,
                    type: 'INTEL',
                    attacker_id: 5,
                    defender_id: 1,
                    winner,
                    timestamp: new Date('2026-10-30T02:29:14Z'),
                    defenderPlayer: { display_name: 'ThroneKeeper' },
                  } as any
                }
              />
            </tr>
          </tbody>
        </table>
      </MantineProvider>
    </I18nextProvider>,
  ).replace(/<svg[\s\S]*?<\/svg>/g, '');

describe('PlayerOutcome', () => {
  // Playtest #287: the outcome cell was an icon only, so it read as blank.
  it('names the outcome in text, not only an icon', () => {
    expect(render(5)).toContain(`>${battle.warHistory.won}</`);
    expect(render(1)).toContain(`>${battle.warHistory.lost}</`);
  });
});
