import { useUser } from '@/context/users';

const Overview = () => {
  // const router = useRouter();

  const { user } = useUser();

  return (
    <div className="mainArea pb-10">
      <h2>Overview</h2>
      <div className="container mx-auto">
        <p className="text-center">
          <span className="text-white">{user?.displayName}</span> is a{' '}
          {user?.race} {user?.class}
        </p>
        <p className="text-center">
          Share this link to gain up to 25 citizens per day:{' '}
          <a
            href={`https://darkcurse.dev/recruit/${user?.recruitingLink}`}
            className="text-blue-500"
          >
            {user?.recruitingLink}
          </a>
        </p>

        <table className="my-4 w-full table-auto text-white">
          <thead>
            <tr className="odd:bg-table-even even:bg-table-odd">
              <th colSpan={4}>Statistics</th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Population</td>
              <td>{user?.population}</td>
              <td>Fort Health</td>
              <td>
                {user?.fortHealth.current}/{user?.fortHealth.max}(
                {user?.fortHealth.percentage}%)
              </td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Army Size</td>
              <td>{user?.armySize}</td>
              <td>Gold</td>
              <td>{user?.gold}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Level</td>
              <td>{user?.level}</td>
              <td>Gold Per Turn</td>
              <td>{user?.goldPerTurn}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>XP to Next Level</td>
              <td>{user?.xpToNextLevel}</td>
              <td>Gold in Bank</td>
              <td>{user?.goldInBank}</td>
            </tr>
          </tbody>
        </table>

        <table className="my-4 w-full table-auto text-white">
          <thead>
            <tr className="odd:bg-table-even even:bg-table-odd">
              <th colSpan={4}>War Statistics</th>
            </tr>
          </thead>
          <tbody>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Offense</td>
              <td>{user?.offense}</td>
              <td>Attacks Won</td>
              <td>{user?.attacks_made}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Defense</td>
              <td>{user?.defense}</td>
              <td>Defends Won</td>
              <td />
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Spy Offense</td>
              <td>{user?.spy}</td>
              <td>Spy Victories</td>
              <td>{user?.spyVictories}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Spy Defense</td>
              <td>{user?.sentry}</td>
              <td>Sentry Victories</td>
              <td>{user?.sentryVictories}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Overview;
