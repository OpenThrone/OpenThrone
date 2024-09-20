import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import React, { useEffect, useState } from 'react';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import toLocale from '@/utils/numberFormatting';
import { Table, Group, Avatar, Badge, Text, Indicator, Pagination, Center, Button, Paper, Pill, useMantineTheme } from '@mantine/core';
import { InferGetServerSidePropsType } from "next";
import { usePagination } from '@mantine/hooks';

const Users = ({ allUsers }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const searchParams = useSearchParams();
  const { user } = useUser();
  const colorScheme = user?.colorScheme;
  const [page, setPage] = useState(parseInt(searchParams.get('page')) || 1);
  const [lastPage, setLastPage] = useState(1);
  const [sortBy, setSortBy] = useState(searchParams.get('sortBy') || 'level');
  const [sortDir, setSortDir] = useState(searchParams.get('sortDir') || 'desc');
  const [players, setPlayers] = useState([]);
  const [formattedGolds, setFormattedGolds] = useState<string[]>([]);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [attackRangeMin, setAttackRangeMin] = useState(1);
  const [attackRangeMax, setAttackRangeMax] = useState(5);
  const [hasSetPageInitially, setHasSetPageInitially] = useState(false);
  const [myPage, setMyPage] = useState(1);
  const [myRank, setMyRank] = useState(1);
  const pagination = usePagination({ total: lastPage, initialPage: 1 });
  const theme = useMantineTheme();

  const getRankLabel = () => {
    switch (sortBy) {
      case 'gold':
        return 'Gold Rank';
      case 'level':
        return 'Lvl Rank';
      case 'population':
        return 'Pop Rank';
      default:
        return 'Rank';
    }
  };

  useEffect(() => {
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    let sortedPlayers = [...allUsers];
    setLastPage(Math.ceil(allUsers.length / rowsPerPage));

    // Fallback for users where the rank hasn't been calculated yet (and is therefore 0 or null)
    sortedPlayers.forEach((u) => u.rank = u.rank || Infinity);

    // Sorting logic
    if (sortBy === 'gold') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? Number(b.gold) - Number(a.gold) : Number(a.gold) - Number(b.gold));
    } else if (sortBy === 'population') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? Number(b.population) - Number(a.population) : Number(a.population) - Number(b.population));
    } else if (sortBy === 'level') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? Number(b.experience) - Number(a.experience) : Number(a.experience) - Number(b.experience));
    }

    // Recalculate the page of the logged-in player
    const loggedInPlayerIndex = sortedPlayers.findIndex((player) => player.id === user?.id);
    const playerPage = Math.floor(loggedInPlayerIndex / rowsPerPage) + 1;

    const paginatedPlayers = sortedPlayers.slice(start, end);
    paginatedPlayers.forEach((player, index) => player.overallrank = (sortDir === 'asc' ? allUsers.length - start - index : start + index + 1));

    setPlayers(paginatedPlayers);

    setMyPage(playerPage);
    setMyRank(loggedInPlayerIndex + 1);

  }, [page, sortBy, sortDir, allUsers, rowsPerPage]);


  useEffect(() => {
    const golds = players.map(player => toLocale(player.gold, user?.locale));
    setFormattedGolds(golds);
  }, [players, user?.locale]);

  useEffect(() => {
    setAttackRangeMax(user?.attackRange.max);
    setAttackRangeMin(user?.attackRange.min);
  }, [user?.attackRange]);

  const handleSort = (newSortBy) => {
    const newSortDir = sortBy === newSortBy && sortDir === 'desc' ? 'asc' : 'desc';
    setSortBy(newSortBy);
    setSortDir(newSortDir);
    setPage(1);
  };

  useEffect(() => {
    if(user){
      if (!hasSetPageInitially) {
        const pageParam = searchParams.get('page');
        const sortByParam = searchParams.get('sortBy');
        const sortDirParam = searchParams.get('sortDir');

        if (!pageParam && !sortByParam && !sortDirParam) {
          const loggedInPlayerIndex = allUsers.findIndex((player) => player.id === user?.id);
          
          if (loggedInPlayerIndex !== -1) {
            const newPage = Math.floor(loggedInPlayerIndex / rowsPerPage) + 1;
            setPage(newPage);
          }
        } else {
          const initialPage = parseInt(pageParam) || 1;
          setPage(initialPage);
          setSortBy(sortByParam || 'level');
          setSortDir(sortDirParam || 'asc');
        }

        // Mark the initial setting as complete
        setHasSetPageInitially(true);
      }
    }
  }, [user, allUsers, searchParams, rowsPerPage, hasSetPageInitially]);

  const handleRowsPerPageChange = (newRowsPerPage) => {
    setRowsPerPage(newRowsPerPage);
    
    setPage(1);
  };

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Attack</h2>
      <Center><p>You can attack players from levels {attackRangeMin} to {attackRangeMax}</p></Center>
      <div className="mt-4 flex justify-between mb-2">
        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = Math.max(page - 1, 1);
            setPage(newPage);
          }}
          disabled={page == 1}
        >
          Previous
        </button>
        <Pagination
          total={lastPage}
          siblings={1}
          value={page}
          defaultValue={page}
          onChange={(xval) => { setPage(xval); pagination.setPage(xval); }}
        />

        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = page + 1;
            setPage(newPage);
          }}
          disabled={players.length < rowsPerPage}
        >
          Next
        </button>
      </div>
      <div className="overflow-x-auto">
        <Group position="apart" className="mb-2">
          <Pill size='lg'>
            <Text>
              Sorted By: {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
            </Text>
          </Pill>

          <Pill size='lg'>
            <Text>
              Your {getRankLabel()}: {myRank}
            </Text>
          </Pill>
          <Pill
            onClick={() => setPage(myPage)}
            disabled={myPage === page}
            size='lg'
            bg={myPage === page ? theme.colors.gray : theme.colors.brand[8]}
            onMouseOver={(e) => e.currentTarget.style.cursor = myPage !== page ? 'pointer' : 'default'}
          >
            Go to My Rank
          </Pill>
        </Group>
        </div>
      <div className="overflow-x-auto">
        <Group>
          <Text size="sm">Show per page: </Text>
          {[10, 20, 50, 100].map(option => (
            <Text
              key={option}
              size="sm"
              c={rowsPerPage === option ? 'dimmed' : 'white'}
              className='cursor-pointer'
              onClick={() => handleRowsPerPageChange(option)}
            >
              {option}
            </Text>
          ))}
        </Group>
        <Table.ScrollContainer minWidth={400}>
          <Table verticalSpacing={"sm"} striped highlightOnHover className="bg-gray-900 text-white text-left">
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="px-1 py-1" style={{ width: '100px' }}>{getRankLabel()}</Table.Th>
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
          }}
          disabled={page == 1}
        >
          Previous
        </button>

        <Pagination total={lastPage} siblings={1} value={page} defaultValue={page} onChange={setPage} />

        <button
          className="rounded bg-blue-500 px-4 py-2 font-bold text-white hover:bg-blue-700"
          onClick={() => {
            const newPage = page + 1;
            setPage(newPage);
          }}
          disabled={players.length < rowsPerPage}
        >
          Next
        </button>
      </div>


    </div>
  );
};


export const getServerSideProps = async () => {
  try {
    let allUsers = await prisma.users.findMany({
      where: {
        AND: [{ id: { not: 0 } }, { last_active: { not: null } }],
      },
      select: { // limit the amount of data we're sending back - fixes data prop concerns for performance
        id: true,
        display_name: true,
        rank: true,
        last_active: true,
        avatar: true,
        units: true,
        gold: true,
        race: true,
        class: true,
        experience: true,
      },
    });
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
