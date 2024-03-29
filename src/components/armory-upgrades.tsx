import React from 'react';

import { ArmoryUpgrades, Fortifications } from '@/constants';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';

const ArmoryUpgradesTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  console.log('ArmoryTab', userLevel, fortLevel);
  return (
    <table className="w-full table-fixed">
      <thead className="text-left">
        <tr>
          <th className="w-60">Name</th>
          <th className="w-20">Level Req.</th>
          <th className="w-60">Bonus</th>
          <th className="w-40">Cost</th>
          <th className="w-full">Action</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(ArmoryUpgrades)
          .filter((item) => item.level <= fortLevel + 2)
          .map((item, index) => (
            <tr key={`${item.name}_${item.level}`}>
              <td className="border px-4 py-2">
                {item.name} {item.level === userLevel && '(Current Upgrade)'}
              </td>
              <td className="border px-4 py-2">{item.fortLevel}</td>
              <td className="border px-4 py-2">
                Level {item.level} Armory items
              </td>
              <td className="border px-4 py-2">{toLocale(item.cost)} Gold</td>
              <td className="border px-4 py-2">
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
