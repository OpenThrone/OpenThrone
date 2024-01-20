import React from 'react';

import { Fortifications, OffenseiveUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';

const OffenseUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  /* const anyUnits = (level: number) => {
    return Object.values(UnitTypes).filter(
      (item) => item.type === 'OFFENSE' && item.fortLevel === level
    );
  }; */

  console.log(userLevel, fortLevel);
  const { user } = useUser();

  return (
    <table className="w-full table-fixed">
      <thead className="text-left">
        <tr>
          <th className="w-60 px-2">Name</th>
          <th className="w-52 px-2">Fort Req.</th>
          <th className="w-48 px-2">Bonus</th>
          <th className="w-40 px-2">Cost</th>
          <th className="w-full px-2">Action</th>
        </tr>
      </thead>
      <tbody className="">
        {Object.values(OffenseiveUpgrades)
          .filter((item) => item.level <= fortLevel + 2)
          .map((item, index) => {
            // const units = anyUnits(item.level);
            return (
              <tr key={`${item.name}_${item.level}`} className="text-md">
                <td className="border px-2 py-1">
                  {item.name} {item.level === userLevel && '(Current Upgrade)'}
                </td>
                <td className="border px-2 py-1">
                  {
                    Fortifications.find(
                      (fort) => fort.level === item.fortLevelRequirement
                    )?.name
                  }
                </td>
                <td className="border px-2 py-1">
                  Offense Bonus: {item.offenseBonusPercentage}%
                </td>
                <td className="border px-2 py-1">
                  {toLocale(item.cost, user?.locale)} Gold
                </td>
                <td className="border px-2 py-1">
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
                    item.fortLevelRequirement >= fortLevel && (
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
