import { Fortifications, HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';
import { Badge } from '@mantine/core';

const HousingTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
  forceUpdate,
}) => {
  const { user } = useUser();
  const colorScheme = user?.colorScheme;
  return (
    <table className="min-w-full table-auto bg-gray-900 text-white">
      <thead className="bg-gray-900 text-left">
        <tr>
          <th className='px-4 py-2'>Name</th>
          <th className='px-4 py-2'>Fort Req.</th>
          <th className='px-4 py-2'>Citizens Per Day</th>
          <th className='px-4 py-2'>Cost</th>
          <th className='px-4 py-2'>Action</th>
        </tr>
      </thead>
      <tbody>
        {Object.values(HouseUpgrades)
          .filter((item) => item.index <= userLevel + 2)
          .map((item, index) => (
            <tr key={`${item.index}`} className='odd:bg-table-odd even:bg-table-even'>
              <td className="px-4 py-2">
                {item.name} {index === userLevel && (
                  <Badge color={(colorScheme === "ELF") ?
                    'green' : (
                      colorScheme === 'GOBLIN' ? 'red' : (
                        colorScheme === 'UNDEAD' ? 'dark'
                          : 'blue'
                      ))} ml={5}>Owned</Badge>
                )}
              </td>
              <td className="px-4 py-2">
                {Fortifications.find((fort) => fort.level === item.fortLevel)
                  ?.name || 'Manor'}
              </td>
              <td className="px-4 py-2">{item.citizensDaily}</td>
              <td className="px-4 py-2">{toLocale(item.cost)} Gold</td>
              <td className="px-4 py-2">
                {item.index === userLevel + 1 &&
                  (item.fortLevel <= fortLevel ? (
                    // Buy button if fort level requirements are met
                    <button
                      type="button"
                      className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                      onClick={() => buyUpgrade('houses', index, forceUpdate)}
                    >
                      Buy
                    </button>
                  ) : (
                    // Display unlock information if fort level is not enough
                    <>
                      <div>Unlocked with:</div>
                      <div>
                        -{' '}
                        {
                          Fortifications.find(
                            (fort) => fort.level === item.fortLevel
                          )?.name
                        }
                      </div>
                    </>
                  ))}
                {/* Display unlock information for future upgrades */}
                {item.index > userLevel + 1 && (
                  <>
                    <div>Unlocked with:</div>
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
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
};

export default HousingTab;
