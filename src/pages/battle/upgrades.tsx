import BattleUpgradesSection from '@/components/battle-upgrade';
import { BattleUpgrades, OffensiveUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';
import Alert from '@/components/alert';
import { useEffect, useState } from 'react';
import { SimpleGrid, Group, Text, Space, Tooltip } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuildingColumns, faCoins, faShield } from '@fortawesome/free-solid-svg-icons';
import MainArea from '@/components/MainArea';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import StatCard from '@/components/StatCard';
import ContentCard from '@/components/ContentCard';
import { BiCoinStack, BiSolidBank } from 'react-icons/bi';

const useItems = (user) => {
  const [items, setItems] = useState({ OFFENSE: [], DEFENSE: [], SPY: [], SENTRY: [] });

  useEffect(() => {
    if (user) {
      const itemMap = (item, itemType) =>
        itemMapFunction(item, itemType, user, user.offensiveLevel);
      setItems({
        OFFENSE: BattleUpgrades.filter((i) => i.type === 'OFFENSE').map((i) =>
          itemMap(i, 'OFFENSE'),
        ),
        DEFENSE: BattleUpgrades.filter((i) => i.type === 'DEFENSE').map((i) =>
          itemMap(i, 'DEFENSE'),
        ),
        SPY: BattleUpgrades.filter((i) => i.type === 'SPY').map((i) =>
          itemMap(i, 'SPY'),
        ),
        SENTRY: BattleUpgrades.filter((i) => i.type === 'SENTRY').map((i) =>
          itemMap(i, 'SENTRY'),
        ),
      });
    }
  }, [user]);
  return items;
};

const itemMapFunction = (item, itemType, user, siegeLevel) => {
  return {
    id: `${itemType}_${item.level}`,
    name: item.name,
    bonus: item.bonus,
    ownedItems:
      user?.battle_upgrades.find(
        (i) =>
          i.type === item.type &&
          i.level === item.level 
      )?.quantity || 0,
    cost: toLocale(
      item.cost - (user?.priceBonus / 100) * item.cost,
      user?.locale,
    ),
    enabled: item.SiegeUpgradeLevel <= siegeLevel,
    level: item.level,
    type: item.type,
    SiegeUpgradeLevel: item.SiegeUpgradeLevel,
    unitsCovered: item.unitsCovered,
    minUnitLevel: item.minUnitLevel,
    SiegeUpgrade: OffensiveUpgrades.find((f) => f.level === item.SiegeUpgradeLevel)?.name,
  };
};

const Upgrades = (props) => {
  const { user } = useUser();
  
  // Calculate total offensive and defensive units (level 2+)
  const offensiveUnits = user?.units
    .filter((unit) => unit.type === 'OFFENSE' && unit.level > 1)
    .reduce((acc, unit) => acc + unit.quantity, 0) || 0;
    
  const defensiveUnits = user?.units
    .filter((unit) => unit.type === 'DEFENSE' && unit.level > 1)
    .reduce((acc, unit) => acc + unit.quantity, 0) || 0;
  
  return (
    <MainArea title="Battle Upgrades">
      {/* Stats Section */}
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} className="mb-6">
        <StatCard 
          title="Gold On Hand"
          value={toLocale(user?.gold) ?? 0}
          icon={<BiCoinStack size={18} />}
        />
        <StatCard 
          title="Banked Gold"
          value={toLocale(user?.goldInBank) ?? 0}
          icon={<BiSolidBank size={18} />}
        />
        <Tooltip label='Only Level 2+ Units'>
          <div>
            <StatCard 
              title="Offensive Units"
              value={toLocale(offensiveUnits)}
              icon={<RpgAwesomeIcon icon="crossed-swords" size={18} />}
            />
          </div>
        </Tooltip>
        <Tooltip label='Only Level 2+ Units'>
          <div>
            <StatCard 
              title="Defensive Units"
              value={toLocale(defensiveUnits)}
              icon={<FontAwesomeIcon icon={faShield} style={{ width: '18px', height: '18px' }} />}
            />
          </div>
        </Tooltip>
      </SimpleGrid>

      <ContentCard 
        title="Battle Upgrade Information"
        variant="default"
        titlePosition="left"
        className="mb-6"
      >
        <Text size='md' p="md">
          Only Level 2 and higher units can use battle upgrades. Battle upgrades provide stat bonuses to your units in combat.
        </Text>
      </ContentCard>

      
        <BattleUpgradesSection heading='Offense' type='OFFENSE' items={useItems(user).OFFENSE} />
        <BattleUpgradesSection heading='Defense' type='DEFENSE' items={useItems(user).DEFENSE} />     
        <BattleUpgradesSection heading='Spy' type='SPY' items={useItems(user).SPY} />
        <BattleUpgradesSection heading='Sentry' type='SENTRY' items={useItems(user).SENTRY} />
    </MainArea>
  );
};

export default Upgrades;
