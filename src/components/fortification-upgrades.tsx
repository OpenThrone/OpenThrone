import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import { Fortifications } from '@/constants';

const FortificationsTab = ({ userLevel, fortLevel, forceUpdate }) => {
  console.log("FortificationsTab", userLevel, fortLevel)
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
        {Object.values(Fortifications)
          .filter(
            (item) =>
              (item.level) <= fortLevel + 2
          )
          .map((item, index) => (
            <tr key={index}>
              <td>{item.name} {(item.level === fortLevel) && ("(Current Upgrade)")}</td>
              <td>{item.levelRequirement}</td>
              <td>Gold Per Turn: {item.goldPerTurn}<br />Defense Bonus: {item.defenseBonusPercentage}%</td>
              <td>{item.cost} Gold</td>
              <td>
                {item.level === fortLevel + 1 && item.levelRequirement <= userLevel ? (
                  <button
                    type="button"
                    className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
                    disabled={userLevel < item.levelRequirement}
                    onClick={() => buyUpgrade(currentPage, index, forceUpdate)}
                  >
                    Buy
                  </button>
                ) : (
                  item.level === fortLevel + 1 && <span>Unlock at level {item.levelRequirement}</span>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table></>
  );

};

export default FortificationsTab;