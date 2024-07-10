import { EconomyUpgrades, Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';
import { Badge } from '@mantine/core';

const EconomyTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  forceUpdate,
  fortLevel,
}) => {
  const { user } = useUser();
  const colorScheme = user?.colorScheme;
  return (
    <table className="w-full table-auto bg-gray-800 text-white">
      <thead className="bg-gray-900 text-left">
        <tr>
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Fort Req.</th>
          <th className="px-4 py-2">Gold per Worker</th>
          <th className="px-4 py-2">Deposits per Day</th>
          <th className="px-4 py-2">Gold Transfer</th>
          <th className="px-4 py-2">Cost</th>
          <th className="px-4 py-2">Action</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(EconomyUpgrades)
          .filter((item) => item.index <= userLevel + 2)
          .map((item, index) => (
            <tr key={`${item.index}_${item.name}`} className='text-md odd:bg-table-odd even:bg-table-even'>
              <td className="px-2 py-1">
                {item.name} {index === userLevel && (
                  <Badge color={(colorScheme === "ELF") ?
                    'green' : (
                      colorScheme === 'GOBLIN' ? 'red' : (
                        colorScheme === 'UNDEAD' ? 'dark'
                          : 'blue'
                      ))} ml={5}>Owned</Badge>
                )}
              </td>
              <td className="px-2 py-1">
                {Fortifications.find((fort) => fort.level === item.fortLevel)
                  ?.name || 'Manor'}
              </td>
              <td className="px-2 py-1">{item.goldPerWorker}</td>
              <td className="px-2 py-1">{item.depositsPerDay}</td>
              <td className="px-2 py-1">
                {toLocale(item.goldTransferTx)}/{toLocale(item.goldTransferRec)}
              </td>
              <td className="px-2 py-1">{toLocale(item.cost)}</td>
              <td className="px-2 py-1">
                {item.index === userLevel + 1 &&
                  item.fortLevel <= fortLevel && (
                    <button
                      type="button"
                      className="w-full rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                      onClick={() => buyUpgrade('economy', index, forceUpdate)}
                    >
                      Buy
                    </button>
                  )}
                {item.index > userLevel && (
                  <>
                    {fortLevel <= item.fortLevel && (
                      <>
                        <div>Unlocked with Fort:</div>
                        <div>
                          -{' '}
                          {
                            Fortifications.find(
                              (fort) => fort.level === item.fortLevel
                            )?.name
                          }
                        </div>
                      </>
                    )}
                    {userLevel >= item.index && (
                      <>
                        <div>Unlocked with Economy:</div>
                        <div>
                          -{' '}
                          {
                            EconomyUpgrades.find(
                              (eco) => eco.index === item.index
                            )?.name
                          }
                        </div>
                      </>
                    )}
                  </>
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
};

export default EconomyTab;
