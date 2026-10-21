import { useTranslation } from 'next-i18next';
import React from 'react';

import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import { ArmoryUpgrades } from '@/constants';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { structureName } from '@/utils/structureNames';

const ArmoryUpgradesTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t } = useTranslation(['structures', 'common']);

  // Server rule: requested index === current armory level (default 1).
  const rows = ArmoryUpgrades.filter((item) => item.level <= fortLevel + 2).map(
    (item, index) => ({
      key: `${item.name}_${item.level}`,
      name: structureName(t, 'armory', item.level, item.name) ?? item.name,
      position: item.level,
      purchaseIndex: index,
      cells: [t('upgrades.armoryItems', { level: item.level })],
      cost: item.cost,
      requirement: {
        type: 'fort' as const,
        value: item.fortLevel,
        met: item.fortLevel <= fortLevel,
      },
    }),
  );

  return (
    <UpgradeLedger
      columns={[t('labels.bonus', { ns: 'common' })]}
      rows={rows}
      ownedPosition={userLevel}
      onBuy={(index) => buyUpgrade('armory', index, forceUpdate)}
    />
  );
};

export default ArmoryUpgradesTab;
