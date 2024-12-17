// components/battle-upgrade.tsx

import React, { useEffect, useState } from 'react';

import type { UnitProps, UnitSectionProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';

import { useUser } from '../context/users';
import { alertService } from '@/services';
import { Button, Flex, Group, NumberInput, Paper, Table, Text, Title } from '@mantine/core';

const BattleUpgradesSection: React.FC<UnitSectionProps> = ({
  heading,
  items,
}) => {
  const { user, forceUpdate } = useUser();
  const [getItems, setItems] = useState<UnitProps[]>(items || []);
  const [sectionEnabled, setSectionEnabled] = useState(false);
  const [itemsToEquip, setItemsToEquip] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    if (items) {
      setItems(items);
      setSectionEnabled(items.some(item => item.enabled));
      // Initialize itemsToEquip with default value 0
      const initialValues = items.reduce((acc, item) => {
        acc[item.id] = 0;
        return acc;
      }, {} as { [key: string]: number });
      setItemsToEquip(initialValues);
    }
  }, [items]);

  const handleInputChange = (unitId: string, value: number | undefined) => {
    setItemsToEquip(prev => ({
      ...prev,
      [unitId]: value ?? 0,
    }));
  };

  const handleEquip = async (operation: string) => {
    if (!getItems || getItems.length === 0) return;

    // Initialize a new variable to collect items to equip
    const itemsToEquipList = getItems.map((item) => {
      const inputElement = document.querySelector(
        `input[name="${item.id}"]`,
      ) as HTMLInputElement;
      if (!inputElement) return null; // Handle the case where the element is not found
      return {
        type: item.id?.split('_')[0] || '', // Provide a fallback value for type
        quantity: parseInt(inputElement.value, 10),
        usage: item.usage,
        level: parseInt(item.id?.split('_')[1] || '0', 10), // Provide a fallback for level
      };
    }).filter(Boolean); // Filter out null values

    // Initialize the itemsToEquip object for lookup
    const itemsToEquipObject = itemsToEquipList.reduce((acc, item) => {
      acc[`${item.type}_${item.level}`] = item.quantity;
      return acc;
    }, {} as Record<string, number>);

    if (!user) {
      // Handle the case where user is null
      alertService.error('User not found');
      return;
    }
    if (itemsToEquipList.length === 0) {
      alertService.error('Please select items to equip');
      return;
    }
    try {
      const response = await fetch('/api/battle/upgrades', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          items: itemsToEquipList,
          operation: operation,
        }),
      });

      const data = await response.json();
      if (response.ok) {
        alertService.success(data.message);
        // Update the getItems state with the new quantities
        setItems((prevItems) => {
          return prevItems.map((item) => {
            const updatedItem = data.data.find(
              (i: UnitProps) => i.type === item.id.split('_')[0],
            );
            if (updatedItem) {
              return { ...item, ownedItems: updatedItem.quantity };
            }
            return item;
          });
        });
        getItems.forEach((item) => {
          const inputElement = document.querySelector(
            `input[name="${item.id}"]`,
          );
          if (inputElement instanceof HTMLInputElement) {
            inputElement.value = '0';
          }
        });

        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to equip items. Please try again.');
      console.error(error);
    }
  };

  return (
    <Paper className="my-10 rounded-lg bg-gray-800">
      <Table striped highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-60 px-4 py-2">
              <Title order={6}>{heading}</Title>
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {getItems.map((item: UnitProps) => {
            if (item.enabled) {
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Group gap={'sm'} grow>
                      <div>
                        <Text fz="lg" fw={500} className='font-medieval'>{item.name}
                          <span className='text-xs font-medieval'>
                            {' '}(+{item.bonus} {heading})
                          </span>
                        </Text>
                        <Text fz="sm" c='#ADB5BD'>
                          +{(item.unitsCovered > 1 ? toLocale(item?.bonus / item.unitsCovered, user?.locale) : toLocale(item?.bonus || 0, user?.locale))} {item.type}/Unit
                        </Text>
                        <Text fz="sm" c='#ADB5BD'>
                          Costs: {toLocale(item.cost)} Gold
                        </Text>
                        <Text fz="sm" c='#ADB5BD'>
                          Sale Value: {toLocale(Number(item.cost.replace(/,/g, '')) * 0.75)} Gold
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td className='w-80 px-4 py-2'>
                    <Group gap={'sm'} grow>
                      <div>
                        <Text fz="sm" c='#ADB5BD'>
                          <span className='font-medieval'>Owned: </span><span id={`${item.id}_owned`}>{toLocale(item.ownedItems)}</span>
                        </Text>
                        <Text fz="sm" c='#ADB5BD'>
                          <span className='font-medieval'>Holds: {item.unitsCovered} Units</span>
                        </Text>
                        <Text fz="sm" c='#ADB5BD'>
                          <span className='font-medieval'>Min Unit Level: {item.minUnitLevel}</span>
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td className='w-40 px-4 py-2'>
                    <NumberInput
                      aria-labelledby={item.id}
                      name={`${item.type}_${item.level}`}
                      min={0}
                      className="w-full rounded-md bg-gray-900 p-2"
                      value={itemsToEquip[`${item.type}_${item.level}`] || 0}
                      onChange={(value: number | undefined) => handleInputChange(`${item.type}_${item.level}`, value)}
                      allowNegative={false}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            } else {
              return (
                <Table.Tr key={item.id}>
                  <Table.Td>
                    <Group gap={'sm'} grow>
                      <div>
                        <Text fz="lg" fw={500} className='font-medieval'>{item.name}</Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td colSpan={3}>
                    <p className="text-center">Unlocked with {item.SiegeUpgrade}</p>
                  </Table.Td>
                </Table.Tr>
              );
            }
          })}
        </Table.Tbody>
      </Table>
      <Flex justify={'space-between'} mb="xs">
        <Button
          type="button"
          size='md'
          color='brand.5'
          className={`rounded px-4 py-2 ml-2 font-bold text-white  ${!sectionEnabled ? 'cursor-not-allowed ' : ''}`}
          disabled={!sectionEnabled}
          onClick={async () => await handleEquip('buy')}
        >
          Buy
        </Button>
        <Button
          type="button"
          size='md'
          color='brand'
          className={`rounded px-4 py-2 mr-2 font-bold text-white ${!sectionEnabled ? 'cursor-not-allowed ' : ''}`}
          onClick={async () => await handleEquip('sell')}
          disabled={!sectionEnabled}
        >
          Sell
        </Button>
      </Flex>
    </Paper>
  );
};

export default BattleUpgradesSection;
