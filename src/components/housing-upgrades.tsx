import buyUpgrade from '@/utils/buyStructureUpgrade';
import { Fortifications, HouseUpgrades } from '@/constants';
import toLocale from '@/utils/numberFormatting';
import { BattleUpgradeProps } from '@/types/typings';

const HousingTab: React.FC<BattleUpgradeProps> = ({ userLevel, fortLevel, forceUpdate }) => {
  return (
    <><table className="w-full">
      <thead className="text-left">
        <tr>
          <th>Name</th>
          <th>Fort Req.</th>
          <th>Citizens Per Day</th>
          <th>Cost</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(HouseUpgrades)
          .filter(
            (item) =>
              (item.index) <= userLevel + 2
          )
          .map((item, index) => (
            <tr key={index}>
              <td className="border px-4 py-2">{item.name} {(index) === userLevel && "(Current Upgrade)"}</td>
              <td className="border px-4 py-2">{Fortifications.find((fort) => fort.level === item.fortLevel)?.name || 'Manor'}</td>
              <td className="border px-4 py-2">{item.citizensDaily}</td>
              <td className="border px-4 py-2">{toLocale(item.cost)} Gold</td>
              <td className="border px-4 py-2">
                {/* Check if the item is the next available upgrade */}
                {item.index === userLevel + 1 && (
                  <>
                    {item.fortLevel <= fortLevel ? (
                      // Buy button if fort level requirements are met
                      <button
                        type="button"
                        className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                        onClick={() => buyUpgrade('houses', index, forceUpdate)}
                      >
                        Buy
                      </button>
                    ) : (
                      // Display unlock information if fort level is not enough
                      <>
                        <div>Unlocked with:</div>
                          <div>- {Fortifications.find((fort) => fort.level === item.fortLevel)?.name}</div>
                      </>
                    )}
                  </>
                )}
                {/* Display unlock information for future upgrades */}
                {item.index > userLevel + 1 && (
                  <>
                    <div>Unlocked with:</div>
                    <div>- {Fortifications.find((fort) => fort.level === item.fortLevel)?.name}</div>
                  </>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table></>
  );

};

export default HousingTab;