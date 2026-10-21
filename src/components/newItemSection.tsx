import { Stack, Table, Text } from '@mantine/core';
import { useTranslation } from 'next-i18next';
import type { Dispatch, SetStateAction } from 'react';
import React from 'react';

import QuantityInput, {
  QuantityAction,
} from '@/components/battle/QuantityInput';
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
          minWidth={600}
          tableProps={{ style: { tableLayout: 'fixed' } }}
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
                          units,
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
