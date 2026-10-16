import { Group, NumberInput, Stack, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';

import {
  type EraStartSettings,
  eraStartSettingsSchema,
} from '@/utils/eraStartSettings';

export interface EraStartSettingsDraft {
  gold: string;
  citizens: number | string;
  attackTurns: number | string;
}

export const toDraft = (settings: EraStartSettings): EraStartSettingsDraft => ({
  gold: settings.gold,
  citizens: settings.citizens,
  attackTurns: settings.attackTurns,
});

/** Validated settings, or null while a field is blank or out of range. */
export const parseDraft = (
  draft: EraStartSettingsDraft,
): EraStartSettings | null => {
  const result = eraStartSettingsSchema.safeParse({
    gold: String(draft.gold),
    citizens: Number(draft.citizens),
    attackTurns: Number(draft.attackTurns),
  });
  return result.success && draft.citizens !== '' && draft.attackTurns !== ''
    ? result.data
    : null;
};

interface Props {
  value: EraStartSettingsDraft;
  onChange: (value: EraStartSettingsDraft) => void;
  disabled?: boolean;
}

/** The starting values every account is reset to; saved to the era on reset. */
const EraStartSettingsFields = ({ value, onChange, disabled }: Props) => {
  const { t } = useTranslation('admin-game');
  return (
    <Stack gap="xs">
      <Text size="sm" fw={600}>
        {t('eraReset.startSettingsTitle')}
      </Text>
      <NumberInput
        label={t('eraReset.startGold')}
        value={value.gold}
        onChange={(gold) => onChange({ ...value, gold: String(gold ?? '') })}
        min={0}
        max={1_000_000_000_000}
        allowNegative={false}
        allowDecimal={false}
        thousandSeparator=","
        disabled={disabled}
      />
      <Group grow align="flex-start">
        <NumberInput
          label={t('eraReset.startCitizens')}
          value={value.citizens}
          onChange={(citizens) => onChange({ ...value, citizens })}
          min={0}
          max={10_000_000}
          allowNegative={false}
          allowDecimal={false}
          disabled={disabled}
        />
        <NumberInput
          label={t('eraReset.startAttackTurns')}
          value={value.attackTurns}
          onChange={(attackTurns) => onChange({ ...value, attackTurns })}
          min={0}
          max={10_000}
          allowNegative={false}
          allowDecimal={false}
          disabled={disabled}
        />
      </Group>
    </Stack>
  );
};

export default EraStartSettingsFields;
