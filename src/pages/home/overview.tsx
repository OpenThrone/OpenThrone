import Alert from '@/components/alert';
import NewsAccordion from '@/components/newsAccordion';
import { useUser } from '@/context/users';
import { toLocale } from '@/utils/numberFormatting';
import { useEffect, useState } from 'react';

const Overview = () => {
  // const router = useRouter();
  const [getNews, setNews] = useState(['no news']);
  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/blog/getRecentPosts');
        console.log('response: ', response);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        console.log('data: ', data);
        setNews(data);
      } catch (error) {
        console.error('Failed to fetch news:', error);
      }
    };

    fetchNews();
  }, []);
  
  const { user } = useUser();
  return (
    <div className="mainArea pb-10">
      <h2>Overview</h2>
      <div className="container mx-auto">
        <p className="text-center">
          <span className="text-white">{user?.displayName}</span> is a{user?.race === 'ELF' || user?.race === 'UNDEAD' ? 'n ' : ' '}
          {user?.race} {user?.class}
        </p>
        <div className="my-5 flex justify-between">
          <Alert />
        </div>
        <p className="text-center">
          Share this link to gain up to 25 citizens per day:{' '}
          <a
            href={`https://OpenThrone.dev/recruit/${user?.recruitingLink}`}
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
              <td>{toLocale(user?.population, user?.locale)}</td>
              <td>Fort Health</td>
              <td>
                {user?.fortHealth.current}/{user?.fortHealth.max}(
                {user?.fortHealth.percentage}%)
              </td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Army Size</td>
              <td>{toLocale(user?.armySize, user?.locale)}</td>
              <td>Gold</td>
              <td>{toLocale(user?.gold, user?.locale)}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Level</td>
              <td>{toLocale(user?.level, user?.locale)}</td>
              <td>Gold Per Turn</td>
              <td>{toLocale(user?.goldPerTurn, user?.locale)}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>XP to Next Level</td>
              <td>{toLocale(user?.xpToNextLevel, user?.locale)}</td>
              <td>Gold in Bank</td>
              <td>{toLocale(user?.goldInBank, user?.locale)}</td>
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
              <td>{user ? toLocale(user.offense) : '0'}</td>
              <td>Attacks Won</td>
              <td>{user ? toLocale(user.attacksWon) : '0'}</td>
            </tr>

            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Defense</td>
              <td>{toLocale(user?.defense)}</td>
              <td>Defends Won</td>
              <td>{toLocale(user?.defendsWon)}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Spy Offense</td>
              <td>{toLocale(user?.spy)}</td>
              <td>Spy Victories</td>
              <td>{toLocale(user?.spyVictories)}</td>
            </tr>
            <tr className="odd:bg-table-odd even:bg-table-even">
              <td>Spy Defense</td>
              <td>{toLocale(user?.sentry)}</td>
              <td>Sentry Victories</td>
              <td>{toLocale(user?.sentryVictories)}</td>
            </tr>
          </tbody>
        </table>

        <h1 className="text-2xl font-bold">Recent News</h1>
        <NewsAccordion news={getNews} />
      </div>
    </div>
  );
};

export default Overview;
