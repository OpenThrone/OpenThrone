import {
  Badge,
  Button,
  Collapse,
  Group,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { Dispatch, SetStateAction } from 'react';
import React, { useId, useState } from 'react';

import QuantityInput, {
  QuantityAction,
} from '@/components/battle/QuantityInput';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { useUser } from '@/context/users';
import type {
  ArmoryItem,
  ArmoryQuantities,
  ArmoryTierCounts,
} from '@/utils/armoryOrder';
import {
  armoryOrderCost,
  armorySlotReadiness,
  armoryUpgradeHint,
  maxArmoryQuantity,
} from '@/utils/armoryOrder';
import { toLocale } from '@/utils/numberFormatting';

interface NewItemSectionProps {
  heading: string;
  items: ArmoryItem[];
  allItems: ArmoryItem[];
  itemCosts: ArmoryQuantities;
  setItemCosts: Dispatch<SetStateAction<ArmoryQuantities>>;
  /** Units held per level for this usage. */
  unitTiers: ArmoryTierCounts;
  /** Highest unit level in the game for this usage; gear above it no unit can wear. */
  maxUnitLevel: number;
  disabled?: boolean;
}

const NewItemSection = React.memo<NewItemSectionProps>(
  ({
    heading,
    items,
    allItems,
    itemCosts,
    setItemCosts,
    unitTiers,
    maxUnitLevel,
    disabled,
  }) => {
    const { t } = useTranslation(['structures', 'common']);
    const { user } = useUser();
    const [beyondOpen, setBeyondOpen] = useState(false);
    const beyondId = useId();
    const total = armoryOrderCost(items, itemCosts);
    const readiness = armorySlotReadiness(items, unitTiers);
    const hint = armoryUpgradeHint(items, unitTiers);
    const usableItems = items.filter((item) => item.level <= maxUnitLevel);
    const beyondItems = items.filter((item) => item.level > maxUnitLevel);
    const unitLevels = Object.keys(unitTiers)
      .map(Number)
      .filter((level) => (unitTiers[level] ?? 0) > 0)
      .sort((a, b) => a - b);
    const { units } = readiness;

    const readinessAction = (
      <Group gap="sm" wrap="nowrap">
        {units > 0 ? (
          <>
            <Text size="sm">
              {t('armory.slotReadiness', {
                covered: toLocale(readiness.covered, user?.locale),
                units: toLocale(units, user?.locale),
              })}
            </Text>
            <Text
              size="sm"
              fw={600}
              c={readiness.complete ? 'green' : 'yellow'}
            >
              {readiness.complete
                ? t('armory.slotComplete')
                : t('armory.slotShortBy', {
                    missing: toLocale(readiness.missing, user?.locale),
                  })}
            </Text>
          </>
        ) : (
          <Text size="sm" c="dimmed">
            {t('armory.noUnitsToEquip')}
          </Text>
        )}
      </Group>
    );

    const renderRow = (item: ArmoryItem) => {
      const max = maxArmoryQuantity(
        item,
        allItems,
        itemCosts,
        unitTiers,
        user?.gold ?? 0n,
      );
      const fits = hint?.tier === item.level ? hint.fits : 0;
      return (
        <Table.Tr key={item.id}>
          <Table.Td>
            <Stack gap={2}>
              <Text size="sm">{item.name}</Text>
              <Group gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {t('armory.tierLabel', { tier: item.level })}
                </Text>
                {fits > 0 && (
                  <Badge variant="light" color="yellow" size="sm" radius="sm">
                    {t('armory.fitsUnits', {
                      units: toLocale(fits, user?.locale),
                    })}
                  </Badge>
                )}
              </Group>
            </Stack>
          </Table.Td>
          <Table.Td>
            <Stack gap={2}>
              <Text size="sm">
                +{item.bonus} {t(`armory.${item.usage.toLowerCase()}`)}
              </Text>
              <Text size="xs" c="dimmed">
                {t('armory.cost')}: {toLocale(item.cost, user?.locale)}
              </Text>
            </Stack>
          </Table.Td>
          <Table.Td>{toLocale(item.ownedItems, user?.locale)}</Table.Td>
          <Table.Td>
            <QuantityInput
              label={t('armory.itemQuantity', { item: item.name })}
              hideLabel
              grow
              value={itemCosts[item.id] || 0}
              onChange={(value) =>
                setItemCosts((prev) => ({ ...prev, [item.id]: value }))
              }
              max={Number.MAX_SAFE_INTEGER}
              disabled={disabled || (!item.enabled && !item.ownedItems)}
              onMax={() =>
                setItemCosts((prev) => ({
                  ...prev,
                  [item.id]: maxArmoryQuantity(
                    item,
                    allItems,
                    prev,
                    unitTiers,
                    user?.gold ?? 0n,
                  ),
                }))
              }
              maxAriaLabel={t('armory.maxItem', { item: item.name })}
              maxTooltip={t('armory.maxHint', { count: max })}
              maxDisabled={disabled || max <= 0}
              actions={
                <QuantityAction
                  variant="subtle"
                  ariaLabel={t('armory.allOwnedItem', {
                    item: item.name,
                  })}
                  tooltip={t('armory.sellMaxHint')}
                  disabled={disabled || item.ownedItems <= 0}
                  onClick={() =>
                    setItemCosts((prev) => ({
                      ...prev,
                      [item.id]: item.ownedItems,
                    }))
                  }
                >
                  {t('armory.allOwned')}
                </QuantityAction>
              }
            />
          </Table.Td>
        </Table.Tr>
      );
    };

    const headers = [
      <Table.Th key="item" w="18%">
        {t('armory.item')}
      </Table.Th>,
      <Table.Th key="details" w="24%">
        {t('armory.details')}
      </Table.Th>,
      <Table.Th key="owned" w="12%">
        {t('labels.owned', { ns: 'common' })}
      </Table.Th>,
      <Table.Th key="quantity" w="46%">
        {t('armory.quantity')}
      </Table.Th>,
    ];

    return (
      <GameCard title={heading} action={readinessAction}>
        {units > 0 && (
          <Group justify="space-between" align="center" gap="sm" mb="sm">
            <Group gap="md" wrap="wrap">
              {unitLevels.map((level) => (
                <Text key={level} size="sm" c="dimmed">
                  {t('armory.tierCoverage', {
                    tier: level,
                    covered: toLocale(
                      readiness.coveredByTier[level] ?? 0,
                      user?.locale,
                    ),
                    units: toLocale(unitTiers[level] ?? 0, user?.locale),
                  })}
                </Text>
              ))}
            </Group>
          </Group>
        )}
        {usableItems.length > 0 && (
          <StyledTable
            headers={headers}
            ariaLabel={heading}
            minWidth={600}
            tableProps={{ style: { tableLayout: 'fixed' } }}
          >
            {usableItems.map(renderRow)}
          </StyledTable>
        )}
        {beyondItems.length > 0 && (
          <Stack gap="xs" mt="md">
            <Button
              variant="subtle"
              size="xs"
              justify="flex-start"
              aria-expanded={beyondOpen}
              aria-controls={beyondId}
              onClick={() => setBeyondOpen((open) => !open)}
            >
              {t(beyondOpen ? 'armory.hideBeyond' : 'armory.showBeyond', {
                count: beyondItems.length,
              })}
            </Button>
            <Collapse in={beyondOpen} transitionDuration={0} id={beyondId}>
              <Stack gap="sm">
                <Text size="xs" c="dimmed">
                  {t('armory.beyondUnitsHint')}
                </Text>
                <StyledTable
                  headers={headers}
                  ariaLabel={t('armory.beyondUnitsLabel', { heading })}
                  minWidth={600}
                  tableProps={{ style: { tableLayout: 'fixed' } }}
                >
                  {beyondItems.map(renderRow)}
                </StyledTable>
              </Stack>
            </Collapse>
          </Stack>
        )}
        {items.some((item) => (itemCosts[item.id] || 0) > 0) && (
          <Text mt="md" size="sm">
            {t('armory.totalCost')}: {toLocale(total, user?.locale)}
          </Text>
        )}
      </GameCard>
    );
  },
);
NewItemSection.displayName = 'NewItemSection';
export default NewItemSection;
