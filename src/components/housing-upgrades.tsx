import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import { EconomyUpgrades, HouseUpgrades } from '@/constants';

const HousingTab = ({ userLevel, forceUpdate }) => {
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
              (item.fortLevel) <= userLevel + 4
          )
          .map((item, index) => (
            <tr key={index}>
              <td>{item.name} {(index) === userLevel && ("(Current Upgrade)")}</td>
              <td>{item.fortLevel}</td>
              <td>{item.citizensDaily}</td>
              <td>{item.cost} Gold</td>
              <td>
                {(item.fortLevel) === userLevel + 1 && (
                  <button type="button" className={"bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"} onClick={() => buyUpgrade(currentPage, index, forceUpdate)}>Buy</button>
                )}
                {( item.fortLevel) === userLevel + 2 && (
                  <span>Unlock at level {userLevel + 1}</span>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table></>
  );

};

export default HousingTab;