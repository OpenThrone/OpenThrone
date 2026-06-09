import {
  faBuildingColumns,
  faCoins,
  faShield,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Group,
  SimpleGrid,
  Stack,
  Text,
  ThemeIcon,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import BattleUpgradesSection from '@/components/battle-upgrade';
import { GameCard } from '@/components/game/GameCard';
import MainArea from '@/components/MainArea';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import { BattleUpgrades, OffensiveUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { toLocale } from '@/utils/numberFormatting';

const useItems = (user) => {
  const [items, setItems] = useState({
    OFFENSE: [],
    DEFENSE: [],
    SPY: [],
    SENTRY: [],
  });

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
  const discountedCost = item.cost - (user?.priceBonus / 100) * item.cost;
  return {
    id: `${itemType}_${item.level}`,
    name: item.name,
    bonus: item.bonus,
    ownedItems:
      user?.battle_upgrades.find(
        (i) => i.type === item.type && i.level === item.level,
      )?.quantity || 0,
    cost: toLocale(discountedCost, user?.locale),
    baseCost: item.cost,
    discountedCost,
    enabled: item.SiegeUpgradeLevel <= siegeLevel,
    level: item.level,
    type: item.type,
    SiegeUpgradeLevel: item.SiegeUpgradeLevel,
    unitsCovered: item.unitsCovered,
    minUnitLevel: item.minUnitLevel,
    SiegeUpgrade: OffensiveUpgrades.find(
      (f) => f.level === item.SiegeUpgradeLevel,
    )?.name,
  };
};

const Upgrades = () => {
  const { t } = useTranslation('battle');
  const { user } = useUser();
  const items = useItems(user);

  // Calculate total offensive and defensive units (level 2+)
  const offensiveUnits =
    user?.units
      .filter((unit) => unit.type === 'OFFENSE' && unit.level > 1)
      .reduce((acc, unit) => acc + unit.quantity, 0) || 0;

  const defensiveUnits =
    user?.units
      .filter((unit) => unit.type === 'DEFENSE' && unit.level > 1)
      .reduce((acc, unit) => acc + unit.quantity, 0) || 0;

  return (
    <MainArea title={t('upgrades.title')}>
      <Stack gap="md">
        {/* Stats Section */}
        <GameCard title={t('upgrades.upgradeStatus')} icon={faCoins}>
          <SimpleGrid cols={{ base: 1, xs: 2, md: 4 }} spacing="sm">
            {[
              {
                label: t('upgrades.goldOnHand'),
                value: toLocale(user?.gold) ?? 0,
                icon: <FontAwesomeIcon icon={faCoins} />,
              },
              {
                label: t('upgrades.bankedGold'),
                value: toLocale(user?.goldInBank) ?? 0,
                icon: <FontAwesomeIcon icon={faBuildingColumns} />,
              },
            ].map((stat) => (
              <Group
                key={stat.label}
                gap="sm"
                wrap="nowrap"
                style={{
                  backgroundColor: '#0f141a',
                  borderRadius: '6px',
                  border: '1px solid #1f2b3b',
                  boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                  padding: '12px',
                  alignItems: 'center',
                }}
              >
                <ThemeIcon c="white" variant="light">
                  {stat.icon}
                </ThemeIcon>
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.4em' }}
                  >
                    {stat.label}
                  </Text>
                  <Text size="sm" fw={700} c="gray.2">
                    {stat.value}
                  </Text>
                </div>
              </Group>
            ))}
            <Tooltip label={t('upgrades.onlyLevel2Units')}>
              <Group
                gap="sm"
                wrap="nowrap"
                style={{
                  backgroundColor: '#0f141a',
                  borderRadius: '6px',
                  border: '1px solid #1f2b3b',
                  boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                  padding: '12px',
                  alignItems: 'center',
                }}
              >
                <ThemeIcon c="white" variant="light">
                  <RpgAwesomeIcon icon="crossed-swords" size="lg" />
                </ThemeIcon>
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.4em' }}
                  >
                    {t('upgrades.offensiveUnits')}
                  </Text>
                  <Text size="sm" fw={700} c="gray.2">
                    {toLocale(offensiveUnits)}
                  </Text>
                </div>
              </Group>
            </Tooltip>
            <Tooltip label={t('upgrades.onlyLevel2Units')}>
              <Group
                gap="sm"
                wrap="nowrap"
                style={{
                  backgroundColor: '#0f141a',
                  borderRadius: '6px',
                  border: '1px solid #1f2b3b',
                  boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                  padding: '12px',
                  alignItems: 'center',
                }}
              >
                <ThemeIcon c="white" variant="light">
                  <FontAwesomeIcon
                    icon={faShield}
                    style={{ width: '18px', height: '18px' }}
                  />
                </ThemeIcon>
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.4em' }}
                  >
                    {t('upgrades.defensiveUnits')}
                  </Text>
                  <Text size="sm" fw={700} c="gray.2">
                    {toLocale(defensiveUnits)}
                  </Text>
                </div>
              </Group>
            </Tooltip>
          </SimpleGrid>
        </GameCard>

        <GameCard
          title={t('upgrades.battleUpgradeInformation')}
          goldAccent={false}
        >
          <Text size="sm" c="gray.3" lh={1.7}>
            {t('upgrades.battleUpgradeInfo')}
          </Text>
        </GameCard>

        <BattleUpgradesSection
          heading={t('upgrades.offense')}
          type="OFFENSE"
          items={items.OFFENSE}
        />
        <BattleUpgradesSection
          heading={t('upgrades.defense')}
          type="DEFENSE"
          items={items.DEFENSE}
        />
        <BattleUpgradesSection
          heading={t('upgrades.spy')}
          type="SPY"
          items={items.SPY}
        />
        <BattleUpgradesSection
          heading={t('upgrades.sentry')}
          type="SENTRY"
          items={items.SENTRY}
        />
      </Stack>
    </MainArea>
  );
};

export default Upgrades;
