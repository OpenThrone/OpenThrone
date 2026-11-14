import { MantineProvider } from '@mantine/core';
import { describe, expect, it, mock } from 'bun:test';
import { createInstance } from 'i18next';
import { renderToStaticMarkup } from 'react-dom/server';

import { AllianceCard } from '@/components/alliance/AllianceCard';
import { AllianceOverview } from '@/components/alliance/AllianceOverview';
import type { AllianceInfo } from '@/services/Alliance.service';

import alliances from '../../../public/locales/en/alliances.json';
import common from '../../../public/locales/en/common.json';
// next-i18next uses the CommonJS provider; use its context in this SSR test.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { I18nextProvider } = require('react-i18next');

// Static render only; the chat and join buttons are not clicked here.
mock.module('next/router', () => ({
  useRouter: () => ({
    push: () => undefined,
    query: {},
    asPath: '/alliances/7',
    pathname: '/alliances/[id]',
    events: { on: () => undefined, off: () => undefined },
  }),
}));

const render = (node: React.ReactNode) => {
  const i18n = createInstance();
  i18n.init({
    lng: 'en',
    initImmediate: false,
    defaultNS: 'alliances',
    resources: { en: { alliances, common } },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <MantineProvider>{node}</MantineProvider>
    </I18nextProvider>,
  );
};

const alliance = (status: string) =>
  ({
    id: 7,
    name: 'Iron Order',
    status,
    hall_level: 0,
    join_fee: '0',
    dues_amount: '0',
    dues_period: 'NONE',
    gold_in_bank: '0',
    created_at: '2026-11-01T00:00:00.000Z',
    leader: { display_name: 'Dev Raider' },
    _count: { members: 1 },
  }) as unknown as AllianceInfo;

describe('AllianceOverview chat card', () => {
  it('offers the alliance chat to members of an active alliance', () => {
    expect(
      render(<AllianceOverview alliance={alliance('ACTIVE')} isMember />),
    ).toContain('Open alliance chat');
  });

  it('hides the chat on a reserved alliance, which has none', () => {
    expect(
      render(<AllianceOverview alliance={alliance('RESERVED')} isMember />),
    ).not.toContain('Open alliance chat');
  });
});

describe('AllianceCard member cap', () => {
  it('shows members against the hall cap and says when it is full', () => {
    const html = render(
      <AllianceCard id={4} name="Full House" members={10} memberCap={10} />,
    );
    expect(html).toContain('10 / 10');
    expect(html).toContain('The alliance is full');
  });

  it('keeps the plain count when no cap is given', () => {
    const html = render(<AllianceCard id={4} name="Open Gate" members={2} />);
    expect(html).not.toContain('/ ');
    expect(html).not.toContain('The alliance is full');
  });
});
