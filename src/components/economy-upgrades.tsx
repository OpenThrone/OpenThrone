import { useTranslation } from 'next-i18next';

import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import { EconomyUpgrades } from '@/constants';
import type { BattleUpgradeProps, Locales } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';
import { fortificationName, structureName } from '@/utils/structureNames';

const EconomyTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  forceUpdate,
  fortLevel,
}) => {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;

  // Server rule: requested index === current economy level + 1.
  const rows = EconomyUpgrades.filter(
    (item) => item.index <= userLevel + 2,
  ).map((item, index) => ({
    key: String(item.index),
    name: structureName(t, 'economy', item.index, item.name) ?? item.name,
    position: item.index,
    purchaseIndex: index,
    cells: [
      fortificationName(t, item.fortLevel) || t('upgrades.manor'),
      toLocale(item.goldPerWorker, locale),
      toLocale(item.depositsPerDay, locale),
      `${toLocale(item.goldTransferTx, locale)}/${toLocale(item.goldTransferRec, locale)}`,
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
      columns={[
        t('upgrades.fortReq'),
        t('upgrades.goldPerWorker'),
        t('upgrades.depositsPerDay'),
        t('upgrades.goldTransfer'),
      ]}
      rows={rows}
      ownedPosition={userLevel}
      onBuy={(index) => buyUpgrade('economy', index, forceUpdate)}
    />
  );
};

export default EconomyTab;
