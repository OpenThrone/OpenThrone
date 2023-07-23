import Link from 'next/link';
import { getSession } from 'next-auth/react';

import Layout from '@/components/Layout';
import { Meta } from '@/layouts/Meta';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';

const Users = ({ players, session }) => {
  // const router = useRouter();
  // console.log(players);
  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
      <div className="mainArea pb-10">
        <h2>Attack</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto bg-gray-900 text-white">
            <thead>
              <tr>
                <th className="px-4 py-2">Rank</th>
                <th className="px-4 py-2">Username</th>
                <th className="px-4 py-2">Gold</th>
                <th className="px-4 py-2">Army Size</th>
                <th className="px-4 py-2">Level</th>
                <th className="px-4 py-2">Race</th>
              </tr>
            </thead>
            <tbody>
              {players.map((nplayer) => {
                const player = new UserModel(nplayer);
                if (player.id === session?.player.id) player.is_player = true;

                return (
                  <tr
                    key={player.id}
                    className={`${
                      player.is_player
                        ? 'bg-gray-500'
                        : 'odd:bg-table-odd even:bg-table-even'
                    } text-center`}
                  >
                    <td className="px-4 py-2">{nplayer.overallrank}</td>
                    <td className="px-4 py-2">
                      <Link
                        href={`/userprofile/${player.id}`}
                        className="text-blue-500 hover:text-blue-700"
                      >
                        {player.displayName}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      {player.gold.toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{player.kingdomSize}</td>
                    <td className="px-4 py-2">{player.level}</td>
                    <td className="px-4 py-2">{player.race}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
};

export const getServerSideProps = async (context: any) => {
  const session = await getSession(context);

  // Fetch the ranks for all players
  const players = await prisma.users.findMany({
    orderBy: [
      {
        experience: 'desc',
      },
      {
        display_name: 'asc',
      },
    ],
  });

  // Add the overallrank field
  for (let i = 0; i < players.length; i += 1) {
    players[i].overallrank = i + 1;
  }

  return { props: { players, session } };
};

export default Users;
