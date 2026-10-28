import {
  Button,
  Checkbox,
  Collapse,
  Group,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { Dispatch, SetStateAction } from 'react';
import { useId, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import type { Locales } from '@/types/typings';
import type {
  ArmoryItem,
  ArmoryQuantities,
  ArmoryTierCounts,
  ArmoryUpgradeConversion,
} from '@/utils/armoryOrder';
import {
  armoryCategoryKeys,
  armorySlotReadiness,
  ownedSlotCoverage,
  planArmoryLoadout,
  planArmoryUpgrades,
} from '@/utils/armoryOrder';
import { toLocale } from '@/utils/numberFormatting';

interface ArmoryLoadoutPlannerProps {
  categories: Record<string, ArmoryItem[]>;
  allItems: ArmoryItem[];
  quantities: ArmoryQuantities;
  setQuantities: Dispatch<SetStateAction<ArmoryQuantities>>;
  onUpgrade: (conversions: ArmoryUpgradeConversion[]) => Promise<void>;
  upgrading?: boolean;
  units: number;
  unitTiers: ArmoryTierCounts;
  gold: bigint;
  locale?: Locales;
  disabled?: boolean;
}

export const ArmoryLoadoutPlanner = ({
  categories,
  allItems,
  quantities,
  setQuantities,
  onUpgrade,
  upgrading,
  units,
  unitTiers,
  gold,
  locale,
  disabled,
}: ArmoryLoadoutPlannerProps) => {
  const { t } = useTranslation('structures');
  const [opened, setOpened] = useState(false);
  const [mode, setMode] = useState<'fill' | 'upgrade'>('fill');
  const plannerId = useId();
  const [choices, setChoices] = useState<Record<string, string | null>>({});
  const slots = Object.entries(categories)
    .map(([category, items]) => ({
      category,
      items: items.filter(
        (item) =>
          item.enabled &&
          (mode === 'fill' ||
            items.some(
              (source) => source.level < item.level && source.ownedItems > 0,
            )),
      ),
    }))
    .filter((slot) => slot.items.length > 0);
  const defaultItem = (items: ArmoryItem[]) =>
    [...items].sort((a, b) =>
      mode === 'fill' ? a.cost - b.cost : b.level - a.level || a.cost - b.cost,
    )[0]?.id;
  const choiceFor = (category: string, items: ArmoryItem[]) => {
    const choice = choices[`${mode}_${category}`];
    if (choice === null) return null;
    return items.some((item) => item.id === choice)
      ? choice
      : defaultItem(items);
  };
  const selected = slots.flatMap(({ category, items }) => {
    const choice = items.find((item) => item.id === choiceFor(category, items));
    return choice ? [choice] : [];
  });
  const plan = planArmoryLoadout(
    selected,
    allItems,
    quantities,
    unitTiers,
    gold,
  );
  const upgradePlan = planArmoryUpgrades(
    selected,
    allItems,
    quantities,
    units,
    gold,
  );
  if (!Object.values(categories).some((items) => items.length > 0)) return null;
  return (
    <GameCard
      title={t('armory.loadoutTitle')}
      action={
        <Button
          variant="default"
          size="sm"
          disabled={disabled}
          aria-expanded={opened}
          aria-controls={plannerId}
          onClick={() => setOpened((value) => !value)}
        >
          {t(opened ? 'armory.closePlanner' : 'armory.openPlanner')}
        </Button>
      }
    >
      <Text size="sm" c="dimmed">
        {t('armory.loadoutIntro')}
      </Text>
      <Collapse in={opened} transitionDuration={0} id={plannerId}>
        <Stack gap="md" mt="md">
          <SegmentedControl
            value={mode}
            disabled={disabled}
            fullWidth
            aria-label={t('armory.plannerMode')}
            data={[
              { value: 'fill', label: t('armory.fillMode') },
              { value: 'upgrade', label: t('armory.upgradeMode') },
            ]}
            onChange={(value) => setMode(value as 'fill' | 'upgrade')}
          />
          <Text size="sm" c="dimmed">
            {t(mode === 'fill' ? 'armory.loadoutHint' : 'armory.upgradeHint')}
          </Text>
          {slots.length === 0 && (
            <Text size="sm">{t('armory.noUpgrades')}</Text>
          )}
          <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
            {slots.map(({ category, items }) => {
              const choice = choiceFor(category, items);
              const target = items.find((item) => item.id === choice);
              const label = t(`armory.${armoryCategoryKeys[category]}`);
              const conversions = upgradePlan.conversions.filter(
                (conversion) => conversion.toItem === choice,
              );
              return (
                <Stack gap="xs" key={category}>
                  <Checkbox
                    label={label}
                    checked={Boolean(choice)}
                    disabled={disabled}
                    onChange={(event) => {
                      const { checked } = event.currentTarget;
                      setChoices((prev) => ({
                        ...prev,
                        [`${mode}_${category}`]: checked
                          ? defaultItem(items)
                          : null,
                      }));
                    }}
                  />
                  <Select
                    aria-label={t('armory.slotGear', { slot: label })}
                    value={choice ?? null}
                    disabled={disabled || !choice}
                    allowDeselect={false}
                    data={items.map((item) => ({
                      value: item.id,
                      label: `${item.name} · ${toLocale(item.cost, locale)}`,
                    }))}
                    onChange={(value) =>
                      setChoices((prev) => ({
                        ...prev,
                        [`${mode}_${category}`]: value,
                      }))
                    }
                  />
                  <Text size="xs" c="dimmed">
                    {mode === 'fill'
                      ? t('armory.slotPreview', {
                          owned: toLocale(
                            armorySlotReadiness(
                              categories[category] ?? items,
                              unitTiers,
                            ).covered,
                            locale,
                          ),
                          quantity: toLocale(
                            choice ? (plan.quantities[choice] ?? 0) : 0,
                            locale,
                          ),
                        })
                      : t('armory.upgradeSlotPreview', {
                          owned: toLocale(
                            target
                              ? ownedSlotCoverage(
                                  target,
                                  allItems.filter(
                                    (item) => item.level >= target.level,
                                  ),
                                )
                              : 0,
                            locale,
                          ),
                          quantity: toLocale(
                            conversions.reduce(
                              (sum, conversion) =>
                                sum + conversion.conversionAmount,
                              0,
                            ),
                            locale,
                          ),
                        })}
                  </Text>
                  {mode === 'upgrade' &&
                    conversions.map((conversion) => (
                      <Text size="xs" key={conversion.fromItem}>
                        {t('armory.conversionPreview', {
                          quantity: toLocale(
                            conversion.conversionAmount,
                            locale,
                          ),
                          from: conversion.fromName,
                          to: conversion.toName,
                          cost: toLocale(conversion.cost, locale),
                        })}
                      </Text>
                    ))}
                </Stack>
              );
            })}
          </SimpleGrid>
          {slots.length > 0 && (
            <Group justify="space-between" align="center">
              <Stack gap={2}>
                <Text size="sm" role="status">
                  {mode === 'fill'
                    ? t('armory.loadoutPreview', {
                        count: plan.coverage,
                        units: toLocale(units, locale),
                        cost: toLocale(plan.cost, locale),
                      })
                    : t('armory.upgradePreview', {
                        count: upgradePlan.count,
                        cost: toLocale(upgradePlan.cost, locale),
                      })}
                </Text>
                {mode === 'upgrade' && upgradePlan.refund > 0 && (
                  <Text size="xs">
                    {t('armory.upgradeRefund', {
                      refund: toLocale(upgradePlan.refund, locale),
                    })}
                  </Text>
                )}
              </Stack>
              {mode === 'fill' ? (
                <Button
                  disabled={
                    disabled ||
                    !selected.some((item) => plan.quantities[item.id] > 0)
                  }
                  onClick={() =>
                    setQuantities(
                      (prev) =>
                        planArmoryLoadout(
                          selected,
                          allItems,
                          prev,
                          unitTiers,
                          gold,
                        ).quantities,
                    )
                  }
                >
                  {t('armory.prepareLoadout')}
                </Button>
              ) : (
                <Button
                  loading={upgrading}
                  disabled={disabled || upgradePlan.count === 0}
                  onClick={() => onUpgrade(upgradePlan.conversions)}
                >
                  {t('armory.upgradeAction')}
                </Button>
              )}
            </Group>
          )}
          <Text size="xs" c="dimmed">
            {t(
              mode === 'fill' ? 'armory.loadoutReview' : 'armory.upgradeReview',
            )}
          </Text>
        </Stack>
      </Collapse>
    </GameCard>
  );
};
