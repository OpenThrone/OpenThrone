import React from 'react';

import { Fortifications, SpyUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps, SpyUpgradeType } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';

const ClandestineUpgrade: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  /* const anyUnits = (level: number) => {
    return Object.values(UnitTypes).filter(
      (item) => item.type === 'SPY' && item.fortLevel === level
    );
  }; */
  const { user } = useUser();
  const renderUpgradeAction = (item: SpyUpgradeType, index: number) => {
    if (index === userLevel + 1 && item.fortLevelRequirement <= fortLevel) {
      return (
        <button
          type="button"
          className="w-full rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          disabled={fortLevel < item.fortLevelRequirement}
          onClick={() => buyUpgrade('spy', index, forceUpdate)}
        >
          Buy
        </button>
      );
    }

    if (item.fortLevelRequirement < fortLevel && index > userLevel) {
      return (
        <span>
          Unlock with Upgrade: <br />
          {SpyUpgrades[index - 1]?.name}
        </span>
      );
    }

    if (item.fortLevelRequirement > fortLevel) {
      return (
        <span>
          Unlock with Fort: <br />
          {
            Fortifications.find(
              (fort) => fort.level === item.fortLevelRequirement
            )?.name
          }
        </span>
      );
    }

    return null; // Default return when none of the conditions are met
  };
  return (
    <table className="min-w-full table-fixed">
      <thead className="bg-gray-900 text-left">
        <tr>
          <th className="w-1/6 px-2">Name</th>
          <th className="w-1/6 px-2">Fort Req.</th>
          <th className="w-1/6 px-2">Bonus</th>
          <th className="w-1/6 px-2">Cost</th>
          <th className="w-1/6 px-2">Action</th>
        </tr>
      </thead>
      <tbody className="">
        {Object.values(SpyUpgrades)
          .filter((item) => item.fortLevelRequirement <= fortLevel + 2)
          .map((item, index) => {
            // const units = anyUnits(item.level);
            return (
              <tr key={`${item.level}_${item.name}`} className="text-md">
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
                  Spy Bonus: {item.offenseBonusPercentage}%<br />
                  Max Infiltrations: {item.maxInfiltrations}
                  <br />
                  Max Assassinations: {item.maxAssassinations}
                </td>
                <td className="border px-2 py-1">
                  {toLocale(item.cost, user?.locale)} Gold
                </td>
                <td className="border px-2 py-1">
                  {renderUpgradeAction(item, index)}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table>
  );
};

export default ClandestineUpgrade;
