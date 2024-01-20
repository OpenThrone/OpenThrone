import { Fortifications } from '@/constants';
import { useUser } from '@/context/users';
import type { BattleUpgradeProps } from '@/types/typings';
import buyUpgrade from '@/utils/buyStructureUpgrade';
import toLocale from '@/utils/numberFormatting';

const FortificationsTab: React.FC<BattleUpgradeProps> = ({
  userLevel,
  fortLevel,
}) => {
  const { forceUpdate, user } = useUser();
  return (
    <table className="w-full table-fixed">
      <thead className="text-left">
        <tr>
          <th className="w-60">Name</th>
          <th className="w-20">Level Req.</th>
          <th className="w-60">Bonus</th>
          <th className="w-40">Cost</th>
          <th className="w-full">Action</th>
        </tr>
      </thead>
      <tbody className="">
        {Object.values(Fortifications)
          .filter((item) => item.level <= fortLevel + 2)
          .map((item, index) => (
            <tr key={`${item.level}_${item.name}`}>
              <td className="border px-4 py-2">
                {item.name} {item.level === fortLevel && '(Current Upgrade)'}
              </td>
              <td className="border px-4 py-2">{item.levelRequirement}</td>
              <td className="border px-4 py-2">
                Gold Per Turn: {toLocale(item.goldPerTurn, user?.locale)}
                <br />
                Defense Bonus: {item.defenseBonusPercentage}%
              </td>
              <td className="border px-4 py-2">
                {toLocale(item.cost, user?.locale)} Gold
              </td>
              <td className="border px-4 py-2">
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
