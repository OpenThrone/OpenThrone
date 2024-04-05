import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getSession } from 'next-auth/react';
import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import toLocale from '@/utils/numberFormatting';

const ROWS_PER_PAGE = 10;

const Users = ({ players, session, userPage }) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, forceUpdate } = useUser();
  const initialPage = parseInt(pathname as string) || userPage;
  const [page, setPage] = useState(initialPage);
  // State to store the formatted gold values
  const [formattedGolds, setFormattedGolds] = useState<string[]>([]);

  useEffect(() => {
    // Format the gold values based on the client's locale
    const golds = players.map(player => toLocale(player.gold, user?.locale));
    setFormattedGolds(golds);
  }, [players, user?.locale]);

  useEffect(() => {
    const newPage = parseInt(pathname as string) || userPage;
    setPage(newPage);
  }, [pathname, userPage]);

  return (
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
            {players.map((nplayer, index) => {
              const player = new UserModel(nplayer);
              if (player.id === user?.id) player.is_player = true;

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
                  <td className="px-4 py-2">{formattedGolds[index]}</td>
                  <td className="px-4 py-2">{toLocale(player.population)}</td>
                  <td className="px-4 py-2">{player.level}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-center">
                      <img
                        src={`/assets/shields/${player.race}_25x25.webp`}
                        className="ml-2"
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex justify-between">
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = Math.max(page - 1, 1);
            setPage(newPage);
            router.push(`?page=${newPage}`);
          }}
          disabled={page === 1}
        >
          Previous
        </button>
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = page + 1;
            setPage(newPage);
            router.push(`?page=${newPage}`);
          }}
          disabled={players.length < ROWS_PER_PAGE}
        >
          Next
        </button>
      </div>
    </div>
  );
};

const calculateUserScore = (user) => {
  const unitScore = user.units
    ? user.units.map((unit) => unit.quantity).reduce((a, b) => a + b, 0)
    : 0;
  const itemScore = user.items
    ? user.items.map((item) => item.quantity * (item.level * 0.1)).reduce((a, b) => a + b, 0)
    : 0;

  return 0.7 * user.experience +
    0.2 * user.fort_level +
    0.1 * user.house_level +
    0.4 * unitScore +
    0.3 * itemScore;
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);

  try {
    const allUsers = await prisma.users.findMany({ where: { id: { not: 0 } } });
    allUsers.forEach(user => user.score = calculateUserScore(user));

    allUsers.sort((a, b) => b.score - a.score);

    const userRank = allUsers.findIndex(user => user.id === session?.user.id) + 1;
    const userPage = Math.max(Math.ceil(userRank / ROWS_PER_PAGE), 1);

    let page = parseInt(context.query.page as string) || userPage;
    page = Math.max(page, 1);
    const skip = (page - 1) * ROWS_PER_PAGE;

    const players = allUsers.slice(skip, skip + ROWS_PER_PAGE);
    players.forEach((player, index) => player.overallrank = skip + index + 1);

    return { props: { players, session, userPage } };
  } catch (error) {
    console.error('Error fetching user data:', error);
  }
};


export default Users;
