import { useTranslation } from 'next-i18next';

import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import { HouseUpgrades } from '@/constants';
import type { BattleUpgradeProps, Locales } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName, structureName } from '@/utils/structureNames';

const HousingTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;

  // Server rule: requested index === current house level + 1.
  const rows = Object.values(HouseUpgrades)
    .filter((item) => item.index <= userLevel + 2)
    .map((item, index) => ({
      key: String(item.index),
      name: structureName(t, 'housing', item.index, item.name) ?? item.name,
      position: item.index,
      purchaseIndex: index,
      cells: [
        fortificationName(t, item.fortLevel) || t('upgrades.manor'),
        toLocale(item.citizensDaily, locale),
      ],
      cost: item.cost,
      requirement: {
        type: 'fort' as const,
        value: item.fortLevel,
        met: item.fortLevel <= fortLevel,
      },
    }));

  return (
    <UpgradeLedger
      columns={[t('upgrades.fortReq'), t('upgrades.citizensPerDay')]}
      rows={rows}
      ownedPosition={userLevel}
      onBuy={(index) => buyUpgrade('houses', index, forceUpdate)}
    />
  );
};

export default HousingTab;
