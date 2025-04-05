import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import FortificationsTab from '@/components/fortification-upgrades';
import HousingTab from '@/components/housing-upgrades';
import EconomyTab from '@/components/economy-upgrades';
import OffenseUpgrade from '@/components/offenseupgrade';
import Alert from '@/components/alert';
import ArmoryUpgradesTab from '@/components/armory-upgrades';
import ClandestineUpgrade from '@/components/clandestineupgrades';
import { Tabs } from '@mantine/core';
import router from 'next/router';
import MainArea from '@/components/MainArea';
import ContentCard from '@/components/ContentCard';

const UpgradeTab = (props) => {
  const tab = usePathname()?.split('/')[3];
  const { user, forceUpdate } = useUser();
  const currentPage = tab || 'fortifications';
  const colorScheme = user?.colorScheme;

  // Get the title for the current tab
  const getTabTitle = () => {
    switch (currentPage) {
      case 'fortifications': return 'Fortifications';
      case 'offense': return 'Siege Upgrades';
      case 'intel': return 'Clandestine Upgrades';
      case 'armory': return 'Armory Upgrades';
      case 'houses': return 'Housing Upgrades';
      case 'economy': return 'Economy Upgrades';
      default: return 'Structure Upgrades';
    }
  };

  return (
    <MainArea title="Structure Upgrades">
      <Tabs variant="pills" defaultValue={currentPage} className="mb-2 font-medieval">
        <Tabs.List grow justify="center">
          <Tabs.Tab value="fortifications" onClick={() => {
            router.push("/structures/upgrades/fortifications");
          }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">Fortifications</span>
          </Tabs.Tab>
          <Tabs.Tab value="offense" onClick={() => { router.push("/structures/upgrades/offense") }}
            color={(colorScheme === "ELF") ?
              'green' : (
                colorScheme === 'GOBLIN' ? 'red' : (
                  colorScheme === 'UNDEAD' ? 'dark'
                    : 'blue'
                ))}
          >
            <span className="text-xl">Siege Upgrades</span>
          </Tabs.Tab>
          <Tabs.Tab value="intel" onClick={() => { router.push("/structures/upgrades/intel") }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">Clandestine Upgrades</span>
          </Tabs.Tab>
          <Tabs.Tab value="armory" onClick={() => { router.push("/structures/upgrades/armory") }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">Armory Upgrades</span>
          </Tabs.Tab>
          <Tabs.Tab value="economy" onClick={() => { router.push("/structures/upgrades/economy") }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">Economy Upgrades</span>
          </Tabs.Tab>
          <Tabs.Tab value="houses" onClick={() => { router.push("/structures/upgrades/houses") }}
            color={(colorScheme === "ELF") ? 'green' : (colorScheme === 'GOBLIN' ? 'red' : (colorScheme === 'UNDEAD' ? 'dark' : 'blue'))}
          >
            <span className="text-xl">Housing Upgrades</span>
          </Tabs.Tab>
        </Tabs.List>
      </Tabs>
      
      <div className="container mx-auto px-4 my-6">
        <ContentCard 
          title={getTabTitle()}
          variant="highlight" 
          titlePosition="center"
          titleSize="xl"
          className="max-w-7xl mx-auto"
        >
          <div className="p-4">
            {currentPage === 'fortifications' && <FortificationsTab userLevel={user?.level} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} />}
            {currentPage === 'offense' && <OffenseUpgrade userLevel={user?.offensiveLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} />}
            {currentPage === 'houses' && <HousingTab userLevel={user?.houseLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate} />}
            {currentPage === 'armory' && <ArmoryUpgradesTab userLevel={user?.armoryLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate}/> }
            {currentPage === 'economy' && <EconomyTab userLevel={user?.economyLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate}/>}
            {currentPage === 'intel' && <ClandestineUpgrade userLevel={user?.spyLevel} fortLevel={user?.fortLevel} forceUpdate={forceUpdate}/>}
          </div>
        </ContentCard>
      </div>
    </MainArea>
  );
};

export default UpgradeTab;
