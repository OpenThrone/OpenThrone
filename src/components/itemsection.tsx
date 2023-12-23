// components/ItemSection.tsx

import React, { useEffect, useMemo, useState } from 'react';

import { alertService } from '@/services';

import { useUser } from '../context/users';
import toLocale from '@/utils/numberFormatting';

type UnitProps = {
  id: string;
  name: string;
  bonus?: number;
  ownedItems: number;
  cost: string;
  enabled: boolean;
  level?: number;
  usage: string;
  fortName: string;
  armoryLevel: number;
};

type UnitSectionProps = {
  heading: string;
  items: UnitProps[];
  updateTotalCost: (costChange: number) => void; // New prop
};

// Utility function outside the component
const getIconClass = (heading:string) => {
  const iconMap = {
    'WEAPON': 'ra ra-sword',
    'SHIELD': 'ra ra-shield',
    'ARMOR': 'ra ra-armor',
    'BOOTS': 'ra ra-boot-stomp',
    'BRACERS': 'ra ra-bracer',
    'HELM': 'ra ra-knight-helmet',
  };
  if (!heading) return 'default-icon';

  const words = heading.toUpperCase().split(' ');
  for (const word of words) {
    if (iconMap[word]) return iconMap[word];
  }

  return 'default-icon';
};

const ItemSection: React.FC<UnitSectionProps> = ({ heading, items, updateTotalCost }) => {
  const { user, forceUpdate } = useUser();
  const icon = useMemo(() => getIconClass(heading), [heading]);
  const [currentItems, setCurrentItems] = useState<UnitProps[]>(items);
  useEffect(() => {
    // Set initial items on component mount
    setCurrentItems(items);
  }, [items]);

  const getItems = useMemo(() => {
    return currentItems?.filter(item => item.armoryLevel <= user?.armoryLevel + 1) || [];
  }, [currentItems, user]);

  const computeTotalCostForSection = () => {
    console.log('compute each section')
    let sectionCost = 0;
    items?.forEach((unit) => {
      const inputElement = document.querySelector(`input[name="${unit.id}"]`);
      // Parse the value to number for calculation
      const inputValue = parseInt(inputElement?.value.replace(/,/g, '') || '0', 10);
      sectionCost += inputValue * parseInt(unit.cost.replace(/,/g, ''), 10);
    });
    updateTotalCost(sectionCost);
  };

  const handleInputChange = (event) => {
    // Format the number on input
    if (event.target.value === '') {
      event.target.value = 0;
    }
    const formattedValue = toLocale(parseInt(event.target.value.replace(/,/g, ''), 10), user?.locale);
    event.target.value = (formattedValue == 'NaN' ? 0 : formattedValue);
  }
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
          const inputElement = document.querySelector(`input[name="${unit.id}"]`);
          inputElement?.removeEventListener('input', computeTotalCostForSection);
        });
      }
    };
  }, [currentItems, updateTotalCost]);

  const handleEquip = async () => {
    if (!getItems || getItems.length === 0) return;
    const itemsToEquip = getItems
      .filter((item) => item.enabled)
      .map((item) => {
        const inputElement = document.querySelector(`input[name="${item.id}"]`);
        return {
          type: item.id.split('_')[1], // Extracting the item type from the id
          quantity: parseInt(inputElement.value, 10),
          usage: item.usage,
          level: parseInt(item.id.split('_')[2], 10),
        };
      });
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
              (i) => i.type === item.id.split('_')[0]
            );
            if (updatedItem) {
              return { ...item, ownedItems: updatedItem.quantity };
            }
            return item;
          });
        });
        currentItems.forEach((item) => {
          //console.log(item)
          const inputElement = document.querySelector(`input[name="${item.id}"]`);
          //console.log(inputElement)
          if (inputElement)
          inputElement.value = '0';
        });
        
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to equip items. Please try again.');
      console.log(error)
    }
  };

  const handleUnequip = async () => {
    if (!getItems || getItems.length === 0) return;
    const itemsToUnequip = getItems
      .filter((item) => item.enabled)
      .map((item) => {
        const inputElement = document.querySelector(`input[name="${item.id}"]`);
        return {
          type: item.id.split('_')[1], // Extracting the item type from the id
          quantity: parseInt(inputElement.value, 10),
          usage: item.usage,
          level: parseInt(item.id.split('_')[2], 10),
        };
      });

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
              (i) => i.type === item.id.split('_')[0]
            );
            if (updatedItem) {
              return { ...item, ownedItems: updatedItem.quantity };
            }
            return item;
          });
        });
        currentItems.forEach((item) => {
          const inputElement = document.querySelector(`input[name="${item.id}"]`);
          inputElement.value = '0';
        });
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to unequip items. Please try again.');
    }
  };

  const formatHeading = (heading) => {
    return heading
      .split(' ')
      .map((word) => word[0].toUpperCase() + word.substring(1).toLowerCase())
      .join(' ');
  }

  return (
    <div className="my-10 rounded-lg bg-gray-800">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className="w-60 px-4 py-2"><span className={`ra ${icon}`} />{' ' + formatHeading(heading)}</th>
            <th className="w-10 px-4 py-2">Bonus</th>
            <th className="w-10 px-4 py-2">You Have</th>
            <th className="w-10 px-4 py-2">Cost</th>
            <th className="w-10 px-4 py-2">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {getItems.map((unit) =>
            unit.enabled ? (
              <tr key={unit.id}>
                <td className="border px-4 py-2">{unit.name}</td>
                <td className="border px-4 py-2">
                  +{unit.bonus} {unit.usage}
                </td>
                <td className="border px-4 py-2">
                  <span id={`${unit.id}_owned`}>{unit.ownedItems}</span>
                </td>
                <td className="border px-4 py-2">{unit.cost}</td>
                <td className="border px-4 py-2">
                  <input
                    type="text"
                    aria-labelledby={unit.id}
                    name={unit.id}
                    defaultValue="0"
                    min={0}
                    onChange={handleInputChange}
                    className="w-full rounded-md bg-gray-600 p-2"
                  />
                </td>
              </tr>
            ) : (
              <tr key={unit.id}>
                <td className="border px-4 py-2">{unit.name}</td>
                <td className="border px-4 py-2" />
                <td colSpan={3} className="border px-4 py-2 text-center">
                  Unlocked with {unit.fortName}
                </td>
              </tr>
            )
          )}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between">
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={handleEquip}
        >
          Buy
        </button>
        <button
          className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
          onClick={handleUnequip}
        >
          Sell
        </button>
      </div>
    </div>
  );
};

export default ItemSection;
