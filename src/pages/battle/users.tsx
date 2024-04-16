import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { getSession } from 'next-auth/react';
import React, { useEffect, useState } from 'react';

import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import toLocale from '@/utils/numberFormatting';
import { Table, Group, Avatar, Badge, Text, Indicator } from '@mantine/core';
import { skip } from 'rxjs';

const ROWS_PER_PAGE = 10;

const Users = ({ players, session, userPage, sortBy, sortDir }) => {
  const router = useRouter();
  const pathname = usePathname();
  const { user, forceUpdate } = useUser();
  const searchParams = useSearchParams()
  const initialPage = searchParams.get('page') || userPage;
  const [page, setPage] = useState(initialPage);
  // State to store Table.The formatted gold values
  
  
  const [formattedGolds, setFormattedGolds] = useState<string[]>([]);


  useEffect(() => {
    // Format Table.The gold values based on Table.The client's locale
    const golds = players.map(player => toLocale(player.gold, user?.locale));
    setFormattedGolds(golds);
  }, [players, user?.locale]);

  useEffect(() => {
    const newPage = parseInt(pathname as string) || userPage;
    setPage(newPage);
  }, [pathname, userPage]);

 

  const handleSort = (newSortBy) => {
    const newSortDir = sortBy === newSortBy && sortDir === 'desc' ? 'asc' : 'desc';
    router.push(`?sortBy=${newSortBy}&sortDir=${newSortDir}&page=1`);
  };


  return (
    <div className="mainArea pb-10">
      <h2>Attack</h2>
      <div className="overflow-x-auto">
        <Table.ScrollContainer minWidth={400}>
          <Table verticalSpacing={"sm"} striped highlightOnHover className="bg-gray-900 text-white text-left">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="px-1 py-1"><button onClick={() => handleSort('overallrank')}>Rank</button></Table.Th>
                <Table.Th className="px-4 py-2">Username</Table.Th>
                <Table.Th className="px-4 py-2"><button onClick={() => handleSort('gold')}>Gold {sortBy === 'gold' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</button></Table.Th>
                <Table.Th className="px-4 py-2">Army Size</Table.Th>
                <Table.Th className="px-4 py-2">Level</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {players.map((nplayer, index) => {
                const player = new UserModel(nplayer);
                if (player.id === user?.id) player.is_player = true;
                console.log(player);
                return (
                  <Table.Tr
                    key={player.id}
                    className={`${
                      player.is_player
                        ? 'bg-gray-500'
                        : 'odd:bg-table-odd even:bg-table-even'
                    }`}
                  >
                    <Table.Td className="px-2 py-2">{nplayer.overallrank}</Table.Td>
                    <Table.Td className="px-4 py-2">
                      <Group gap={'sm'} className="text-justify">
                        <Indicator color={player.is_online? 'teal':'red'}>
                          <Avatar src={player?.avatar} size={40} radius={40} />   
                        </Indicator>  
                        <div>
                          <Text fz="med" fw={500}>
                      <Link
                        href={`/userprofile/${player.id}`}
                        className="text-blue-500 hover:text-blue-700 font-bold"
                      >
                        {player.displayName}
                            </Link>
                            {player.is_player && <Badge color="blue" ml={5}>You</Badge>}

                          </Text>
                          <Text fz="xs" c="dimmed">
                            {player.race} {player.class}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td className="px-4 py-2">{toLocale(formattedGolds[index])}</Table.Td>
                    <Table.Td className="px-4 py-2">{toLocale(player.population)}</Table.Td>
                    <Table.Td className="px-4 py-2">{player.level}</Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </div>
      <div className="mt-4 flex justify-between">
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            console.log('page: ', page);
            console.log('typeof page: ', typeof page); 
            const newPage = Math.max(page - 1, 1);
            setPage(newPage);
            console.log('newPage: ', newPage);
            console.log('page: ', page);
            router.push(`?page=${newPage}&sortBy=${sortBy}&sortDir=${sortDir}`);
          }}
          disabled={page == 1}
        >
          Previous
        </button>
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = page + 1;
            setPage(newPage);
            router.push(`?page=${newPage}&sortBy=${sortBy}&sortDir=${sortDir}`);
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

// Inside your page component file

export const getServerSideProps = async (context) => {
  const session = await getSession(context);
  const { sortBy = 'overallrank', sortDir = 'asc', page = 1 } = context.query;
  try {
    let allUsers = await prisma.users.findMany({ where: { id: { not: 0 } } });
    allUsers.forEach(user => {
      const nowdate = new Date();
      const lastActiveTimestamp = new Date(user.last_active).getTime();
      const nowTimestamp = nowdate.getTime();

      user.isOnline = ((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
    });
    if (sortBy === 'overallrank') {
      allUsers.forEach(user => user.score = calculateUserScore(user, sortBy));
      allUsers.sort((a, b) => b.score - a.score);
    } else if (sortBy === 'gold') {
      allUsers = await prisma.users.findMany({ where: { id: { not: 0 } }, orderBy: { gold: sortDir } });
    }
    const userRank = allUsers.findIndex(user => user.id === session?.user.id) + 1;
    const userPage = Math.max(Math.ceil(userRank / ROWS_PER_PAGE), 1);

    let page = parseInt(context.query.page as string) || userPage;
    page = Math.max(page, 1);
    const skip = (page - 1) * ROWS_PER_PAGE;

    const players = allUsers.slice(skip, skip + ROWS_PER_PAGE);
    players.forEach((player, index) => player.overallrank = skip + index + 1);

    return { props: { players, session, userPage, sortBy, sortDir } };
  } catch (error) {
    console.error('Error fetching user data:', error);
  }
};



export default Users;
