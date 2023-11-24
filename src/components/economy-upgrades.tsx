import buyUpgrade from '@/utils/buyStructureUpgrade';
import { EconomyUpgrades, Fortifications } from '@/constants';
import toLocale from '@/utils/numberFormatting';
import { BattleUpgradeProps } from '@/types/typings';

const EconomyTab: React.FC<BattleUpgradeProps> = ({ userLevel, forceUpdate, fortLevel }) => {
  console.log('Economy: ', userLevel)
  console.log('Fort: ', fortLevel)
  return (
    <><table className="w-full table-auto">
      <thead className='text-left'>
        <tr>
          <th className="w-46 px-2">Name</th>
          <th className='w-20 px-2'>Fort Req.</th>
          <th className='w-20 px-2'>Gold per Worker</th>
          <th className='w-20 px-2'>Deposits per Day</th>
          <th>Gold Transfer</th>
          <th>Cost</th>
          <th>Action</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(EconomyUpgrades)
          .filter((item) => item.index <= userLevel + 2)
          .map((item, index) => (
            <tr key={index}>
              <td className="border px-2 py-1">
                {item.name} {index === userLevel && ("(Current Upgrade)")}
              </td>
              <td className="border px-2 py-1">{Fortifications.find((fort) => fort.level === item.fortLevel)?.name || 'Manor'}</td>
              <td className="border px-2 py-1">{item.goldPerWorker}</td>
              <td className="border px-2 py-1">{item.depositsPerDay}</td>
              <td className="border px-2 py-1">{toLocale(item.goldTransferTx)}/{toLocale(item.goldTransferRec)}</td>
              <td className="border px-2 py-1">{toLocale(item.cost)}</td>
              <td className="border px-2 py-1">
                {(item.index === userLevel + 1 && item.fortLevel <= fortLevel) && (
                  <button
                    type="button"
                    className={"bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded w-full"}
                    onClick={() => buyUpgrade('economy', index, forceUpdate)}
                  >
                    Buy
                  </button>
                )}
                {item.index > userLevel  && (
                  <>
                    {fortLevel <= item.fortLevel && (
                      <>
                        <div>Unlocked with Fort:</div>
                        <div>- {Fortifications.find((fort)=>fort.level === item.fortLevel)?.name}</div>
                      </>
                    )}
                    {userLevel >= item.index && (
                      <>
                        <div>Unlocked with Economy:</div>
                        <div>- {EconomyUpgrades.find((eco)=> eco.index === item.index)?.name}</div>
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

export default EconomyTab;