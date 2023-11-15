import { OffenseiveUpgrades, UnitTypes } from '@/constants';
import UpgradeTable from './UpgradeTable';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import React from 'react';

const OffenseUpgrade = ({ userLevel, fortLevel, forceUpdate }) => {
  console.log("OffenseTab", userLevel, fortLevel)
  
  const anyUnits = (level) => {
    return Object.values(UnitTypes)
      .filter(
        (item) => item.type === 'OFFENSE' && item.fortLevel === level
      );
  }

  return (
    <><table className="w-full table-fixed">
      <thead className={'text-left'}>
        <tr>
          <th className='w-60'>Name</th>
          <th className='w-20'>Level Req.</th>
          <th className='w-60'>Bonus</th>
          <th className='w-40'>Cost</th>
          <th className='w-full'>Action</th>
        </tr>
      </thead>
      <tbody className={''}>
        {Object.values(OffenseiveUpgrades)
          .filter(
            (item) =>
              (item.level) <= fortLevel + 2
          )
          .map((item, index) => {
            const units = anyUnits(item.level);
            return (
              <tr key={index}>
                <td className="border px-4 py-2">{item.name} {(item.level === fortLevel) && ("(Current Upgrade)")}</td>
                <td className="border px-4 py-2">{item.fortLevelRequirement}</td>
                <td className="border px-4 py-2">
                  Offense Bonus: {item.offenseBonusPercentage}%
                  {units.length > 0 && (
                    <>{units.map((unit, unitIndex) => (
                      <React.Fragment key={unitIndex}>
                        <br />Unlocks {unit.name}
                      </React.Fragment>
                    ))}</>
                  )}
                </td>
                <td className="border px-4 py-2">{item.cost} Gold</td>
                <td className="border px-4 py-2">
                  {item.level === fortLevel + 1 && item.fortLevelRequirement <= userLevel ? (
                    <button
                      type="button"
                      className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                      disabled={userLevel < item.fortLevelRequirement}
                      onClick={() => buyUpgrade('fortifications', index, forceUpdate)}
                    >
                      Buy
                    </button>
                  ) : (
                    item.level === fortLevel + 1 && <span>Unlock at level {item.levelRequirement}</span>
                  )}
                </td>
              </tr>
            );
          })}
      </tbody>
    </table></>
  );
};

export default OffenseUpgrade;
