import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'bun:test';
import { createInstance } from 'i18next';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import AssassinateResult from '@/components/AssassinateResult';
import InfiltrationResult from '@/components/InfiltrationResult';
import IntelResult from '@/components/IntelResult';

import common from '../../../public/locales/en/common.json';
// next-i18next uses the CommonJS provider; use its context in this SSR test.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { I18nextProvider } = require('react-i18next');

const battle = {
  id: 91,
  attacker_id: 11,
  defender_id: 12,
  winner: 11,
  attackerPlayer: {
    id: 11,
    display_name: 'Attacker Alice',
    race: 'HUMAN',
    experience: 100,
  },
  defenderPlayer: {
    id: 12,
    display_name: 'Defender Bob',
    race: 'ELF',
    experience: 100,
  },
  stats: {
    spyResults: {
      spiesSent: 8,
      spiesLost: 2,
      unitsKilled: 3,
      fortDmg: 10,
      unit: 'OFFENSE',
    },
  },
};
function render(node: ReactNode) {
  const i18n = createInstance();
  i18n.init({ lng: 'en', initImmediate: false, resources: { en: { common } } });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MantineProvider>{node}</MantineProvider>
    </I18nextProvider>,
  );
}
const text = (html: string) => html.replace(/<[^>]+>/g, ' ');

describe('spy reports use the actual viewer perspective', () => {
  it('uses neutral assassination text for an anonymous or shared reader', () => {
    const html = render(<AssassinateResult battle={battle} viewerID={0} />);
    expect(text(html)).toContain('Attacker Alice sent 8 assassins');
    expect(text(html)).toContain('The attacker lost 2 spies.');
    expect(text(html)).not.toMatch(/\b(you|your)\b/i);
    expect(text(html)).not.toContain('Attack Back');
    expect(text(html)).not.toContain('Send More Spies');
  });
  it('keeps defender and attacker assassination copy personal', () => {
    expect(
      text(render(<AssassinateResult battle={battle} viewerID={11} />)),
    ).toContain('You sent 8 assassins');
    expect(
      text(render(<AssassinateResult battle={battle} viewerID={12} />)),
    ).toContain('You lost 3');
  });
  it('keeps infiltration and failed-intel reports neutral for third parties', () => {
    expect(
      text(
        render(
          <InfiltrationResult
            battle={battle}
            viewerID={99}
            lastGenerated={undefined}
          />,
        ),
      ),
    ).not.toMatch(/\b(you|your)\b/i);
    expect(
      text(
        render(
          <IntelResult
            battle={{ ...battle, winner: 12 }}
            viewerID={99}
            lastGenerated={undefined}
          />,
        ),
      ),
    ).not.toMatch(/\b(you|your)\b/i);
  });
});
