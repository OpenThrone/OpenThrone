import { Button, Group, NumberInput, Table, Text } from '@mantine/core';
import React, { useCallback, useEffect, useState } from 'react';

import { alertService } from '@/services/Alert.service';
import type { UnitProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';

import { useUser } from '../context/users';
import { GameCard } from './game/GameCard';
import { StyledTable } from './game/StyledTable';

const NewItemSection: React.FC<any> = React.memo(
  ({ heading, items, itemCosts, setItemCosts, units }) => {
    const { user, forceUpdate } = useUser();
    const [currentItems, setCurrentItems] = useState<UnitProps[]>(items);

    useEffect(() => {
      if (items) setCurrentItems(items);
    }, [items]);

    const handleInputChange = useCallback(
      (unitId: string, value: number | string | undefined) => {
        const numericValue =
          value === undefined || value === '' || isNaN(Number(value))
            ? 0
            : Math.max(0, Number(value));
        setItemCosts((prev) => ({ ...prev, [unitId]: numericValue }));
      },
      [setItemCosts],
    );

    const handleEquip = async (operation: 'buy' | 'sell') => {
      const itemsToProcess = currentItems
        .filter((item) => item.enabled && (itemCosts[item.id] || 0) > 0)
        .map((item) => ({
          ...item,
          quantity:
            operation === 'sell'
              ? Math.min(itemCosts[item.id], item.ownedItems || 0)
              : itemCosts[item.id],
        }))
        .filter((item) => item.quantity > 0);

      if (itemsToProcess.length === 0) {
        alertService.info(`No items to ${operation}.`);
        return;
      }

      try {
        const response = await fetch(
          `/api/armory/${operation === 'buy' ? 'equip' : 'unequip'}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.id, items: itemsToProcess }),
          },
        );
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        alertService.success(data.message);
        setItemCosts({});
        forceUpdate();
      } catch (error) {
        alertService.error((error as Error).message);
      }
    };

    return (
      <GameCard title={heading}>
        <StyledTable headers={['Item', 'Details', 'Owned', 'Quantity']}>
          {currentItems.map((unit) => (
            <Table.Tr key={unit.id}>
              <Table.Td>{unit.name}</Table.Td>
              <Table.Td>
                +{unit.bonus} {unit.usage}
              </Table.Td>
              <Table.Td>{toLocale(unit.ownedItems, user?.locale)}</Table.Td>
              <Table.Td>
                <NumberInput
                  value={itemCosts[unit.id] || 0}
                  onChange={(value) => handleInputChange(unit.id, value)}
                  min={0}
                  disabled={!unit.enabled}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </StyledTable>
        <Group justify="space-between" mt="md">
          <Text>
            Total Cost:{' '}
            {toLocale(
              Object.entries(itemCosts).reduce((acc, [id, qty]) => {
                const item = currentItems.find((i) => i.id === id);
                return acc + (item ? Number(qty) * Number(item.cost) : 0);
              }, 0),
              user?.locale,
            )}
          </Text>
          <Group>
            <Button onClick={() => handleEquip('buy')}>Buy</Button>
            <Button onClick={() => handleEquip('sell')} color="red">
              Sell
            </Button>
          </Group>
        </Group>
      </GameCard>
    );
  },
);

NewItemSection.displayName = 'NewItemSection';
export default NewItemSection;
