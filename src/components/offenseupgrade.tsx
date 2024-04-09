import React from 'react';

import { Fortifications, OffenseiveUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';
import { Badge } from '@mantine/core';

const OffenseUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { user } = useUser();

  return (
    <table className="w-full table-auto bg-gray-900 text-white">
      <thead className="bg-gray-900 text-left">
        <tr>
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Fort Req.</th>
          <th className="px-4 py-2">Bonus</th>
          <th className="px-4 py-2">Cost</th>
          <th className="px-4 py-2">Action</th>
        </tr>
      </thead>
      <tbody className="">
        {Object.values(OffenseiveUpgrades)
          .filter((item) => item.level <= fortLevel + 2)
          .map((item, index) => {
            return (
              <tr key={`${item.name}_${item.level}`} className="text-md">
                <td className="px-2 py-1">
                  {item.name} {item.level === userLevel && (
                    <Badge color="blue" ml={5}>Owned</Badge>
                  )}
                </td>
                <td className="px-2 py-1">
                  {
                    Fortifications.find(
                      (fort) => fort.level === item.fortLevelRequirement
                    )?.name
                  }
                </td>
                <td className="px-2 py-1">
                  Offense Bonus: {item.offenseBonusPercentage}%
                </td>
                <td className="px-2 py-1">
                  {toLocale(item.cost, user?.locale)} Gold
                </td>
                <td className="px-2 py-1">
                  {item.level === userLevel + 1 &&
                  item.fortLevelRequirement <= fortLevel ? (
                    <button
                      type="button"
                      className="w-full rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                      disabled={fortLevel < item.fortLevelRequirement}
                      onClick={() => buyUpgrade('offense', index, forceUpdate)}
                    >
                      Buy
                    </button>
                  ) : (
                    item.fortLevelRequirement > fortLevel && (
                      <span>
                        Unlock with: <br />
                        {
                          Fortifications.find(
                            (fort) => fort.level === item.fortLevelRequirement
                          )?.name
                        }
                      </span>
                    )
                  )}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
};

export default OffenseUpgrade;
