import React from 'react';

import { ArmoryUpgrades, Fortifications } from '@/constants';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';
import { Badge } from '@mantine/core';

const ArmoryUpgradesTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  return (
    <table className="w-full table-auto bg-gray-800 text-white">
      <thead className="bg-gray-900 text-left">
        <tr>
          <th className="w-60 px-2">Name</th>
          <th className="w-60 px-2">Bonus</th>
          <th className="w-40 px-2">Cost</th>
          <th className=" px-2">Action</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(ArmoryUpgrades)
          .filter((item) => item.level <= fortLevel + 2)
          .map((item, index) => (
            <tr key={`${item.name}_${item.level}`} className='text-md odd:bg-table-odd even:bg-table-even'>
              <td className="px-4 py-2">
                {item.name} {item.level === userLevel && (
                  <Badge color="blue" ml={5}>Owned</Badge>
                )}
              </td>
              <td className="px-4 py-2">
                Level {item.level} Armory items
              </td>
              <td className="px-4 py-2">{toLocale(item.cost)} Gold</td>
              <td className="px-4 py-2">
                {item.level > userLevel &&
                  (item.fortLevel <= fortLevel ? (
                    <button
                      type="button"
                      className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                      onClick={() => buyUpgrade('armory', index, forceUpdate)}
                    >
                      Buy
                    </button>
                  ) : (
                    <span>
                      Unlock with Fort:{' '}
                      {
                        Fortifications.find(
                          (fort) => fort.level === item.fortLevel
                        )?.name
                      }
                    </span>
                  ))}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
};

export default ArmoryUpgradesTab;
