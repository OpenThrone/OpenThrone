import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import React, { useEffect, useState } from 'react';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import toLocale from '@/utils/numberFormatting';
import { Table, Group, Avatar, Badge, Text, Indicator } from '@mantine/core';
import { InferGetServerSidePropsType } from "next";

const ROWS_PER_PAGE = 10;

const Users = ({ allUsers }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useUser();
  const colorScheme = user?.colorScheme;
  const [page, setPage] = useState(parseInt(searchParams.get('page')) || 1);
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'overallrank');
  const [sortDir, setSortDir] = useState(searchParams.get('sortDir') || 'asc');
  const [players, setPlayers] = useState([]);
  const [formattedGolds, setFormattedGolds] = useState<string[]>([]);

  useEffect(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
    let sortedPlayers = [...allUsers];

    if (sortBy === 'overallrank') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? b.rank - a.rank : a.rank - b.rank);
    } else if (sortBy === 'gold') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? Number(a.gold) - Number(b.gold) : Number(b.gold) - Number(a.gold));
    } else if (sortBy === 'population') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? Number(a.population) - Number(b.population) : Number(b.population) - Number(a.population));
    } else if (sortBy === 'level') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? Number(a.experience) - Number(b.experience) : Number(b.experience) - Number(a.experience));
    }

    const paginatedPlayers = sortedPlayers.slice(start, end);
    paginatedPlayers.forEach((player, index) => player.overallrank = (sortDir === 'asc' ? start + index + 1 : allUsers.length - start - index));

    setPlayers(paginatedPlayers);
  }, [page, sortBy, sortDir, allUsers]);

  useEffect(() => {
    const golds = players.map(player => toLocale(player.gold, user?.locale));
    setFormattedGolds(golds);
  }, [players, user?.locale]);

  const handleSort = (newSortBy) => {
    const newSortDir = sortBy === newSortBy && sortDir === 'desc' ? 'asc' : 'desc';
    setSortBy(newSortBy);
    setSortDir(newSortDir);
    setPage(1);
    router.push(`?sortBy=${newSortBy}&sortDir=${newSortDir}&page=1`);
  };

  useEffect(() => {
    const loggedInPlayerIndex = allUsers.findIndex((player) => player.id === user?.id);
    if (loggedInPlayerIndex !== -1 && !searchParams.get('page') && !searchParams.get('sortBy') && !searchParams.get('sortDir')) {
      const newPage = Math.floor(loggedInPlayerIndex / ROWS_PER_PAGE) + 1;
      setPage(newPage);
      router.push(`?page=${newPage}&sortBy=${sortBy}&sortDir=${sortDir}`);
    }
  }, [user, allUsers, sortBy, sortDir, router, searchParams]);

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Attack</h2>
      <div className="overflow-x-auto">
        <Table.ScrollContainer minWidth={400}>
          <Table verticalSpacing={"sm"} striped highlightOnHover className="bg-gray-900 text-white text-left">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="px-1 py-1"><button onClick={() => handleSort('overallrank')}>Rank</button></Table.Th>
                <Table.Th className="px-4 py-2">Username</Table.Th>
                <Table.Th className="px-4 py-2"><button onClick={() => handleSort('gold')}>Gold {sortBy === 'gold' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</button></Table.Th>
                <Table.Th className="px-4 py-2"><button onClick={() => handleSort('population')}> Population {sortBy === 'population' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</button></Table.Th>
                <Table.Th className="px-4 py-2"><button onClick={() => handleSort('level')}> Level{sortBy === 'level' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</button></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {players.map((nplayer, index) => {
                const player = new UserModel(nplayer);
                if (player.id === user?.id) player.is_player = true;
                return (
                  <Table.Tr
                    key={player.id}
                    className={`${player.is_player
                      ? 'bg-gray-500'
                      : 'odd:bg-table-odd even:bg-table-even'
                      }`}
                  >
                    <Table.Td className="px-2 py-2">{nplayer.overallrank}</Table.Td>
                    <Table.Td className="px-4 py-2">
                      <Group gap={'sm'} className="text-justify">
                        <Indicator color={player.is_online ? 'teal' : 'red'}>
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
                            {player.is_player && <Badge color={(colorScheme === "ELF") ?
                              'green' : (
                                colorScheme === 'GOBLIN' ? 'red' : (
                                  colorScheme === 'UNDEAD' ? 'dark'
                                    : 'blue'
                                ))} ml={5}>You</Badge>}
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
            const newPage = Math.max(page - 1, 1);
            setPage(newPage);
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


export const getServerSideProps = async () => {
  try {
    let allUsers = await prisma.users.findMany({ where: { AND: [{ id: { not: 0 } }, { last_active: { not: null } }] } } );
    allUsers.forEach(user => {
      const nowdate = new Date();
      const lastActiveTimestamp = new Date(user.last_active).getTime();
      const nowTimestamp = nowdate.getTime();
      const population = user.units.reduce((acc, unit) => acc + unit.quantity, 0);
      user.population = population;
      user.isOnline = ((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
    });
    allUsers.sort((a, b) => a.rank - b.rank);
    return { props: { allUsers } };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { props: { allUsers: [] } };
  }
};

export default Users;
