// components/newItemSection.tsx

import React, { useEffect, useMemo, useState } from 'react';

import { alertService } from '@/services';
import type { UnitProps, UnitSectionProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';

import { useUser } from '../context/users';
import { Table, Text, Group, TextInput, NumberInput, Paper, Select, Button } from '@mantine/core';

// Utility function outside the component
const getIconClass = (heading: string) => {
  const iconMap: { [key: string]: string } = {
    WEAPON: 'ra ra-sword',
    SHIELD: 'ra ra-shield',
    ARMOR: 'ra ra-armor',
    BOOTS: 'ra ra-boot-stomp',
    BRACERS: 'ra ra-bracer',
    HELM: 'ra ra-knight-helmet',
  };
  if (!heading) return 'default-icon';

  const words = heading.toUpperCase().split(' ');
  for (const word of words) {
    if (word in iconMap) return iconMap[word];
  }

  return 'default-icon';
};

const NewItemSection = ({
  heading,
  items,
  updateTotalCost,
  units
}) => {
  const { user, forceUpdate } = useUser();
  const icon = useMemo(() => getIconClass(heading), [heading]);
  const [currentItems, setCurrentItems] = useState<UnitProps[]>(items);
  const [currentUnits, setCurrentUnits] = useState(units);
  const [conversionAmount, setConversionAmount] = useState(0);
  const [fromItem, setFromItem] = useState('');
  const [toItem, setToItem] = useState('');
  const [itemCosts, setItemCosts] = useState<{ [key: string]: number }>({});
  const [conversionCost, setConversionCost] = useState(0);
  
  useEffect(() => {
    // Set initial items on component mount
    if(items)
      setCurrentItems(items);
    if(units)
    setCurrentUnits(units);
  }, [items, units]);

  const getItems = useMemo(() => {
    return (
      currentItems?.filter(
        (item) => (item?.armoryLevel ?? 0) <= (user?.armoryLevel ?? 0) + 1,
      ) || []
    );
  }, [currentItems, user]);

  useEffect(() => {
    if (items) {
      items.forEach((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);
        inputElement?.addEventListener('input', computeTotalCostForSection);
      });
    }

    return () => {
      if (items) {
        items.forEach((unit) => {
          const inputElement = document.querySelector(
            `input[name="${unit.id}"]`,
          );
          inputElement?.removeEventListener(
            'input',
            computeTotalCostForSection,
          );
        });
      }
    };
  }, [currentItems, items, updateTotalCost]);

  const handleEquip = async () => {
    if (!getItems || getItems.length === 0) return;

    const itemsToEquip = getItems
      .filter((item) => item.enabled)
      .map((item) => {
        const inputElement = document.querySelector(
          `input[name="${item.id}"]`,
        ) as HTMLInputElement;
        if (!inputElement) return null; // Handle the case where the element is not found

        return {
          type: item.id?.split('_')[1] || '', // Provide a fallback value for type
          quantity: parseInt(inputElement.value, 10),
          usage: item.usage,
          level: parseInt(item.id?.split('_')[2] || '0', 10), // Provide a fallback for level
        };
      })
      .filter(Boolean); // Filter out null values

    if (!user) {
      // Handle the case where user is null
      alertService.error('User not found');
      return;
    }
    try {
      const response = await fetch('/api/armory/equip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          items: itemsToEquip,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);
        // Update the getItems state with the new quantities
        setCurrentItems((prevItems) => {
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
        currentItems.forEach((item) => {
          // console.log(item)
          const inputElement = document.querySelector(
            `input[name="${item.id}"]`,
          );
          // console.log(inputElement)
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
      console.log(error);
    }
  };

  const handleUnequip = async () => {
    if (!getItems || getItems.length === 0) return;

    const itemsToUnequip = getItems
      .filter((item) => item.enabled)
      .map((item) => {
        const inputElement = document.querySelector(
          `input[name="${item.id}"]`,
        ) as HTMLInputElement | null;
        if (!inputElement) return null;

        return {
          type: item.id?.split('_')[1] || '', // Check for undefined and provide a fallback
          quantity: parseInt(inputElement.value, 10),
          usage: item.usage,
          level: parseInt(item.id?.split('_')[2] || '0', 10), // Check for undefined and provide a fallback
        };
      })
      .filter(Boolean); // Filter out null values

    if (!user || !user.id) {
      alertService.error('User information is not available.');
      return;
    }

    try {
      const response = await fetch('/api/armory/unequip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          items: itemsToUnequip,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message);
        // Update the getItems state with the new quantities
        setCurrentItems((prevItems) => {
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
        currentItems.forEach((item) => {
          const inputElement = document.querySelector(
            `input[name="${item.id}"]`,
          ) as HTMLInputElement | null;
          if (inputElement) inputElement.value = '0';
        });
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to unequip items. Please try again.');
    }
  };

  const formatHeading = (SecHeading: string) => {
    return SecHeading.split(' ')
      .map((word) =>
        word[0] ? word[0].toUpperCase() + word.substring(1).toLowerCase() : '',
      )
      .join(' ');
  };

  const handleInputChange = (unit, value) => {
    setItemCosts((prev) => {
      const newCosts = { ...prev, [unit]: value };
      computeTotalCostForSection(newCosts);
      return newCosts;
    });    
  };

  const computeTotalCostForSection = (updatedItemCosts: {[key: string]: number}) => {
    let sectionCost = 0;
    if (!items) return;
    items.forEach((unit) => {
      const unitCost = updatedItemCosts[unit.id] || 0;
      sectionCost += unitCost * parseInt(unit.cost);
      
    });
    updateTotalCost(heading.split(' ')[0].toUpperCase(), heading.split(' ')[1].toUpperCase(), sectionCost); // Ensure correct section
  };

  const handleConvert = async () => {
    // Implement conversion logic here
    if (!fromItem || !toItem || !conversionAmount) {
      alertService.error('Please select items and provide a valid quantity to convert.');
      return;
    }
    if (conversionCost > user?.gold) {
      alertService.error('You do not have enough gold to convert the items.');
      return;
    }
    const fromData = getItems.find((item) => item.id === fromItem);
    if (!fromData) {
      alertService.error('Invalid item selected for conversion.');
      return;
    }
    if (fromData.ownedItems < conversionAmount) {
      alertService.error('You do not have enough items to convert.');
      return;
    }

    try {
      const response = await fetch('/api/armory/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          fromItem,
          toItem,
          conversionAmount,
          locale: 'en-US', // Specify the locale as needed
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alertService.error(errorData.error);
        return;
      }

      const data = await response.json();
      console.log('Conversion successful', data);
      alertService.success('Conversion successful');
      forceUpdate();
    } catch (error) {
      console.error('Failed to convert items', error);
      alertService.error('Failed to convert items');
    }
  };


  useEffect(() => {
    if (!fromItem || !toItem) return;
    const fromItemData = getItems.find((item) => item.id === fromItem);
    const toItemData = getItems.find((item) => item.id === toItem);
    if (!fromItemData || !toItemData) return;
    const conversionCost = conversionAmount * (Number(toItemData.cost) - Number(fromItemData.cost));
    setConversionCost(conversionCost);
  }, [fromItem, toItem, conversionAmount]);

  return (
    <Paper className="my-10 rounded-lg ">
      <Table striped className="w-full table-fixed pb-2">
        <Table.Thead>
          <Table.Tr>
            <Table.Th className="w-60 px-4 py-2">
              <span className={`ra ${icon}`} />
              {` ${formatHeading(heading)}`}
            </Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {getItems.map((unit) =>
            unit.enabled ? (
              <Table.Tr key={unit.id}>
                <Table.Td className="w-80 px-4 py-2">
                  <Group gap={'sm'} grow>
                    <div>
                      <Text fz="lg" fw={500} className='font-medieval'>
                        {unit.name}
                        <span className='text-xs font-medieval'>
                          {' '}(+{unit.bonus} {unit.usage})
                        </span>
                      </Text>
                      <Text fz="sm" c='#ADB5BD'>
                        Costs: {toLocale(unit.cost)} Gold
                      </Text>
                      <Text fz="sm" c='#ADB5BD'>
                        Sale Value: {toLocale(Math.floor(parseInt(unit.cost) * .75))} 
                      </Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td className="w-80 px-4 py-2">
                  <Group>
                    <Text fz="med" fw={500}>
                      <span className='font-medieval'>Owned: </span><span id={`${unit.id}_owned`}>{toLocale(unit.ownedItems)}</span>
                    </Text>
                    <Text fz="med" fw={500}>
                      <span className='font-medieval'>Units: </span><span id={`${unit.id}_total`}>{toLocale(currentUnits)}</span>
                    </Text>
                  </Group>
                  
                </Table.Td>
                <Table.Td className="w-40 px-4 py-2">
                  <NumberInput
                    type="text"
                    aria-labelledby={unit.id}
                    name={unit.id}
                    defaultValue={0}
                    onChange={(value) => handleInputChange(unit.id, Number(value))}
                    min={0}
                    className="w-full rounded-md "
                  />
                </Table.Td>
              </Table.Tr>
            ) : (
                <Table.Tr key={unit.id}>
                  <Table.Td className="px-4 py-2">
                    <Group gap={'sm'} grow>
                      <div>
                        <Text fz="lg" fw={500} className='font-medieval'>
                          {unit.name}
                          <span className='text-xs font-medieval'>
                            {' '}(+{unit.bonus} {unit.usage})
                          </span>
                        </Text>
                        <Text fz="sm" c='#ADB5BD'>
                          Costs: -
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td colSpan='2' className="px-4 py-2">
                    <Group>
                      <Text fz="med" fw={500} className='text-center'>
                        Unlocked with {unit.fortName}
                      </Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
            ),
          )}
          <Table.Tr>
            <Table.Td colSpan="3" className="px-4 py-2">
              <Group spacing="xs" grow>
                <Text>Convert</Text>
                <NumberInput
                  value={conversionAmount}
                  onChange={(value) => setConversionAmount(value)}
                  min={0}
                  className="w-32"
                />
                <Select
                  data={getItems.filter(
                    (item) => (item?.armoryLevel ?? 0) <= (user?.armoryLevel ?? 0)).map((item) => ({ value: item.id, label: item.name }))}
                  value={fromItem}
                  onChange={(value) => setFromItem(value)}
                  placeholder="Select Item"
                  className="w-40"
                />
                <Text>to</Text>
                <Select
                  data={getItems.filter(
                    (item) => (item?.armoryLevel ?? 0) <= (user?.armoryLevel ?? 0) && item.name !== fromItem).map((item) => ({ value: item.id, label: item.name }))}
                  value={toItem}
                  onChange={(value) => setToItem(value)}
                  placeholder="Select Item"
                  className="w-40"
                />
                <span>
                  <Text>Cost: {toLocale(conversionCost)}</Text>
                </span>
                <Button onClick={handleConvert}>Convert</Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
      
    </Paper>
  );
};

export default NewItemSection;
