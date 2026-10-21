import { useTranslation } from 'next-i18next';

import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import { Fortifications } from '@/constants';
import type { BattleUpgradeProps, Locales } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { toLocale } from '@/utils/numberFormatting';
import { structureName } from '@/utils/structureNames';

const FortificationsTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { t, i18n } = useTranslation(['structures', 'common']);
  const locale = i18n.language as Locales;

  // Server rule: requested index === current fort level.
  const rows = Fortifications.filter((item) => item.level <= fortLevel + 2).map(
    (item, index) => ({
      key: `${item.level}_${item.name}`,
      name:
        structureName(t, 'fortifications', item.level, item.name) ?? item.name,
      position: item.level,
      purchaseIndex: index,
      cells: [
        item.levelRequirement,
        <>
          {t('fortifications.goldPerTurn')}:{' '}
          {toLocale(item.goldPerTurn, locale)}
          <br />
          {t('fortifications.defenseBonus')}: {item.defenseBonusPercentage}%
          <br />
          {t('upgrades.maxHp')}: {toLocale(item.hitpoints, locale)}
        </>,
      ],
      cost: item.cost,
      requirement: {
        type: 'level' as const,
        value: item.levelRequirement,
        met: item.levelRequirement <= userLevel,
      },
    }),
  );

  return (
    <UpgradeLedger
      columns={[t('upgrades.levelReq'), t('labels.bonus', { ns: 'common' })]}
      rows={rows}
      ownedPosition={fortLevel}
      onBuy={(index) => buyUpgrade('fortifications', index, forceUpdate)}
    />
  );
};

export default FortificationsTab;
