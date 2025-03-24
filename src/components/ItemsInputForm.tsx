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
            onChange={(value) => {
              if (value !== undefined) {
                onItemChange(itemType, level, value, itemData.usage);
              }
            }}
            min={0}
            max={1000}
            step={100}
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
    console.log('Current items structure:', items);
    
    // Debug empty items object
    if (!items || Object.keys(items).length === 0) {
      console.log('Warning: Items object is empty or undefined');
    }
    
    return itemTypes.map(type => {
      // Find the item type data
      const itemTypeData = ItemTypes.find(item => item.type === type) || { name: type, usage: 'GENERAL' };
      // Get quantities for this item type from the items object
      const quantities = items[type] || {};
      
      //console.log(`Item ${type} quantities:`, quantities);
      
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
    // Create a deep copy of the current items state to avoid mutation issues
    const newItems = { ...items };
    
    // Initialize the type object if it doesn't exist
    if (!newItems[type]) {
      newItems[type] = {};
    }
    
    // Set the new quantity
    newItems[type] = { ...newItems[type], [level]: quantity };
    
    // Call the onChange with the new complete items object
    console.log('Updated items:', newItems);
    onChange(newItems);
  }, [items, onChange]);

  return (
    <>
      <Title order={5} mb="xs">Items</Title>

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