// components/ItemSection.tsx

import React, { useEffect, useMemo, useState } from 'react';

import { alertService } from '@/services';
import type { UnitProps, UnitSectionProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';

import { useUser } from '../context/users';

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

const ItemSection: React.FC<UnitSectionProps> = ({
  heading,
  items,
  updateTotalCost,
}) => {
  const { user, forceUpdate } = useUser();
  const icon = useMemo(() => getIconClass(heading), [heading]);
  const [currentItems, setCurrentItems] = useState<UnitProps[]>(items);

  useEffect(() => {
    // Set initial items on component mount
    setCurrentItems(items);
  }, [items]);

  const getItems = useMemo(() => {
    return (
      currentItems?.filter(
        (item) => (item?.armoryLevel ?? 0) <= (user?.armoryLevel ?? 0) + 1,
      ) || []
    );
  }, [currentItems, user]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log('handleInputChange', event.target.value);
    let { value } = event.target;
    if (value === '') {
      value = '0';
    }

    const formattedValue = toLocale(
      parseInt(value.replace(/,/g, ''), 10),
      user?.locale,
    );
    value = formattedValue === 'NaN' ? '0' : formattedValue;
  };

  useEffect(() => {
    const computeTotalCostForSection = () => {
      let sectionCost = 0;
      items?.forEach((unit) => {
        const inputElement = document.querySelector(`input[name="${unit.id}"]`);
        // Parse the value to number for calculation
        const iValue = parseInt(
          (inputElement as HTMLInputElement)?.value.replace(/,/g, '') || '0',
          10,
        );
        sectionCost += iValue * parseInt(unit.cost.replace(/,/g, ''), 10);
      });
      updateTotalCost(sectionCost);
    };
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

  return (
    <div className="my-10 rounded-lg bg-gray-800">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className="w-60 px-4 py-2">
              <span className={`ra ${icon}`} />
              {` ${formatHeading(heading)}`}
            </th>
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
                    defaultValue={0}
                    min={0}
                    onChange={handleInputChange}
                    className="w-full rounded-md bg-gray-600 p-2"
                  />
                </td>
              </tr>
            ) : (
              <tr key={unit.id}>
                <td className="border px-4 py-2">{unit.name}</td>
                <td className="border px-4 py-2">-</td>
                <td colSpan={3} className="border px-4 py-2 text-center">
                  Unlocked with {unit.fortName}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={handleEquip}
        >
          Buy
        </button>
        <button
          type="button"
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
