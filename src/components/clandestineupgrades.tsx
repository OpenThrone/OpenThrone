import { useTranslation } from 'next-i18next';
import React from 'react';

import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import { SpyUpgrades } from '@/constants';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { fortificationName, structureName } from '@/utils/structureNames';

const ClandestineUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t } = useTranslation(['structures', 'common']);

  // Server rule: requested index === current spy level (default 1).
  const rows = SpyUpgrades.filter(
    (item) => item.fortLevelRequirement <= fortLevel + 2,
  ).map((item, index) => ({
    key: `${item.level}_${item.name}`,
    name: structureName(t, 'spy', item.level, item.name) ?? item.name,
    position: item.level,
    purchaseIndex: index,
    cells: [
      fortificationName(t, item.fortLevelRequirement),
      <>
        {t('upgrades.spyBonus')}: {item.offenseBonusPercentage}%<br />
        {t('upgrades.maxInfiltrations')}: {item.maxInfiltrations}
        <br />
        {t('upgrades.maxAssassinations')}: {item.maxAssassinations}
      </>,
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
      onBuy={(index) => buyUpgrade('spy', index, forceUpdate)}
    />
  );
};

export default ClandestineUpgrade;
