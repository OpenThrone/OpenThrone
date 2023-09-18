import { HouseUpgrades } from '@/constants';
import { useUser } from '@/context/users';

const Housing = () => {
  const { user } = useUser();
  return (
    <div className="mainArea pb-10">
      <h2>Housing</h2>
      <div className="my-5 flex justify-around">
        <p className="mb-0">
          Gold On Hand: <span>{parseInt(user?.gold).toLocaleString()}</span>
        </p>
        <p className="mb-0">
          Banked Gold:{' '}
          <span>{parseInt(user?.goldInBank).toLocaleString()}</span>
        </p>
      </div>
      <div className="my-5 flex justify-center">
        <table className="my-4 w-10/12 table-auto text-white">
          <thead>
            <tr className="odd:bg-table-even even:bg-table-odd">
              <th colSpan={4}>Housing</th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-table-odd even:bg-table-even">
              Current Housing Level:{' '}
              <span className="text-yellow-600">
                {HouseUpgrades[user?.houseLevel ?? 1].name}{' '}
              </span>
              <br />
              <sub className="text-gray-400">
                To upgrade your housing, visit the structure upgrades page.
              </sub>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              New Citizens Per Day:{' '}
              <span className="text-yellow-600">
                {HouseUpgrades[user?.houseLevel ?? 0].citizensDaily}
              </span>
              <br />
              <sub className="text-gray-400">
                Housing brings new citizens to your fortification every day.
                <br />
                You will gain a new citizen every day at midnight DC time.
              </sub>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};
export default Housing;
