// components/battle-upgrade.tsx

import React, { useEffect, useState } from 'react';

import type { UnitProps, UnitSectionProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';

import { useUser } from '../context/users';
import { alertService } from '@/services';
import { Button, Flex, Group, NumberInput, Paper, Table, Text, Title } from '@mantine/core';
import { logError } from '@/utils/logger';
import ContentCard from './ContentCard';

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
      // Only update owned items, keep local inputs for #282
      setItems(prevItems => {
        return items.map(newItem => {
          const oldItem = prevItems.find(o => o.id === newItem.id);
          return oldItem
            ? { ...oldItem, ownedItems: newItem.ownedItems, enabled: newItem.enabled }
            : newItem;
        });
      });
  
      // Only set initial input to 0 if we haven't typed anything before
      setItemsToEquip(prev => {
        const updated = { ...prev };
        for (const newItem of items) {
          if (!(newItem.id in updated)) {
            updated[newItem.id] = 0;
          }
        }
        return updated;
      });
      setSectionEnabled(items.some(item => item.enabled));
      
    }
  }, [items]);

  const getSectionTotalCost = () => {
    return getItems.reduce((total, item) => {
      if (!item.enabled) return total;
      const qty = itemsToEquip[`${item.type}_${item.level}`] || 0;
      // item.cost may be a string with commas, so remove them
      const cost = Number(String(item.cost).replace(/,/g, ''));
      return total + qty * cost;
    }, 0);
  };

  const handleInputChange = (unitId, value) => {
    // Attempt to convert the value to an integer to handle something delitin the input
    const intValue = parseInt(value, 10);
    if (!isNaN(intValue) || typeof value === 'string') {
      setItemsToEquip(prev => ({
        ...prev,
        [unitId]: !isNaN(intValue)? intValue : 0,
      }));
    } else {
      logError("Invalid input:", value, "for", unitId);
    }
  };

  const handleEquip = async (operation: string) => {
    if (!getItems || getItems.length === 0) return;

    // Use itemsToEquip state instead of DOM
    const itemsToEquipList = getItems.map((item) => {
      const qty = itemsToEquip[`${item.type}_${item.level}`] || 0;
      return {
        type: item.type,
        quantity: qty,
        usage: item.usage,
        level: item.level,
      };
    }).filter((item) => item.quantity > 0);

    if (!user) {
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
        // Reset all NumberInputs for this section
        setItemsToEquip((prev) => {
          const reset = { ...prev };
          getItems.forEach((item) => {
            if (item.enabled) {
              reset[`${item.type}_${item.level}`] = 0;
            }
          });
          return reset;
        });
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to equip items. Please try again.');
      logError(error);
    }
  };

  const footer = (<Flex justify={'space-between'} mb="xs">
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
  </Flex>);

  return (
    <ContentCard
      title={heading}
      titleSize='lg'
      className='mb-4'
      footer={footer}
    >
      <Flex justify="end" align="center" mb="xs">
        <Text fz="md" fw={500}>
          Total Cost: {toLocale(getSectionTotalCost(), user?.locale)} Gold
        </Text>
      </Flex>
      <Table striped highlightOnHover>
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
    </ContentCard>
  );
};

export default BattleUpgradesSection;
