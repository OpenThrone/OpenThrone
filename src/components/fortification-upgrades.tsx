import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';
import { Badge } from '@mantine/core';

const FortificationsTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
}) => {
  const { forceUpdate, user } = useUser();
  const colorScheme = user?.colorScheme;
  return (
    <table className="min-w-full table-auto bg-gray-900 text-white">
      <thead className="text-left">
        <tr>
          <th className="px-4 py-2">Name</th>
          <th className="px-4 py-2">Level Req.</th>
          <th className="px-4 py-2">Bonus</th>
          <th className="px-4 py-2">Cost</th>
          <th className="px-4 py-2">Action</th>
        </tr>
      </thead>
      <tbody className="">
        {Object.values(Fortifications)
          .filter((item) => item.level <= fortLevel + 2)
          .map((item, index) => (
            <tr key={`${item.level}_${item.name}`} className='odd:bg-table-odd even:bg-table-even'>
              <td className="px-4 py-2">
                {item.name} {item.level === fortLevel && (
                  <Badge color={(colorScheme === "ELF") ?
                    'green' : (
                      colorScheme === 'GOBLIN' ? 'red' : (
                        colorScheme === 'UNDEAD' ? 'dark'
                          : 'blue'
                      ))} ml={5}>Owned</Badge>
                )}
              </td>
              <td className="px-4 py-2">{item.levelRequirement}</td>
              <td className="px-4 py-2">
                Gold Per Turn: {toLocale(item.goldPerTurn, user?.locale)}
                <br />
                Defense Bonus: {item.defenseBonusPercentage}%
                <br />
                Max HP: {toLocale(item.hitpoints, user?.locale)}
              </td>
              <td className="px-4 py-2">
                {toLocale(item.cost, user?.locale)} Gold
              </td>
              <td className="px-4 py-2">
                {item.level === fortLevel + 1 &&
                item.levelRequirement <= userLevel ? (
                  <button
                    type="button"
                    className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
                    disabled={userLevel < item.levelRequirement}
                    onClick={() =>
                      buyUpgrade('fortifications', index, forceUpdate)
                    }
                  >
                    Buy
                  </button>
                ) : (
                  item.level === fortLevel + 1 && (
                    <span>Unlock at level {item.levelRequirement}</span>
                  )
                )}
              </td>
            </tr>
          ))}
      </tbody>
    </table>
  );
};

export default FortificationsTab;
