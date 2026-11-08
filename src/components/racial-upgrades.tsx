import { Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import { UpgradeLedger } from '@/components/game/UpgradeLedger';
import {
  disciplineMoraleFloor,
  necropolisBonus,
  RACIAL_PERK_TIERS,
  racialFortRequirement,
  raidersCapturePercent,
} from '@/constants/RacialPerks';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import { fortificationName } from '@/utils/structureNames';

export function RacialUpgrades({
  tier,
  fortLevel,
  race,
  forceUpdate,
}: {
  tier: number;
  fortLevel: number;
  race: string;
  forceUpdate: () => void;
}) {
  const { t } = useTranslation('structures');
  const percent = (value: number) => `${Math.round(value * 1000) / 10}%`;
  if (!['ELF', 'HUMAN', 'GOBLIN', 'UNDEAD'].includes(race))
    return <Text>{t('upgrades.racialUnavailable')}</Text>;
  return (
    <UpgradeLedger
      columns={[
        t('upgrades.fortReq'),
        ...(race !== 'UNDEAD' ? [t('upgrades.hallowed')] : []),
        ...(race === 'ELF'
          ? [t('upgrades.sanctuary'), t('upgrades.sanctuaryCap')]
          : []),
        ...(race === 'HUMAN'
          ? [t('upgrades.disciplineDesertion'), t('upgrades.disciplineFloor')]
          : []),
        ...(race === 'GOBLIN'
          ? [
              t('upgrades.raidersCapture'),
              t('upgrades.raidersCapacity'),
              t('upgrades.raidersRansom'),
            ]
          : []),
        ...(race === 'UNDEAD'
          ? [t('upgrades.necropolisBonus'), t('upgrades.necropolisCap')]
          : []),
      ]}
      rows={RACIAL_PERK_TIERS.map((item, index) => ({
        key: String(index),
        name: `${t(`upgrades.perk${race}`)} ${['I', 'II', 'III', 'IV'][index]}`,
        position: index + 1,
        purchaseIndex: index,
        cells: [
          fortificationName(t, racialFortRequirement(race, index + 1)),
          ...(race !== 'UNDEAD' ? [percent(item.blocked)] : []),
          ...(race === 'ELF'
            ? [percent(item.recovered), percent(item.cap)]
            : []),
          ...(race === 'HUMAN'
            ? [
                percent([0.25, 0.4, 0.55, 0.7][index]),
                `+${disciplineMoraleFloor(index + 1)}`,
              ]
            : []),
          ...(race === 'GOBLIN'
            ? [
                percent(raidersCapturePercent(index + 1)),
                `+${percent((index + 1) * 0.25)}`,
                percent(0.5 + (index + 1) * 0.05),
              ]
            : []),
          ...(race === 'UNDEAD'
            ? [
                `+${percent(necropolisBonus(index + 1))}`,
                percent(0.02 + (index + 1) * 0.005),
              ]
            : []),
        ],
        cost: item.cost,
        requirement: {
          type: 'fort' as const,
          value: racialFortRequirement(race, index + 1),
          met: fortLevel >= racialFortRequirement(race, index + 1),
        },
      }))}
      ownedPosition={tier}
      onBuy={(index) => buyUpgrade('racial', index, forceUpdate)}
    />
  );
}
