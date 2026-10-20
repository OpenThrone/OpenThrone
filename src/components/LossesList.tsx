import { Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import { useMemo } from 'react';

import type { BattleUnits } from '@/types/typings';
import { toLocale } from '@/utils/numberFormatting';

const EMPTY_UNITS: BattleUnits[] = [];

type LossesInput = string | { total?: number; units?: BattleUnits[] };

interface LossesListProps {
  losses: LossesInput;
  /** Render the per-unit breakdown under the total when it is available. */
  showUnits?: boolean;
  align?: 'center' | 'flex-start';
}

const parseLosses = (losses: LossesInput) => {
  try {
    return typeof losses === 'string' ? JSON.parse(losses) : losses;
  } catch {
    return null;
  }
};

const fallbackUnitLabel = (type: string) =>
  type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();

/** Casualty total with the units behind it listed inline (no hover needed). */
const LossesList: React.FC<LossesListProps> = ({
  losses,
  showUnits = true,
  align = 'center',
}) => {
  const { t } = useTranslation('battle');
  const parsed = useMemo(() => parseLosses(losses), [losses]);
  const total = Number(parsed?.total) || 0;
  const units: BattleUnits[] = parsed?.units ?? EMPTY_UNITS;

  const consolidatedUnits = useMemo(() => {
    const byKey = units.reduce(
      (acc, unit) => {
        const key = `${unit.level}-${unit.type}`;
        if (acc[key]) {
          acc[key].quantity += unit.quantity;
        } else {
          acc[key] = { ...unit };
        }
        return acc;
      },
      {} as Record<string, BattleUnits>,
    );
    return Object.entries(byKey);
  }, [units]);

  const totalLabel = (
    <span>{t('losses.units', { count: total, total: toLocale(total) })}</span>
  );

  // The opposing side's breakdown is redacted; show the total only.
  if (!showUnits || !total || consolidatedUnits.length === 0) {
    return totalLabel;
  }

  return (
    <Stack gap={2} align={align} component="span">
      {totalLabel}
      {consolidatedUnits.map(([key, unit]) => (
        <Text key={key} component="span" size="xs" fw={400} c="dimmed">
          {t('losses.unitLine', {
            quantity: toLocale(unit.quantity),
            level: unit.level,
            unit: t(`unitTypes.${unit.type}`, {
              defaultValue: fallbackUnitLabel(unit.type),
            }),
          })}
        </Text>
      ))}
    </Stack>
  );
};

export default LossesList;
