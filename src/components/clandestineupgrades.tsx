import { Fortifications, OffenseiveUpgrades, SpyUpgrades, UnitTypes } from '@/constants';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import React from 'react';
import toLocale from '@/utils/numberFormatting';
import { useUser } from '@/context/users';
import { BattleUpgradeProps } from '@/types/typings';

const ClandestineUpgrade: React.FC<BattleUpgradeProps> = ({ userLevel, fortLevel, forceUpdate }) => {
  const anyUnits = (level: number) => {
    return Object.values(UnitTypes)
      .filter(
        (item) => item.type === 'SPY' && item.fortLevel === level
      );
  }

  console.log(userLevel, fortLevel)
  const { user} = useUser();

  return (
    <><table className="min-w-full table-fixed">
      <thead className="text-left bg-gray-900">
        <tr>
          <th className='w-1/6 px-2'>Name</th>
          <th className="w-1/6 px-2">Fort Req.</th>
          <th className="w-1/6 px-2">Bonus</th>
          <th className='w-1/6 px-2'>Cost</th>
          <th className='w-1/6 px-2'>Action</th>
        </tr>
      </thead>
      <tbody className={''}>
        {Object.values(SpyUpgrades)
          .filter(
            (item) =>
              (item.fortLevelRequirement) <= fortLevel + 2
          )
          .map((item, index) => {
            const units = anyUnits(item.level);
            return (
              <tr key={index} className="text-md">
                <td className="border px-2 py-1">{item.name} {(item.level === userLevel) && ("(Current Upgrade)")}</td>
                <td className="border px-2 py-1">{Fortifications.find((fort)=>fort.level === item.fortLevelRequirement)?.name}</td>
                <td className="border px-2 py-1">
                  Offense Bonus: {item.offenseBonusPercentage}%<br />
                  Max Infiltrations: {item.maxInfiltrations}<br />
                  Max Assassinations: {item.maxAssassinations}
                </td>
                <td className="border px-2 py-1">{toLocale(item.cost, user?.locale)} Gold</td>
                <td className="border px-2 py-1">
                  {index === userLevel + 1 && item.fortLevelRequirement <= fortLevel ? (
                    <button
                      type="button"
                      className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"
                      disabled={fortLevel < item.fortLevelRequirement}
                      onClick={() => buyUpgrade('spy', index, forceUpdate)}
                    >
                      Buy
                    </button>
                  ) : item.fortLevelRequirement <= fortLevel && index > userLevel ? (
                    <span>Unlock with: <br />{SpyUpgrades[index]?.name}</span>
                  ) : (
                      item.fortLevelRequirement >= fortLevel && <span>Unlock with: <br/>{ Fortifications.find((fort)=>fort.level === item.fortLevelRequirement)?.name }</span>
                  )}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table></>
  );
};

export default ClandestineUpgrade;
