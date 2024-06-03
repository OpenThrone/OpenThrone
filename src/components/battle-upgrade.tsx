/* eslint-disable jsx-a11y/control-has-associated-label */
// components/ItemSection.tsx

import React, { useEffect, useState } from 'react';

import type { UnitProps, UnitSectionProps } from '@/types/typings';
import toLocale from '@/utils/numberFormatting';

import { useUser } from '../context/users';
import { alertService } from '@/services';

const BattleUpgradesSection: React.FC<UnitSectionProps> = ({
  heading,
  items,
}) => {
  const { user, forceUpdate } = useUser();
  const [getItems, setItems] = useState<UnitProps[] | []>(items || []);

  useEffect(() => {
    if (items) {
      items.forEach((item) => {
        if (item.ownedItems === undefined) {
          item.ownedItems = 0;
        }
      });
      setItems(items);
    }
  }, [items]);

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
      //updateTotalCost(sectionCost);
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
  }, [getItems, items]);

  const handleEquip = async (operation: string) => {
    if (!getItems || getItems.length === 0) return;

    const itemsToEquip = getItems
      .map((item) => {
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
      })
      .filter(Boolean); // Filter out null values

    if (!user) {
      // Handle the case where user is null
      alertService.error('User not found');
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
          items: itemsToEquip,
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

  return (
    <div className="my-10 rounded-lg bg-gray-800">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className="w-60 px-4 py-2">{heading}</th>
            <th className="w-10 px-4 py-2">You Have</th>
            <th className="w-10 px-4 py-2">Cost</th>
            <th className="w-10 px-4 py-2">Stats</th>
            <th className="w-10 px-4 py-2">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {getItems.map((item: UnitProps) => {
            if (item.enabled) {
              return (

                <tr key={item.id}>
                  <td className="border px-4 py-2">{item.name}</td>
                  <td className="border px-4 py-2">{item.ownedItems}</td>
                  <td className="border px-4 py-2">
                    {toLocale(item.cost, user?.locale)}
                  </td>

                  <td className="border px-4 py-2">
                    <ul>
                      <li>+{(item.unitsCovered > 1 ? toLocale(item?.bonus / item.unitsCovered, user?.locale) : toLocale(item?.bonus || 0, user?.locale))} {item.type}/Unit</li>
                      <li>Holds: {item.unitsCovered} Units</li>
                      <li>Min Unit Level: {item.minUnitLevel}</li>
                    </ul>
                  </td>
                  <td className="border px-4 py-2">
                    <input
                      type="number"
                      aria-labelledby={item.id}
                      name={`${item.type}_${item.level}`}
                      defaultValue={0}
                      min={0}
                      onChange={handleInputChange}
                      className="w-full rounded-md bg-gray-900 p-2"
                    />
                  </td>
                </tr>
              );
            } else {
              console.log(item);
              return (
                <tr key={item.id}>
                  <td className="border px-4 py-2">{item.name}</td>
                  <td className="border px-4 py-2">-</td>
                  <td className="border px-4 py-2" colSpan={3}>
                    <p className="text-center">Unlocked with {item.SiegeUpgrade}</p>
                  </td>
                </tr>
              );
            }
          })}
        </tbody>
      </table>
      <div className="mt-4 flex justify-between">
        <button
          type="button"
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={async() => await handleEquip('buy')}
        >
          Buy
        </button>
        <button
          type="button"
          className="rounded bg-red-500 px-4 py-2 font-bold text-white hover:bg-red-700"
          onClick={async () => await handleEquip('sell')}
        >
          Sell
        </button>
      </div>
    </div>
  );
};

export default BattleUpgradesSection;
