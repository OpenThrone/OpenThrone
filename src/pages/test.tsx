import { Text } from '@mantine/core';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';

import MainArea from '@/components/MainArea';
import AllianceSection from '@/components/showcase/sections/AllianceSection';
import BannersSection from '@/components/showcase/sections/BannersSection';
import BattleReportsSection from '@/components/showcase/sections/BattleReportsSection';
import CardsSection from '@/components/showcase/sections/CardsSection';
import ChatSection from '@/components/showcase/sections/ChatSection';
import FeedbackSection from '@/components/showcase/sections/FeedbackSection';
import FormsSection from '@/components/showcase/sections/FormsSection';
import FoundationsSection from '@/components/showcase/sections/FoundationsSection';
import ModalsSection from '@/components/showcase/sections/ModalsSection';
import NewsSection from '@/components/showcase/sections/NewsSection';
import ProfileMediaSection from '@/components/showcase/sections/ProfileMediaSection';
import TablesSection from '@/components/showcase/sections/TablesSection';
import ShowcaseControls from '@/components/showcase/ShowcaseControls';

const SECTIONS = [
  { id: 'foundations', title: 'Foundations', Component: FoundationsSection },
  { id: 'cards', title: 'Cards & stats', Component: CardsSection },
  { id: 'tables', title: 'Tables & lists', Component: TablesSection },
  { id: 'forms', title: 'Forms & orders', Component: FormsSection },
  {
    id: 'battle',
    title: 'Battle & spy reports',
    Component: BattleReportsSection,
  },
  { id: 'banners', title: 'Banners & notices', Component: BannersSection },
  { id: 'modals', title: 'Modals & dialogs', Component: ModalsSection },
  { id: 'profile', title: 'Profile & artwork', Component: ProfileMediaSection },
  { id: 'news', title: 'News & articles', Component: NewsSection },
  { id: 'chat', title: 'Chat & messaging', Component: ChatSection },
  { id: 'alliance', title: 'Alliances', Component: AllianceSection },
  { id: 'feedback', title: 'Loading & feedback', Component: FeedbackSection },
];

/**
 * Developer showcase of every in-game component with mock data and mock
 * actions, previewable per race theme, page backdrop and artwork source.
 */
export default function DesignShowcase() {
  return (
    <MainArea title="Design Showcase">
      <ShowcaseControls
        sections={SECTIONS.map(({ id, title }) => ({ id, title }))}
      />
      <Text size="sm" c="var(--ot-muted)" mt="md">
        Every component below is the one the game renders, fed with mock data.
        Buttons trigger mock actions only; nothing is sent to the server.
      </Text>
      {SECTIONS.map(({ id, Component }) => (
        <Component key={id} />
      ))}
    </MainArea>
  );
}

export const getServerSideProps = async (context: { locale?: string }) =>
  process.env.NODE_ENV === 'production'
    ? { notFound: true as const }
    : {
        props: {
          ...(await serverSideTranslations(context.locale ?? 'en', [
            'common',
            'battle',
            'home',
            'navigation',
            'structures',
            'alliances',
            'allianceTreasury',
            'messaging',
            'community',
            'units',
            'social',
            'how-to-play',
            'admin-activity',
          ])),
        },
      };
