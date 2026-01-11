import { usePathname, useRouter } from 'next/navigation';
import { useUser } from '@/context/users';
import FortificationsTab from '@/components/fortification-upgrades';
import HousingTab from '@/components/housing-upgrades';
import EconomyTab from '@/components/economy-upgrades';
import OffenseUpgrade from '@/components/offenseupgrade';
import ArmoryUpgradesTab from '@/components/armory-upgrades';
import ClandestineUpgrade from '@/components/clandestineupgrades';
import { Box, Tabs } from '@mantine/core';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';

const UpgradeTab = () => {
  const tab = usePathname()?.split('/')[3] || 'fortifications';
  const { user, forceUpdate } = useUser();
  const router = useRouter();

  const getTabTitle = (currentTab: string) => {
    switch (currentTab) {
      case 'fortifications': return 'Fortifications';
      case 'offense': return 'Siege Upgrades';
      case 'intel': return 'Clandestine Upgrades';
      case 'armory': return 'Armory Upgrades';
      case 'houses': return 'Housing Upgrades';
      case 'economy': return 'Economy Upgrades';
      default: return 'Structure Upgrades';
    }
  };
  
  const tabs = [
    { value: 'fortifications', label: 'Fortifications', component: <FortificationsTab userLevel={user?.level} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} /> },
    { value: 'offense', label: 'Siege', component: <OffenseUpgrade userLevel={user?.offensiveLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} /> },
    { value: 'houses', label: 'Housing', component: <HousingTab userLevel={user?.houseLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} /> },
    { value: 'armory', label: 'Armory', component: <ArmoryUpgradesTab userLevel={user?.armoryLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} /> },
    { value: 'economy', label: 'Economy', component: <EconomyTab userLevel={user?.economyLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} /> },
    { value: 'intel', label: 'Clandestine', component: <ClandestineUpgrade userLevel={user?.spyLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} /> },
  ];

  return (
    <MainArea title={getTabTitle(tab)}>
      <Box className="rpg-inset" p="xs" style={{ borderRadius: '6px' }}>
        <Tabs value={tab} onChange={(value) => router.push(`/structures/upgrades/${value}`)} variant="pills" color="yellow">
          <Tabs.List grow justify="center">
            {tabs.map(t => <Tabs.Tab key={t.value} value={t.value}>{t.label}</Tabs.Tab>)}
          </Tabs.List>
        </Tabs>
      </Box>

      <GameCard title={getTabTitle(tab)} mt="md">
        {tabs.find(t => t.value === tab)?.component}
      </GameCard>
    </MainArea>
  );
};

export default UpgradeTab;
