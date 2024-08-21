import BattleUpgradesSection from '@/components/battle-upgrade';
import { BattleUpgrades, OffenseiveUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import toLocale from '@/utils/numberFormatting';
import Alert from '@/components/alert';
import { useEffect, useState } from 'react';
import { SimpleGrid, Paper, Group, Text, Space, ThemeIcon, Tooltip } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faBuildingColumns, faCoins, faShield } from '@fortawesome/free-solid-svg-icons';

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
    SiegeUpgrade: OffenseiveUpgrades.find((f) => f.level === item.SiegeUpgradeLevel)?.name,
  };
};

const Upgrades = (props) => {
  const { user } = useUser();
  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Upgrades</h2>
      <div className="my-5 flex justify-between">
        <Alert />
      </div>
      <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }}>
        <Paper withBorder p="md" radius={'md'} key='GoldOnHand'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Gold On Hand</Text>

            <ThemeIcon c='white'>
              <FontAwesomeIcon icon={faCoins} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>
              {toLocale(user?.gold, user?.locale)}
            </Text>
          </Group>
        </Paper>
        <Paper withBorder p="md" radius={'md'} key='BankedGold'>
          <Group justify='space-between'>
            <Text size="lg" fw={'bold'} c="dimmed">Banked Gold</Text>
            <ThemeIcon c='white'>
              <FontAwesomeIcon icon={faBuildingColumns} />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>
              {toLocale(user?.goldInBank, user?.locale)}
            </Text>
          </Group>
        </Paper>
        <Tooltip label='Only Level 2+ Units'>
        <Paper withBorder p="md" radius={'md'} key='UntrainedCitz'>            
          <Group justify='space-between'>
              <Text size="lg" fw={'bold'} c="dimmed">Offensive Units</Text>
            <ThemeIcon c='white'>
              <i className="ra ra-crossed-swords ra-fw" />
            </ThemeIcon>
          </Group>
          <Group>
            <Text>
                {user?.units.filter((unit) => unit.type === 'OFFENSE' && unit.level > 1).reduce((acc, unit) => acc + unit.quantity, 0)}
            </Text>
              </Group>
        </Paper>
        </Tooltip>
        <Tooltip label='Only Level 2+ Units'>
          <Paper withBorder p="md" radius={'md'} key='UntrainedCitz'>
            <Group justify='space-between'>
              <Text size="lg" fw={'bold'} c="dimmed">Defensive Units</Text>
              <ThemeIcon c='white'>
                <FontAwesomeIcon icon={faShield} />
              </ThemeIcon>
            </Group>
            <Group>
              <Text>
                {user?.units.filter((unit) => unit.type === 'DEFENSE' && unit.level > 1).reduce((acc, unit) => acc + unit.quantity, 0)}
              </Text>
            </Group>
          </Paper>
        </Tooltip>
      </SimpleGrid>
      <Space h="md" />
      <Text size='lg'>Only Level 2 and higher units can use battle upgrades.</Text>
      <div className="mb-4 flex flex-col justify-around">
        <BattleUpgradesSection heading='Offense' type='OFFENSE' items={useItems(user).OFFENSE} />

        <BattleUpgradesSection heading='Defense' type='DEFENSE' items={useItems(user).DEFENSE} />

        <BattleUpgradesSection heading='Spy' type='SPY' items={useItems(user).SPY} />

        <BattleUpgradesSection heading='Sentry' type='SENTRY' items={useItems(user).SENTRY} />
      </div>
    </div>
  );
};

export default Upgrades;
