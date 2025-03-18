import React, { useCallback, useMemo } from 'react';
import { 
  Table, 
  NumberInput, 
  Title, 
  Text,
  Tooltip
} from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faInfoCircle } from '@fortawesome/free-solid-svg-icons';
import { ItemTypes } from '@/constants';


interface ItemsInputFormProps {
  items: Record<string, Record<number, number>>;
  onChange: (items: Record<string, Record<number, number>>) => void;
}

// Update the ItemRow component to correctly access quantities
const ItemRow = React.memo(({
  itemType,
  itemData,
  levels,
  onItemChange
}: {
  itemType: string;
  itemData: { name: string; usage: string; quantities: Record<number, number>; type: string };
  levels: number[];
  onItemChange: (type: string, level: number, quantity: number, usage: string) => void;
}) => {
  return (
    <Table.Tr>
      <Table.Td>
        <Tooltip label={`${itemData.name} - ${itemData.usage} item`}>
          <div className="flex items-center">
            {itemData.type}
            <FontAwesomeIcon
              icon={faInfoCircle}
              size="sm"
              className="ml-1 text-gray-500"
            />
          </div>
        </Tooltip>
      </Table.Td>
      {levels.map((level) => (
        <Table.Td key={`${itemType}-${level}`}>
          <NumberInput
            value={itemData.quantities?.[level] || 0}
            onChange={(value) => onItemChange(itemType, level, value as number, itemData.usage)}
            min={0}
            max={1000}
            step={1}
            thousandSeparator=","
          />
        </Table.Td>
      ))}
    </Table.Tr>
  );
});

ItemRow.displayName = 'ItemRow';

const ItemsInputForm: React.FC<ItemsInputFormProps> = ({ items, onChange }) => {
  // Memoize the item types to prevent unnecessary renders
  const itemTypes = useMemo(() => ['WEAPON', 'HELM', 'ARMOR', 'BOOTS', 'BRACERS', 'SHIELD'], []);

  // Memoize the levels array
  const levels = useMemo(() => [1,2,3], []);

  // Prepare data for rendering with quantities included
  const itemsWithQuantities = useMemo(() => {
    console.log('Current items:', items);
    return itemTypes.map(type => {
      // Find the item type data
      const itemTypeData = ItemTypes.find(item => item.type === type) || { name: type, usage: 'GENERAL' };
      // Get quantities for this item type
      const quantities = items[type] || {};
      
      return {
        type,
        name: itemTypeData.name,
        usage: itemTypeData.usage,
        quantities
      };
    });
  }, [itemTypes, items]);

  // Memoize the change handler
  const handleItemChange = useCallback((type: string, level: number, quantity: number, usage: string) => {
    console.log(`Changing ${type} level ${level} to ${quantity}`);
    onChange(prevItems => {
      // Create a new object only if necessary
      const newItems = { ...prevItems };

      // Initialize the type object if it doesn't exist
      if (!newItems[type]) {
        newItems[type] = {};
      }

      // Only update if the value actually changed
      if (newItems[type][level] !== quantity) {
        const updatedTypeItems = { ...newItems[type], [level]: quantity };
        newItems[type] = updatedTypeItems;
        console.log('Updated items:', newItems);
        return newItems;
      }

      // Return the unchanged object if nothing changed
      return prevItems;
    });
  }, [onChange]);

  return (
    <>
      <Title order={5} mb="xs">Items</Title>
      <Text size="sm" mb="md" c="dimmed">
        Items provide bonuses to your units in battle
      </Text>

      {/* Debug section */}
      <Text size="xs" c="dimmed" mb="md">
        Item data loaded: {Object.keys(items).length > 0 ? 'Yes' : 'No'}
      </Text>

      <Table striped withTableBorder>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Item Type</Table.Th>
            {levels.map(level => (
              <Table.Th key={`level-${level}`}>Level {level}</Table.Th>
            ))}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {itemsWithQuantities.map((itemData) => (
            <ItemRow
              key={itemData.type}
              itemType={itemData.type}
              itemData={itemData}
              levels={levels}
              onItemChange={handleItemChange}
            />
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
};

export default React.memo(ItemsInputForm);