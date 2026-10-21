import { useTranslation } from 'next-i18next';
import React from 'react';

import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import { OffensiveUpgrades } from '@/constants';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { fortificationName, structureName } from '@/utils/structureNames';

const OffenseUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t } = useTranslation(['structures', 'common']);

  // Server rule: requested index === current offense level (default 1).
  const rows = OffensiveUpgrades.filter(
    (item) => item.level <= fortLevel + 2,
  ).map((item, index) => ({
    key: `${item.name}_${item.level}`,
    name: structureName(t, 'offense', item.level, item.name) ?? item.name,
    position: item.level,
    purchaseIndex: index,
    cells: [
      fortificationName(t, item.fortLevelRequirement),
      `${t('upgrades.offenseBonus')}: ${item.offenseBonusPercentage}%`,
    ],
    cost: item.cost,
    requirement: {
      type: 'fort' as const,
      value: item.fortLevelRequirement,
      met: item.fortLevelRequirement <= fortLevel,
    },
  }));

  return (
    <UpgradeLedger
      columns={[t('upgrades.fortReq'), t('labels.bonus', { ns: 'common' })]}
      rows={rows}
      ownedPosition={userLevel}
      onBuy={(index) => buyUpgrade('offense', index, forceUpdate)}
    />
  );
};

export default OffenseUpgrade;
