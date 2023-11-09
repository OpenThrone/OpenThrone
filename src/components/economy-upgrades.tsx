import buyUpgrade from '@/utils/buyStructureUpgrade';
import { useUser } from '@/context/users';
import { EconomyUpgrades, Fortifications } from '@/constants';

const EconomyTab = ({ userLevel, forceUpdate }) => {
  console.log('Economy: ',userLevel+2)
  return (
    <><table className="w-full">
      <thead className='text-left'>
        <tr>
          <th className="w-46">Name</th>
          <th className='w-20'>Fort Level Req.</th>
          <th className='w-20'>Gold per Worker</th>
          <th className='w-20'>Deposits per Day</th>
          <th>Gold Transfer</th>
          <th>Cost</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(EconomyUpgrades)
          .filter(
            (item) =>
              (item.fortLevel) <= userLevel + 2
          )
          .map((item, index) => (
            <tr key={index}>
              <td>{item.name} {index === userLevel && ("(Current Upgrade)")}</td>
              <td>{item.fortLevel}</td>
              <td>{item.goldPerWorker}</td>
              <td>{item.depositsPerDay}</td>
              <td>{item.goldTransferTx}/{item.goldTransferRec}</td>
              <td>{item.cost}</td>
              <td>
                {index === userLevel + 1 && (
                  <button type="button" className={"bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"} onClick={() => buyUpgrade(currentPage, index, forceUpdate)}>Buy</button>
                )}
                {index === userLevel + 2 && (
                  <span>Unlock at level {userLevel + 1}</span>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table></>
  );

};

export default EconomyTab;