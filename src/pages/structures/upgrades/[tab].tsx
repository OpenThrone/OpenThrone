import { Box, Tabs } from '@mantine/core';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';

import ArmoryUpgradesTab from '@/components/armory-upgrades';
import ClandestineUpgrade from '@/components/clandestineupgrades';
import EconomyTab from '@/components/economy-upgrades';
import FortificationsTab from '@/components/fortification-upgrades';
import { GameCard } from '@/components/game/GameCard';
import HousingTab from '@/components/housing-upgrades';
import MainArea from '@/components/MainArea';
import OffenseUpgrade from '@/components/offenseupgrade';
import { useUser } from '@/context/users';

const UpgradeTab = () => {
  const router = useRouter();
  const tabParam = Array.isArray(router.query.tab)
    ? router.query.tab[0]
    : router.query.tab;
  const tab = tabParam || 'fortifications';
  const { user, forceUpdate } = useUser();

  const { t } = useTranslation('structures');

  const getTabTitle = (currentTab: string) => {
    switch (currentTab) {
      case 'fortifications':
        return t('upgrades.titleFortifications');
      case 'offense':
        return t('upgrades.titleSiege');
      case 'intel':
        return t('upgrades.titleClandestine');
      case 'armory':
        return t('upgrades.titleArmory');
      case 'houses':
        return t('upgrades.titleHousing');
      case 'economy':
        return t('upgrades.titleEconomy');
      default:
        return t('upgrades.title');
    }
  };

  const tabs = [
    {
      value: 'fortifications',
      label: t('upgrades.tabFortifications'),
      component: (
        <FortificationsTab
          userLevel={user?.level}
          fortLevel={user?.fortLevel}
          forceUpdate={forceUpdate}
        />
      ),
    },
    {
      value: 'offense',
      label: t('upgrades.tabSiege'),
      component: (
        <OffenseUpgrade
          userLevel={user?.offensiveLevel}
          fortLevel={user?.fortLevel}
          forceUpdate={forceUpdate}
        />
      ),
    },
    {
      value: 'houses',
      label: t('upgrades.tabHousing'),
      component: (
        <HousingTab
          userLevel={user?.houseLevel}
          fortLevel={user?.fortLevel}
          forceUpdate={forceUpdate}
        />
      ),
    },
    {
      value: 'armory',
      label: t('upgrades.tabArmory'),
      component: (
        <ArmoryUpgradesTab
          userLevel={user?.armoryLevel}
          fortLevel={user?.fortLevel}
          forceUpdate={forceUpdate}
        />
      ),
    },
    {
      value: 'economy',
      label: t('upgrades.tabEconomy'),
      component: (
        <EconomyTab
          userLevel={user?.economyLevel}
          fortLevel={user?.fortLevel}
          forceUpdate={forceUpdate}
        />
      ),
    },
    {
      value: 'intel',
      label: t('upgrades.tabClandestine'),
      component: (
        <ClandestineUpgrade
          userLevel={user?.spyLevel}
          fortLevel={user?.fortLevel}
          forceUpdate={forceUpdate}
        />
      ),
    },
  ];

  return (
    <MainArea title={getTabTitle(tab)}>
      <Box className="rpg-inset" p="xs" style={{ borderRadius: '6px' }}>
        <Tabs
          value={tab}
          onChange={(value) => {
            if (value) {
              router.push(`/structures/upgrades/${value}`, undefined, {
                locale: router.locale,
              });
            }
          }}
          variant="pills"
        >
          <Tabs.List grow justify="center">
            {tabs.map((t) => (
              <Tabs.Tab key={t.value} value={t.value}>
                {t.label}
              </Tabs.Tab>
            ))}
          </Tabs.List>
        </Tabs>
      </Box>

      <GameCard title={getTabTitle(tab)} mt="md">
        {tabs.find((t) => t.value === tab)?.component}
      </GameCard>
    </MainArea>
  );
};

export default UpgradeTab;
