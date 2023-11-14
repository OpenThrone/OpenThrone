import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import { EconomyUpgrades, HouseUpgrades } from '@/constants';

const HousingTab = ({ userLevel, fortLevel, forceUpdate }) => {
  return (
    <><table className="w-full">
      <thead className="text-left">
        <tr>
          <th>Name</th>
          <th>Fort Level Req.</th>
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
              <td className="border px-4 py-2">{item.name} {(index) === userLevel && ("(Current Upgrade)")}</td>
              <td className="border px-4 py-2">{item.fortLevel}</td>
              <td className="border px-4 py-2">{item.citizensDaily}</td>
              <td className="border px-4 py-2">{item.cost} Gold</td>
              <td className="border px-4 py-2">
                {(item.index) === userLevel + 1 && item.fortLevel === fortLevel && (
                  <button
                    type="button"
                    className={"bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"}
                    disabled={(item.fortLevel !== fortLevel && item.index !== userLevel)}
                    onClick={() => buyUpgrade('houses', index, forceUpdate)}
                  >
                    Buy
                  </button>
                )}
                {item.index > userLevel && (
                  <>
                    {fortLevel <= item.fortLevel && (
                      <>
                        <div>Unlocked with:</div>
                        <div>- Fortification Name, Level {item.fortLevel}</div>
                      </>
                    )}
                    {userLevel >= item.index && (
                      <>
                        <div>Unlocked with:</div>
                        <div>- Housing Name, Level {item.index}</div>
                      </>
                    )}
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