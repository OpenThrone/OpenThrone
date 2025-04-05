import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { alertService } from '@/services';
import type { UnitProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';
import { useUser } from '../context/users';
import { Table, Text, Group, NumberInput, Select, Button, Flex, Stack } from '@mantine/core';
import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import RpgAwesomeIcon from './RpgAwesomeIcon';
import { logError } from '@/utils/logger';
import ContentCard from './ContentCard';

const getIconClass = (heading: string) => {
  const iconMap: { [key: string]: string } = {
    WEAPON: 'sword',
    SHIELD: 'shield',
    ARMOR: 'spiked-shoulder-armor',
    BOOTS: 'boot-stomp',
    BRACERS: 'bracer',
    HELM: 'knight-helmet',
  };
  if (!heading) return 'default-icon';

  const words = heading.toUpperCase().split(' ');
  for (const word of words) {
    if (word in iconMap) return iconMap[word];
  }

  return 'default-icon';
};

// Use React.memo to prevent unnecessary re-renders
const NewItemSection = React.memo(({
  heading,
  items,
  itemCosts,
  setItemCosts,
  units
}) => {
  const { user, forceUpdate } = useUser();
  const icon = useMemo(() => getIconClass(heading), [heading]);
  const [currentItems, setCurrentItems] = useState<UnitProps[]>(items);
  const [currentUnitCount, setCurrentUnitCount] = useState(units);
  const [conversionAmount, setConversionAmount] = useState(0);
  const [fromItem, setFromItem] = useState<string | null>(null);
  const [toItem, setToItem] = useState<string | null>(null);
  const [conversionCost, setConversionCost] = useState(0);
  const [toLower, setToLower] = useState(false);
  const [highestUnlockedLevel, setHighestUnlockedLevel] = useState(0);
  const [collapsedItems, setCollapsedItems] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    if (items) setCurrentItems(items);
    if (units !== undefined) setCurrentUnitCount(units);

    const initialCollapsedState: { [key: string]: boolean } = {};
    let maxLevel = 0;
    (items || []).forEach((item) => {
      const itemLevel = item.armoryLevel ?? 0;
      if (item.enabled && itemLevel > maxLevel) {
        maxLevel = itemLevel;
      }
      if (!item.enabled) {
        initialCollapsedState[item.id] = true;
      } else {
        initialCollapsedState[item.id] = false;
      }
    });
    setHighestUnlockedLevel(maxLevel);

    (items || []).forEach((item) => {
      if (item.enabled) {
        const itemLevel = item.armoryLevel ?? 0;
        const userOwnsItem = (item.ownedItems || 0) > 0;
        if (itemLevel < maxLevel && !userOwnsItem) {
          initialCollapsedState[item.id] = true;
        }
      }
    });
    setCollapsedItems(initialCollapsedState);
  }, [items, units]);

  const sectionTotalCost = useMemo(() => {
    let cost = 0;
    if (!items) return 0;
    items.forEach((unit) => {
      const quantity = itemCosts[unit.id] || 0;
      const unitCostValue = Number(String(unit.cost).replace(/,/g, '')) || 0;
      cost += quantity * unitCostValue;
    });
    return cost;
  }, [items, itemCosts]);

  const getItems = useMemo(() => {
    return (
      currentItems?.filter(
        (item) => (item?.armoryLevel ?? 0) <= (user?.armoryLevel ?? 0) + 1,
      ) || []
    );
  }, [currentItems, user?.armoryLevel]);

  const handleInputChange = useCallback((unitId: string, value: number | string | undefined) => {
    const numericValue = value === undefined || value === '' || isNaN(Number(value)) ? 0 : Math.max(0, Number(value));
    setItemCosts(prev => ({
      ...prev,
      [unitId]: numericValue,
    }));
  }, [setItemCosts]);

  const handleEquip = async () => {
    if (!getItems || getItems.length === 0) return;

    const itemsToEquipList = getItems
      .filter((item) => item.enabled)
      .map((item) => {
        const quantity = itemCosts[item.id] || 0;
        if (quantity <= 0) return null;

        return {
          type: item.type,
          quantity: quantity,
          usage: item.usage,
          level: item.level,
        };
      })
      .filter((item): item is { type: string; quantity: number; usage: string; level: number } => item !== null);

    if (itemsToEquipList.length === 0) {
      alertService.error('No items selected to buy.');
      return;
    }

    if (!user) {
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
          items: itemsToEquipList,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message || 'Items bought successfully!');
        setItemCosts({});
        forceUpdate();
      } else {
        alertService.error(data.error || 'Failed to buy items.');
      }
    } catch (error) {
      alertService.error('Failed to buy items. Please try again.');
      logError(error);
    }
  };

  const handleUnequip = async () => {
    if (!getItems || getItems.length === 0) return;

    const itemsToUnequipList = getItems
      .filter(item => item.enabled)
      .map(item => {
        const quantity = itemCosts[item.id] || 0;
        if (quantity <= 0) return null;

        const sellQuantity = Math.min(quantity, item.ownedItems || 0);
        if (sellQuantity <= 0) return null;

        return {
          type: item.type,
          quantity: sellQuantity,
          usage: item.usage,
          level: item.level,
        };
      })
      .filter((item): item is { type: string; quantity: number; usage: string; level: number } => item !== null);


    if (itemsToUnequipList.length === 0) {
      alertService.warn('No items selected or available to sell.');
      return;
    }

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
          items: itemsToUnequipList,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alertService.success(data.message || 'Items sold successfully!');
        setItemCosts({});
        forceUpdate();
      } else {
        alertService.error(data.error || 'Failed to sell items.');
      }
    } catch (error) {
      alertService.error('Failed to sell items. Please try again.');
      logError(error);
    }
  };

  const handleConvert = async () => {
    if (!fromItem || !toItem || !conversionAmount) {
      alertService.error('Please select items and provide a valid quantity to convert.', false, false, '', 5000);
      return;
    }
    if (!toLower && conversionCost > (user?.gold ? Number(user.gold) : 0)) {
      alertService.error('You do not have enough gold to convert these items.');
      return;
    }

    const fromData = getItems.find((item) => item.id === fromItem);
    if (!fromData) {
      alertService.error('Invalid "from" item selected for conversion.');
      return;
    }
    if ((fromData.ownedItems || 0) < conversionAmount) {
      alertService.error('You do not have enough of the "from" item to convert.');
      return;
    }

    try {
      const response = await fetch('/api/armory/convert', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user?.id,
          fromItem,
          toItem,
          conversionAmount,
          locale: user?.locale || 'en-US',
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        alertService.error(errorData.error || 'Conversion failed.');
        return;
      }

      const data = await response.json();
      alertService.success('Conversion successful');
      setConversionAmount(0);
      setFromItem(null);
      setToItem(null);
      forceUpdate();
    } catch (error) {
      logError('Failed to convert items', error);
      alertService.error('Failed to convert items');
    }
  };

  useEffect(() => {
    if (!fromItem || !toItem) { setConversionCost(0); return; };
    const fromItemData = getItems.find((item) => item.id === fromItem);
    const toItemData = getItems.find((item) => item.id === toItem);
    if (!fromItemData || !toItemData) { setConversionCost(0); return; }
    const fromCostNum = Number(String(fromItemData.cost).replace(/,/g, '')) || 0;
    const toCostNum = Number(String(toItemData.cost).replace(/,/g, '')) || 0;
    const isLower = fromItemData.level > toItemData.level;
    setToLower(isLower);
    const costDifference = toCostNum - fromCostNum;
    const multiplier = isLower ? 0.75 : 1.0;
    let calculatedCost = conversionAmount * costDifference * multiplier;
    if (isLower) calculatedCost = Math.abs(calculatedCost);
    setConversionCost(calculatedCost);
  }, [fromItem, toItem, conversionAmount, getItems, toLower]);

  const toggleCollapse = (itemId: string) => {
    setCollapsedItems((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  const formatHeading = (SecHeading: string) => {
    return SecHeading.split(' ')
      .map((word) =>
        word[0] ? word[0].toUpperCase() + word.substring(1).toLowerCase() : '',
      )
      .join(' ');
  };

  const footerContent = (
    <Flex justify='space-between' align="center">
      <Stack gap="xs">
        <Text size='sm'>Total Cost: {toLocale(sectionTotalCost, user?.locale)}</Text>
        <Text size='sm' c="dimmed">Refund: {toLocale(Math.floor(sectionTotalCost * 0.75), user?.locale)}</Text>
      </Stack>
      <Group gap="sm">
        <Button
          color='green'
          onClick={handleEquip}
          disabled={sectionTotalCost <= 0 || sectionTotalCost > (Number(user?.gold) ?? 0)}
        >
          Buy
        </Button>
        <Button
          color='red'
          onClick={handleUnequip}
          disabled={sectionTotalCost <= 0}
        >
          Sell
        </Button>
      </Group>
    </Flex>
  );

  return (
    <ContentCard
      title={formatHeading(heading)}
      icon={<RpgAwesomeIcon icon={icon} size="md" />}
      footer={footerContent}
      className="my-10"
      iconPosition='left'
    >
      <Table striped className="w-full table-fixed pb-2">
        <Table.Tbody>
          {getItems.map((unit) => {
            const isCollapsed = collapsedItems[unit.id] ?? false;
            if (unit.enabled) {
              return (
                <Table.Tr key={unit.id}>
                  <Table.Td className="w-80 px-4 py-2">
                    <Group gap={'sm'} grow={false} align="flex-start">
                      <span onClick={() => toggleCollapse(unit.id)} style={{ cursor: 'pointer' }} aria-expanded={!isCollapsed} role="button">
                        {isCollapsed ? <FontAwesomeIcon icon={faPlus} size="sm" /> : <FontAwesomeIcon icon={faMinus} size="sm" />}
                      </span>
                      <div>
                        <Text fz="lg" fw={500} className="font-medieval">
                          {unit.name}
                          <span className="text-xs font-medieval"> (+{unit.bonus} {unit.usage})</span>
                        </Text>
                        {!isCollapsed && (
                          <>
                            <Text fz="sm" c="#ADB5BD">Costs: {toLocale(unit.cost, user?.locale)} Gold</Text>
                            <Text fz="sm" c="#ADB5BD">Sale Value: {toLocale(Math.floor(Number(String(unit.cost).replace(/,/g, '')) * 0.75), user?.locale)}</Text>
                          </>
                        )}
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td className="w-80 px-4 py-2">
                    <Group>
                      <Text fz="med" fw={500}><span className="font-medieval">Owned: </span><span id={`${unit.id}_owned`}>{toLocale(unit.ownedItems || 0, user?.locale)}</span></Text>
                      <Text fz="med" fw={500}><span className="font-medieval">Units: </span><span id={`${unit.id}_total`}>{toLocale(currentUnitCount || 0, user?.locale)}</span></Text>
                    </Group>
                  </Table.Td>
                  <Table.Td className="w-40 px-4 py-2">
                    <NumberInput
                      aria-labelledby={unit.id}
                      name={unit.id}
                      value={itemCosts[unit.id] || 0}
                      onChange={(value) => handleInputChange(unit.id, value)}
                      min={0}
                      className="w-full rounded-md"
                      allowNegative={false}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            }
            else {
              return (
                <Table.Tr key={unit.id}>
                  <Table.Td className="px-4 py-2">
                    <Group gap={'sm'} grow={false}>
                      <span onClick={() => toggleCollapse(unit.id)} style={{ cursor: 'pointer' }} aria-expanded={!isCollapsed} role="button">
                        {isCollapsed ? <FontAwesomeIcon icon={faPlus} size="sm" /> : <FontAwesomeIcon icon={faMinus} size="sm" />}
                      </span>
                      <div>
                        <Text fz="lg" fw={500} className="font-medieval">
                          {unit.name}
                          <span className="text-xs font-medieval"> (+{unit.bonus} {unit.usage})</span>
                        </Text>
                        {!isCollapsed && (<Text fz="sm" c="#ADB5BD">Costs: -</Text>)}
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td colSpan={2} className="px-4 py-2">
                    <Group>
                      <Text fz="med" fw={500} className="text-center">Unlocked with {unit.fortName}</Text>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            }
          })}
          <Table.Tr>
            <Table.Td colSpan={3} className="px-4 py-2">
              <Group gap="xs" grow align='flex-end'>
                <Text>Convert</Text>
                <NumberInput
                  value={conversionAmount}
                  onChange={(value) => setConversionAmount(Number(value) || 0)}
                  min={0}
                  allowNegative={false}
                  style={{ flexBasis: '100px' }}
                />
                <Select
                  data={getItems.filter(item => item.enabled && (item.ownedItems || 0) > 0).map(item => ({ value: item.id, label: item.name }))}
                  value={fromItem}
                  onChange={setFromItem}
                  placeholder="From Item"
                  searchable clearable
                  style={{ flexBasis: '180px' }}
                />
                <Text>to</Text>
                <Select
                  data={getItems.filter(item => item.enabled && item.id !== fromItem).map(item => ({ value: item.id, label: item.name }))}
                  value={toItem}
                  onChange={setToItem}
                  placeholder="To Item"
                  searchable clearable
                  disabled={!fromItem}
                  style={{ flexBasis: '180px' }}
                />
                <Stack gap={0} style={{ flexBasis: '150px', textAlign: 'right' }}>
                  <Text size='sm'>{toLower ? 'Refund:' : 'Cost:'}</Text>
                  <Text size='sm'>{toLocale(conversionCost, user?.locale)}</Text>
                </Stack>
                <Button onClick={handleConvert} disabled={!fromItem || !toItem || conversionAmount <= 0} size="sm">Convert</Button>
              </Group>
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </ContentCard>
  );
}); // Wrap with React.memo

NewItemSection.displayName = 'NewItemSection'; // Add display name for React DevTools

export default NewItemSection;