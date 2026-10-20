import {
  faBuildingColumns,
  faCoins,
  faShield,
} from '@fortawesome/free-solid-svg-icons';
import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useEffect, useState } from 'react';

import BattleUpgradesSection from '@/components/battle-upgrade';
import { GameCard } from '@/components/game/GameCard';
import { StatGrid } from '@/components/game/StatGrid';
import MainArea from '@/components/MainArea';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import { BattleUpgrades, OffensiveUpgrades, SpyUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import { getBattleUpgradeStructure } from '@/utils/battleUpgradeStructure';
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
      const itemMap = (item, itemType) => itemMapFunction(item, itemType, user);
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

const itemMapFunction = (item, itemType, user) => {
  // Each upgrade unlocks with the structure the server checks at purchase.
  const structure = getBattleUpgradeStructure(item.type);
  const structureLevel =
    structure === 'SPY' ? user?.spyLevel : user?.offensiveLevel;
  const structureUpgrades =
    structure === 'SPY' ? SpyUpgrades : OffensiveUpgrades;
  const discountedCost = item.cost - (user?.priceBonus / 100) * item.cost;
  return {
    id: `${itemType}_${item.level}`,
    name: item.name,
    // Upgrades carry several powers; show the one that matters for the type.
    bonus:
      item.bonus ??
      (item.type === 'DEFENSE' || item.type === 'SENTRY'
        ? Math.max(item.MeleeDefPower ?? 0, item.RangedDefPower ?? 0)
        : Math.max(item.MeleeAtkPower ?? 0, item.RangedAtkPower ?? 0)),
    ownedItems:
      user?.battle_upgrades.find(
        (i) => i.type === item.type && i.level === item.level,
      )?.quantity || 0,
    cost: toLocale(discountedCost, user?.locale),
    baseCost: item.cost,
    discountedCost,
    enabled: item.SiegeUpgradeLevel <= (structureLevel ?? 1),
    level: item.level,
    type: item.type,
    SiegeUpgradeLevel: item.SiegeUpgradeLevel,
    unitsCovered: item.unitsCovered,
    minUnitLevel: item.minUnitLevel,
    SiegeUpgrade: structureUpgrades.find(
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
        <StatGrid
          title={t('upgrades.upgradeStatus')}
          icon={faCoins}
          columns={4}
          stats={[
            {
              label: t('upgrades.goldOnHand'),
              value: toLocale(user?.gold ?? 0, user?.locale),
              icon: faCoins,
            },
            {
              label: t('upgrades.bankedGold'),
              value: toLocale(user?.goldInBank ?? 0, user?.locale),
              icon: faBuildingColumns,
            },
            {
              label: t('upgrades.offensiveUnits'),
              value: toLocale(offensiveUnits, user?.locale),
              icon: <RpgAwesomeIcon icon="crossed-swords" size="lg" />,
              tooltip: t('upgrades.onlyLevel2Units'),
              qualifier: t('upgrades.onlyLevel2Units'),
            },
            {
              label: t('upgrades.defensiveUnits'),
              value: toLocale(defensiveUnits, user?.locale),
              icon: faShield,
              tooltip: t('upgrades.onlyLevel2Units'),
              qualifier: t('upgrades.onlyLevel2Units'),
            },
          ]}
        />

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
