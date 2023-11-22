// components/ItemSection.tsx

import React, { useEffect, useState } from 'react';

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
};

type UnitSectionProps = {
  heading: string;
  items: UnitProps[];
  updateTotalCost: (costChange: number) => void; // New prop
};

const BattleUpgradesSection: React.FC<UnitSectionProps> = ({ heading, items, type }) => {
  const { user, forceUpdate } = useUser();
  const [getItems, setItems] = useState(items || []);

  useEffect(() => {
    if (items) {
      setItems(items);
    }
  }, [items]);

  console.log(items);
  return (
    <div className="my-10 rounded-lg bg-gray-800">
      <table className="w-full table-auto">
        <thead>
          <tr>
            <th className="w-60 px-4 py-2">{heading}</th>
            <th className="w-10 px-4 py-2">You Have</th>
            <th className="w-10 px-4 py-2">Cost</th>
            <th className='w-10 px-4 py-2'>Stats</th>
            <th className="w-10 px-4 py-2">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {getItems.map((item) => (
            <tr key={item.id}>
              <td className="border px-4 py-2">{item.name}</td>
              <td className="border px-4 py-2">{item.ownedItems}</td>
              <td className="border px-4 py-2">{toLocale(item.cost, user?.locale)}</td>
              <td className="border px-4 py-2">{item.bonus} {item.usage}</td>
              <td className="border px-4 py-2">
                <input type="number" className="w-10" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default BattleUpgradesSection;
