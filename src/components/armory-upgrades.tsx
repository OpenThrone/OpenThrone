import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import { ArmoryUpgrades, Fortifications } from '@/constants';
import ItemSection from './itemsection';

const ArmoryUpgradesTab = ({ userLevel, fortLevel, forceUpdate }) => {
  console.log("ArmoryTab", userLevel, fortLevel)
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
        {Object.values(ArmoryUpgrades)
          .filter(
            (item) =>
              (item.level) <= fortLevel + 2
          )
          .map((item, index) => (
            <tr key={index}>
              <td className="border px-4 py-2">{item.name} {(item.level === fortLevel) && ("(Current Upgrade)")}</td>
              <td className="border px-4 py-2">{item.fortLevel}</td>
              <td className="border px-4 py-2">Level {item.level} Armory items</td>
              <td className="border px-4 py-2">{item.cost} Gold</td>
              <td className="border px-4 py-2">
                {item.fortLevel >= userLevel && item.level === fortLevel + 1 ? (
                  <button
                    type="button"
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    disabled={userLevel < item.fortLevel}
                    onClick={() => buyUpgrade('armory', index, forceUpdate)}
                  >
                    Buy
                  </button>
                ) : (
                    <span></span>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table></>
  );

};

export default ArmoryUpgradesTab;