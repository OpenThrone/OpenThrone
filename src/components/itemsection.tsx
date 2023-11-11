// components/ItemSection.tsx

import React, { useEffect, useState } from 'react';

import { alertService } from '@/services';

import { useUser } from '../context/users';

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
};

type UnitSectionProps = {
  heading: string;
  items: UnitProps[];
  updateTotalCost: (costChange: number) => void; // New prop
};

const ItemSection: React.FC<UnitSectionProps> = ({ heading, items, updateTotalCost }) => {
  const { user, forceUpdate } = useUser();
  const [getItems, setItems] = useState(items || []);

  useEffect(() => {
    if (items) {
      setItems(items);
    }
  }, [items]);

  const computeTotalCostForSection = () => {
    let sectionCost = 0;
    items.forEach((unit) => {
      const inputElement = document.querySelector(`input[name="${unit.id}"]`);
      sectionCost +=
        parseInt(inputElement?.value || '0', 10) *
        parseInt(unit.cost.replace(/,/g, ''), 10);
    });
    updateTotalCost(sectionCost); // Send the total cost for this section
  };
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
  }, [items, updateTotalCost]);

  const handleEquip = async () => {
    const itemsToEquip = getItems
      .filter((item) => item.enabled)
      .map((item) => {
        const inputElement = document.querySelector(`input[name="${item.id}"]`);
        return {
          type: item.id.split('_')[0], // Extracting the item type from the id
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
        setItems((prevItems) => {
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
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to equip items. Please try again.');
    }
  };

  const handleUnequip = async () => {
    const itemsToUnequip = getItems
      .filter((item) => item.enabled)
      .map((item) => {
        const inputElement = document.querySelector(`input[name="${item.id}"]`);
        return {
          type: item.id.split('_')[0], // Extracting the item type from the id
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
        setItems((prevItems) => {
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
        forceUpdate();
      } else {
        alertService.error(data.error);
      }
    } catch (error) {
      alertService.error('Failed to unequip items. Please try again.');
    }
  };


  return (
    <div className="my-10 rounded-lg bg-gray-800">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className="w-60 px-4 py-2">{heading}</th>
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
                    type="number"
                    aria-labelledby={unit.id}
                    name={unit.id}
                    defaultValue="0"
                    min={0}
                    onChange={computeTotalCostForSection}
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
          Equip
        </button>
        <button
          className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
          onClick={handleUnequip}
        >
          Unequip
        </button>
      </div>
    </div>
  );
};

export default ItemSection;
