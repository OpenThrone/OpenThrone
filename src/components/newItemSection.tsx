import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { alertService } from '@/services';
import type { UnitProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';
import { useUser } from '../context/users';
import { Table, Text, Group, NumberInput, Select, Button, Flex, Stack, Tooltip } from '@mantine/core';
import { faPlus, faMinus } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import RpgAwesomeIcon from './RpgAwesomeIcon';
import { logError } from '@/utils/logger';
import ContentCard from './ContentCard';
import ImageWithFallback from './ImagWithFallback';

/**
 * Determines the RPG Awesome icon class name based on the item section heading.
 * @param heading - The heading string (e.g., "WEAPON", "SHIELD").
 * @returns The corresponding icon class name or a default icon name.
 */
const getIconClass = (heading: string): string => {
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

/**
 * Props for the NewItemSection component.
 */
interface NewItemSectionProps {
  /** The title/heading for this item section (e.g., "WEAPONS"). */
  heading: string;
  /** Array of item data objects to display in this section. */
  items: UnitProps[];
  /** State object mapping item IDs to their quantities for buy/sell actions. */
  itemCosts: { [key: string]: number };
  /** Function to update the itemCosts state. */
  setItemCosts: React.Dispatch<React.SetStateAction<{ [key: string]: number }>>;
  /** The total count of units relevant to this item type (e.g., total OFFENSE units for WEAPONS). */
  units: number;
}

// Use React.memo to prevent unnecessary re-renders
/**
 * A component section displaying items of a specific type (e.g., Weapons, Armor).
 * Allows users to buy, sell, and convert items within the section.
 * Displays item details, costs, owned quantities, and handles API interactions.
 */
const NewItemSection: React.FC<NewItemSectionProps> = React.memo(({
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
  const [buySellError, setBuySellError] = useState<string | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [isProcessingBuy, setIsProcessingBuy] = useState(false);
  const [isProcessingSell, setIsProcessingSell] = useState(false);
  const [isProcessingConvert, setIsProcessingConvert] = useState(false);

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

  /**
   * Handles changes in the NumberInput fields for item quantities.
   * Updates the itemCosts state with the new quantity for the specific item.
   * Ensures the value is a non-negative number.
   * @param unitId - The ID of the item whose quantity is being changed.
   * @param value - The new value from the NumberInput (can be number, string, or undefined).
   */
  const handleInputChange = useCallback((unitId: string, value: number | string | undefined) => {
    const numericValue = value === undefined || value === '' || isNaN(Number(value)) ? 0 : Math.max(0, Number(value));
    setItemCosts(prev => ({
      ...prev,
      [unitId]: numericValue,
    }));
  }, [setItemCosts]);

  /**
   * Handles the "Buy" action for items in the section.
   * Gathers selected item quantities, validates input, and sends a request to the '/api/armory/equip' endpoint.
   * Manages loading state and displays success/error messages.
   */
  const handleEquip = async () => {
    if (isProcessingBuy || isProcessingSell || isProcessingConvert) return; // Prevent action if already processing
    setIsProcessingBuy(true);
    setBuySellError(null); // Clear previous errors

    if (!getItems || getItems.length === 0) {
        setBuySellError("No items available.");
        setIsProcessingBuy(false);
        return;
    }

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
      setBuySellError('No items selected to buy.');
      setIsProcessingBuy(false);
      return;
    }

    if (!user) {
      setBuySellError('User data not available.');
      setIsProcessingBuy(false);
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
        setBuySellError(data.error || 'Failed to buy items.');
      }
    } catch (error: any) {
      setBuySellError('Network error. Failed to buy items.');
      logError('Buy items error:', error);
    } finally {
        setIsProcessingBuy(false);
    }
  };

  /**
   * Handles the "Sell" action for items in the section.
   * Gathers selected item quantities, validates against owned items, and sends a request to the '/api/armory/unequip' endpoint.
   * Manages loading state and displays success/error messages.
   */
  const handleUnequip = async () => {
    if (isProcessingBuy || isProcessingSell || isProcessingConvert) return; // Prevent action if already processing
    setIsProcessingSell(true);
    setBuySellError(null); // Clear previous errors

    if (!getItems || getItems.length === 0) {
        setBuySellError("No items available.");
        setIsProcessingSell(false);
        return;
    }

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
      setBuySellError('No items selected or available to sell.');
      setIsProcessingSell(false);
      return;
    }

    if (!user || !user.id) {
      setBuySellError('User information is not available.');
      setIsProcessingSell(false);
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
        setBuySellError(data.error || 'Failed to sell items.');
      }
    } catch (error: any) {
      setBuySellError('Network error. Failed to sell items.');
      logError('Sell items error:', error);
    } finally {
        setIsProcessingSell(false);
    }
  };

  /**
   * Handles the "Convert" action for items within the section.
   * Validates selected 'from' and 'to' items, quantity, and user gold.
   * Sends a request to the '/api/armory/convert' endpoint.
   * Manages loading state and displays success/error messages.
   */
  const handleConvert = async () => {
    if (isProcessingBuy || isProcessingSell || isProcessingConvert) return; // Prevent action if already processing
    setIsProcessingConvert(true);
    setConvertError(null); // Clear previous errors

    const userGold = BigInt(user?.gold?.toString() ?? '0');

    if (!fromItem || !toItem || !conversionAmount || conversionAmount <= 0) {
      setConvertError('Select items and enter a positive quantity.');
      setIsProcessingConvert(false);
      return;
    }
    if (!toLower && BigInt(conversionCost) > userGold) {
      setConvertError('Not enough gold for this conversion.');
      setIsProcessingConvert(false);
      return;
    }

    const fromData = getItems.find((item) => item.id === fromItem);
    if (!fromData) {
      setConvertError('Invalid "from" item selected.');
      setIsProcessingConvert(false);
      return;
    }
    if ((fromData.ownedItems || 0) < conversionAmount) {
      setConvertError(`Not enough ${fromData.name} to convert.`);
      setIsProcessingConvert(false);
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
        setConvertError(errorData.error || 'Conversion failed.');
        return;
      }

      alertService.success('Conversion successful!'); // Keep success alert
      setConversionAmount(0);
      setFromItem(null);
      setToItem(null);
      forceUpdate();
    } catch (error: any) {
      logError('Failed to convert items:', error);
      setConvertError('Network error during conversion.');
    } finally {
        setIsProcessingConvert(false);
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

  /**
   * Toggles the collapsed state of a specific item row in the table.
   * @param itemId - The ID of the item row to toggle.
   */
  const toggleCollapse = (itemId: string) => {
    setCollapsedItems((prevState) => ({
      ...prevState,
      [itemId]: !prevState[itemId],
    }));
  };

  /**
   * Formats the section heading string to title case.
   * @param SecHeading - The raw heading string (e.g., "WEAPONS").
   * @returns The formatted heading string (e.g., "Weapons").
   */
  const formatHeading = (SecHeading: string): string => {
    return SecHeading.split(' ')
      .map((word) =>
        word[0] ? word[0].toUpperCase() + word.substring(1).toLowerCase() : '',
      )
      .join(' ');
  };

  const userGold = BigInt(user?.gold?.toString() ?? '0');
  const buyDisabled = sectionTotalCost <= 0 || BigInt(sectionTotalCost) > userGold || isProcessingBuy || isProcessingSell || isProcessingConvert;
  const sellDisabled = sectionTotalCost <= 0 || isProcessingBuy || isProcessingSell || isProcessingConvert; // Add check for owned items later if needed per item

  const buyTooltip =
      sectionTotalCost <= 0 ? 'Enter quantities to buy.' :
      BigInt(sectionTotalCost) > userGold ? `Not enough gold (Cost: ${toLocale(sectionTotalCost, user?.locale)})` :
      '';
  const sellTooltip = sectionTotalCost <= 0 ? 'Enter quantities to sell.' : '';


  const footerContent = (
    <>
      {/* Inline Error Display for Buy/Sell */}
      {buySellError && (
          <Text color="red" size="sm" ta="center" mb="xs">
              {buySellError}
          </Text>
      )}
      <Flex justify='space-between' align="center">
        <Stack gap="xs">
          <Text size='sm'>Total Cost: {toLocale(sectionTotalCost, user?.locale)}</Text>
          <Text size='sm' c="dimmed">Refund: {toLocale(Math.floor(sectionTotalCost * 0.75), user?.locale)}</Text>
        </Stack>
        <Group gap="sm">
          <Tooltip label={buyTooltip} disabled={!buyDisabled || isProcessingBuy} withArrow>
             <div style={{ width: 'auto' }}> {/* Wrapper for disabled tooltip */}
                <Button
                  color='green'
                  onClick={handleEquip}
                  disabled={buyDisabled}
                  loading={isProcessingBuy}
                >
                  Buy
                </Button>
             </div>
          </Tooltip>
          <Tooltip label={sellTooltip} disabled={!sellDisabled || isProcessingSell} withArrow>
             <div style={{ width: 'auto' }}> {/* Wrapper for disabled tooltip */}
                <Button
                  color='red'
                  onClick={handleUnequip}
                  disabled={sellDisabled}
                  loading={isProcessingSell}
                >
                  Sell
                </Button>
             </div>
          </Tooltip>
        </Group>
      </Flex>
    </>
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
              /**
               * Generates the S3 URL for the item's image based on its type, level, and user's race.
               * Includes fallback logic.
               * @param unit - The item data.
               * @returns The URL string for the item image.
               */
              const getArmoryImage = (unit: UnitProps): string => {
                if (!unit) {
                  return `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Armory/default-item.webp`;
                }

                // Get the base item type (like "SWORD" from "SWORD_1")
                const baseItemType = unit.type.toLowerCase();
                // for now, we're only showing default items.
                // TODO: finish this
                return `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Armory/default-${baseItemType}.webp`;
                // Get the item level
                const itemLevel = unit.level || 1;

                // Convert race to proper case for path (e.g., "ELF" to "Elf")
                const raceProperCase = user?.race ?
                  user.race.charAt(0).toUpperCase() + user.race.slice(1).toLowerCase() :
                  'Human'; // Default to Human if race not specified

                // Return path to armory image
                return `${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Armory/${raceProperCase}/L${itemLevel}${baseItemType}.webp`;
              }

              return (
                <Table.Tr key={unit.id}>
                  <Table.Td className="w-80 px-4 py-2">
                    <Group gap={'sm'} grow={false} align="flex-start">
                      <span onClick={() => toggleCollapse(unit.id)} style={{ cursor: 'pointer' }} aria-expanded={!isCollapsed} role="button">
                        {isCollapsed ? <FontAwesomeIcon icon={faPlus} size="sm" /> : <FontAwesomeIcon icon={faMinus} size="sm" />}
                      </span>
                      {process.env.NEXT_PUBLIC_SHOW_AI_IMAGES ? (
                        <ImageWithFallback
                          fallbackSrc={`${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/Armory/default-item.webp`} // Fallback image
                          src={getArmoryImage(unit)}
                          alt={unit.name}
                          width={80}
                          height={80}
                          className="rounded-full"
                          style={{ display: isCollapsed ? 'none' : 'block' }} // Hide image when collapsed                        
                        />
                      ) : ''}
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
                  <Text size='sm' color={!toLower && BigInt(conversionCost) > userGold ? 'red' : 'inherit'}>
                      {toLocale(conversionCost, user?.locale)}
                  </Text>
                </Stack>
                 <Tooltip label={convertError || (!fromItem || !toItem ? 'Select items' : conversionAmount <= 0 ? 'Enter quantity' : !toLower && BigInt(conversionCost) > userGold ? 'Not enough gold' : '')} disabled={!(!fromItem || !toItem || conversionAmount <= 0 || (!toLower && BigInt(conversionCost) > userGold)) || isProcessingConvert} withArrow>
                   <div style={{ width: 'auto' }}> {/* Wrapper for disabled tooltip */}
                      <Button
                        onClick={handleConvert}
                        disabled={!fromItem || !toItem || conversionAmount <= 0 || (!toLower && BigInt(conversionCost) > userGold) || isProcessingBuy || isProcessingSell || isProcessingConvert}
                        loading={isProcessingConvert}
                        size="sm"
                      >
                          Convert
                      </Button>
                   </div>
                 </Tooltip>
              </Group>
              {/* Inline Error Display for Convert */}
              {convertError && (
                  <Text color="red" size="xs" ta="center" mt="xs">
                      {convertError}
                  </Text>
              )}
            </Table.Td>
          </Table.Tr>
        </Table.Tbody>
      </Table>
    </ContentCard>
  );
});

NewItemSection.displayName = 'NewItemSection'; // Add display name for React DevTools

export default NewItemSection;