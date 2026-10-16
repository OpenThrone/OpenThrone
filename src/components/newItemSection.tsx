import {
  Button,
  Group,
  NumberInput,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { Dispatch, SetStateAction } from 'react';
import React from 'react';

import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import { useUser } from '@/context/users';
import type { ArmoryItem, ArmoryQuantities } from '@/utils/armoryOrder';
import { armoryOrderCost, maxArmoryQuantity } from '@/utils/armoryOrder';
import { toLocale } from '@/utils/numberFormatting';

interface NewItemSectionProps {
  heading: string;
  items: ArmoryItem[];
  allItems: ArmoryItem[];
  itemCosts: ArmoryQuantities;
  setItemCosts: Dispatch<SetStateAction<ArmoryQuantities>>;
  units: number;
  disabled?: boolean;
}

const NewItemSection = React.memo<NewItemSectionProps>(
  ({ heading, items, allItems, itemCosts, setItemCosts, units, disabled }) => {
    const { t } = useTranslation(['structures', 'common']);
    const { user } = useUser();
    const total = armoryOrderCost(items, itemCosts);
    return (
      <GameCard title={heading}>
        <StyledTable
          headers={[
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
          ]}
          ariaLabel={heading}
          tableProps={{ style: { tableLayout: 'fixed', minWidth: 680 } }}
        >
          {items.map((item) => {
            const max = maxArmoryQuantity(
              item,
              allItems,
              itemCosts,
              units,
              user?.gold ?? 0n,
            );
            return (
              <Table.Tr key={item.id}>
                <Table.Td>{item.name}</Table.Td>
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
                  <Group gap="xs" wrap="nowrap">
                    <NumberInput
                      aria-label={t('armory.itemQuantity', { item: item.name })}
                      value={itemCosts[item.id] || 0}
                      onChange={(value) =>
                        setItemCosts((prev) => ({
                          ...prev,
                          [item.id]: Number.isFinite(Number(value))
                            ? Math.max(0, Math.floor(Number(value)))
                            : 0,
                        }))
                      }
                      min={0}
                      max={Number.MAX_SAFE_INTEGER}
                      allowDecimal={false}
                      allowNegative={false}
                      disabled={disabled || (!item.enabled && !item.ownedItems)}
                      style={{ flex: 1, minWidth: 80 }}
                    />
                    <Tooltip label={t('armory.maxHint', { count: max })}>
                      <Button
                        variant="default"
                        size="sm"
                        disabled={disabled || max <= 0}
                        aria-label={t('armory.maxItem', { item: item.name })}
                        onClick={() =>
                          setItemCosts((prev) => ({
                            ...prev,
                            [item.id]: maxArmoryQuantity(
                              item,
                              allItems,
                              prev,
                              units,
                              user?.gold ?? 0n,
                            ),
                          }))
                        }
                      >
                        {t('armory.max')}
                      </Button>
                    </Tooltip>
                    <Tooltip label={t('armory.sellMaxHint')}>
                      <Button
                        variant="subtle"
                        size="sm"
                        disabled={disabled || item.ownedItems <= 0}
                        aria-label={t('armory.allOwnedItem', {
                          item: item.name,
                        })}
                        onClick={() =>
                          setItemCosts((prev) => ({
                            ...prev,
                            [item.id]: item.ownedItems,
                          }))
                        }
                      >
                        {t('armory.allOwned')}
                      </Button>
                    </Tooltip>
                  </Group>
                </Table.Td>
              </Table.Tr>
            );
          })}
        </StyledTable>
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
