import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import React, { useEffect, useState } from 'react';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import toLocale from '@/utils/numberFormatting';
import { Table, Group, Avatar, Badge, Text, Indicator, Anchor, Breadcrumbs } from '@mantine/core';
import { InferGetServerSidePropsType } from "next";
import UserModel from '@/models/Users';
import { useBreadcrumbs } from '@/context/BreadcrumbContext';
import PageTemplate from '@/components/PageTemplate';

const ROWS_PER_PAGE = 10;

const Users = ({ allUsers, id }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
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
  const { breadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    const start = (page - 1) * ROWS_PER_PAGE;
    const end = start + ROWS_PER_PAGE;
    let sortedPlayers = [...allUsers];

    if (sortBy === 'overallrank') {
      sortedPlayers.sort((a, b) => sortDir === 'desc' ? a.score - b.score : b.score - a.score);
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
    router.push(`/alliances/${id}/members?sortBy=${newSortBy}&sortDir=${newSortDir}&page=1`);
  };

  useEffect(() => {
    const loggedInPlayerIndex = allUsers.findIndex((player) => player.id === user?.id);
    if (loggedInPlayerIndex !== -1 && !searchParams.get('page') && !searchParams.get('sortBy') && !searchParams.get('sortDir')) {
      const newPage = Math.floor(loggedInPlayerIndex / ROWS_PER_PAGE) + 1;
      setPage(newPage);
      router.push(`/alliances/${id}/members?page=${newPage}&sortBy=${sortBy}&sortDir=${sortDir}`);
    }
  }, [user, allUsers, sortBy, sortDir, router, searchParams]);

  return (
    <PageTemplate title="Alliance Members">
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
              {players.map((nPlayer, index) => {
                const player = new UserModel(nPlayer);
                const isPlayer = player.id === user?.id;
                return (
                  <Table.Tr
                    key={player.id}
                    className={`${isPlayer ? 'bg-gray-500' : 'odd:bg-table-odd even:bg-table-even'}`}
                  >
                    <Table.Td className="px-2 py-2">{player.overallrank}</Table.Td>
                    <Table.Td className="px-4 py-2">
                      <Group gap={'sm'} className="text-justify">
                        <Indicator color={player.is_online ? 'teal' : 'red'}>
                          <Avatar src={player.avatar} size={40} radius={40} />
                        </Indicator>
                        <div>
                          <Text fz="med" fw={500}>
                            <Link
                              href={`/userprofile/${player.id}`}
                              className="text-blue-500 hover:text-blue-700 font-bold"
                            >
                              {player.displayName}
                            </Link>
                            {isPlayer && <Badge color='brand' ml={5}>You</Badge>}
                            <Badge color="blue" ml={5}>{nPlayer.role.name}</Badge>
                          </Text>
                          <Text fz="xs" c="dimmed">
                            {player.race} {player.class}
                          </Text>
                        </div>
                      </Group>
                    </Table.Td>
                    <Table.Td className="px-4 py-2">{formattedGolds[index]}</Table.Td>
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
            router.push(`/alliances/${id}/members?page=${newPage}&sortBy=${sortBy}&sortDir=${sortDir}`);
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
            router.push(`/alliances/${id}/members?page=${newPage}&sortBy=${sortBy}&sortDir=${sortDir}`);
          }}
          disabled={players.length < ROWS_PER_PAGE}
        >
          Next
        </button>
      </div>
    </PageTemplate>
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
    0.004 * unitScore +
    0.003 * itemScore;
};


export const getServerSideProps = async ({ params }) => {
  const { id } = params;

  let whereCondition;

  if (isNaN(parseInt(id))) {
    // If `id` is not a number, treat it as a slug
    whereCondition = { slug: id };
  } else {
    // If `id` is a number, treat it as an ID
    whereCondition = { id: parseInt(id) };
  }

  try {
    const alliance = await prisma.alliances.findFirst({
      where: whereCondition,
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                display_name: true,
                experience: true,
                race: true,
                avatar: true,
                recruit_link: true,
                class: true,
                last_active: true,
                units: true,
                items: true,
                house_level: true,
                fort_level: true,
                gold: true,
              },
            },
            role: {
              select: {
                name: true,
                permissions: true,
              },
            },
          },
        },
      },
    });

    if (!alliance) {
      return { notFound: true };
    }

    let allUsers = alliance.members.map((membership) => {
      const user = membership.user;
      const nowdate = new Date();
      const lastActiveTimestamp = new Date(user.last_active).getTime();
      const nowTimestamp = nowdate.getTime();
      const population = user.units.reduce((acc, unit) => acc + unit.quantity, 0);
      const isOnline = ((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
      const score = calculateUserScore(user);
      const role = membership.role;

      return {
        ...user,
        population,
        isOnline,
        score,
        role,
      };
    });

    allUsers.sort((a, b) => b.score - a.score);
    return { props: { allUsers, id: alliance.id, slug: alliance.slug } };
  } catch (error) {
    console.error('Error fetching user data:', error);
    return { props: { allUsers: [], id } };
  } finally {
    await prisma.$disconnect();
  }
};


export default Users;
