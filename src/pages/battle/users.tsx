import { InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState } from 'react';

import {
  Button,
  Center,
  Checkbox,
  Collapse,
  Divider,
  Group,
  MultiSelect,
  NumberInput,
  Pagination,
  Paper,
  Pill,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
  Avatar,
  Badge,
  Indicator,
} from '@mantine/core';
import { usePagination } from '@mantine/hooks';

import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import toLocale from '@/utils/numberFormatting';
import { logError, logInfo } from '@/utils/logger';
import { getLevelFromXP } from '@/utils/utilities';

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

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [matchMode, setMatchMode] = useState<'AND' | 'OR'>('AND');
  const [nameQuery, setNameQuery] = useState('');

  const [includeFriends, setIncludeFriends] = useState(true);
  const [includeEnemies, setIncludeEnemies] = useState(true);
  const [includeOthers, setIncludeOthers] = useState(true);

  const [includeAllianceMembers, setIncludeAllianceMembers] = useState(true);
  const [includeNonAllianceMembers, setIncludeNonAllianceMembers] = useState(true);
  const [selectedAllianceIds, setSelectedAllianceIds] = useState<string[]>([]);

  const [minGold, setMinGold] = useState<number | null>(null);
  const [maxGold, setMaxGold] = useState<number | null>(null);
  const [minLevel, setMinLevel] = useState<number | null>(null);
  const [maxLevel, setMaxLevel] = useState<number | null>(null);

  const [onlineOnly, setOnlineOnly] = useState(false);
  const [recentDays, setRecentDays] = useState<number>(7);
  const [attackedMeRecently, setAttackedMeRecently] = useState(false);
  const [iBeatRecently, setIBeatRecently] = useState(false);
  const [theyBeatMeRecently, setTheyBeatMeRecently] = useState(false);

  const [friendIds, setFriendIds] = useState<Set<number>>(new Set());
  const [enemyIds, setEnemyIds] = useState<Set<number>>(new Set());
  const [attackedMeIds, setAttackedMeIds] = useState<Set<number>>(new Set());
  const [iBeatIds, setIBeatIds] = useState<Set<number>>(new Set());
  const [theyBeatMeIds, setTheyBeatMeIds] = useState<Set<number>>(new Set());
  const [allianceOptions, setAllianceOptions] = useState<Array<{ value: string; label: string }>>([]);

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
    if (!user) return;

    const fetchSocial = async () => {
      try {
        const [friendsRes, enemiesRes] = await Promise.all([
          fetch('/api/social/listAll?type=FRIEND&limit=100'),
          fetch('/api/social/listAll?type=ENEMY&limit=100'),
        ]);

        if (friendsRes.ok) {
          const friends = await friendsRes.json();
          setFriendIds(new Set((friends || []).map((r: any) => Number(r.friend?.id)).filter((id: any) => Number.isFinite(id))));
        }
        if (enemiesRes.ok) {
          const enemies = await enemiesRes.json();
          setEnemyIds(new Set((enemies || []).map((r: any) => Number(r.friend?.id)).filter((id: any) => Number.isFinite(id))));
        }
      } catch (e) {
        // non-fatal: advanced filters will just treat everyone as "other"
      }
    };

    fetchSocial();
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const fetchMeta = async () => {
      try {
        const res = await fetch(`/api/battle/users-filter-meta?days=${recentDays}`);
        if (!res.ok) return;
        const data = await res.json();
        setAttackedMeIds(new Set((data.attackedMeIds || []).map((id: any) => Number(id)).filter((id: any) => Number.isFinite(id))));
        setIBeatIds(new Set((data.iBeatIds || []).map((id: any) => Number(id)).filter((id: any) => Number.isFinite(id))));
        setTheyBeatMeIds(new Set((data.theyBeatMeIds || []).map((id: any) => Number(id)).filter((id: any) => Number.isFinite(id))));
      } catch (e) {
        // non-fatal
      }
    };

    fetchMeta();
  }, [user, recentDays]);

  useEffect(() => {
    if (!user) return;

    const fetchAlliances = async () => {
      try {
        const res = await fetch('/api/alliances/getAll');
        if (!res.ok) return;
        const alliances = await res.json();
        setAllianceOptions(
          (alliances || [])
            .map((a: any) => ({ value: String(a.id), label: a.name }))
            .filter((o: any) => o.value && o.label),
        );
      } catch (e) {
        // non-fatal
      }
    };

    fetchAlliances();
  }, [user]);

  const filteredUsers = useMemo(() => {
    if (!user) return [];

    const normalizedQuery = nameQuery.trim().toLowerCase();
    const selectedSet = new Set(selectedAllianceIds.map((v) => Number(v)).filter((n) => Number.isFinite(n)));

    const relationshipIsConstrained = !(includeFriends && includeEnemies && includeOthers);
    const alliancePresenceIsConstrained = !(includeAllianceMembers && includeNonAllianceMembers);

    const predicates: Array<(u: any) => boolean> = [];

    if (normalizedQuery) {
      predicates.push((u) => String(u.display_name || '').toLowerCase().includes(normalizedQuery));
    }

    if (relationshipIsConstrained) {
      predicates.push((u) => {
        if (u.id === user.id) return true;
        const isFriend = friendIds.has(u.id);
        const isEnemy = enemyIds.has(u.id);
        if (isFriend) return includeFriends;
        if (isEnemy) return includeEnemies;
        return includeOthers;
      });
    }

    if (alliancePresenceIsConstrained) {
      predicates.push((u) => {
        const allianceIds: number[] = Array.isArray(u.allianceIds) ? u.allianceIds : [];
        const hasAlliance = allianceIds.length > 0;
        return hasAlliance ? includeAllianceMembers : includeNonAllianceMembers;
      });
    }

    if (selectedSet.size > 0) {
      predicates.push((u) => {
        const allianceIds: number[] = Array.isArray(u.allianceIds) ? u.allianceIds : [];
        return allianceIds.some((id) => selectedSet.has(id));
      });
    }

    if (minGold !== null || maxGold !== null) {
      predicates.push((u) => {
        const gold = Number(u.gold);
        if (!Number.isFinite(gold)) return false;
        if (minGold !== null && gold < minGold) return false;
        if (maxGold !== null && gold > maxGold) return false;
        return true;
      });
    }

    if (minLevel !== null || maxLevel !== null) {
      predicates.push((u) => {
        const lvl = getLevelFromXP(Number(u.experience || 0));
        if (minLevel !== null && lvl < minLevel) return false;
        if (maxLevel !== null && lvl > maxLevel) return false;
        return true;
      });
    }

    if (onlineOnly) {
      predicates.push((u) => Boolean(u.isOnline));
    }

    if (attackedMeRecently) {
      predicates.push((u) => u.id === user.id || attackedMeIds.has(u.id));
    }

    if (iBeatRecently) {
      predicates.push((u) => u.id === user.id || iBeatIds.has(u.id));
    }

    if (theyBeatMeRecently) {
      predicates.push((u) => u.id === user.id || theyBeatMeIds.has(u.id));
    }

    if (predicates.length === 0) return allUsers as any[];

    return (allUsers as any[]).filter((u) => (matchMode === 'AND' ? predicates.every((p) => p(u)) : predicates.some((p) => p(u))));
  }, [
    user,
    allUsers,
    nameQuery,
    matchMode,
    includeFriends,
    includeEnemies,
    includeOthers,
    friendIds,
    enemyIds,
    includeAllianceMembers,
    includeNonAllianceMembers,
    selectedAllianceIds,
    minGold,
    maxGold,
    minLevel,
    maxLevel,
    onlineOnly,
    attackedMeRecently,
    iBeatRecently,
    theyBeatMeRecently,
    attackedMeIds,
    iBeatIds,
    theyBeatMeIds,
  ]);

  useEffect(() => {
    if(!user) return;
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    let sortedPlayers = [...filteredUsers];
    setLastPage(Math.ceil(filteredUsers.length / rowsPerPage));

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
    paginatedPlayers.forEach((player: any, index) => player.overallrank = (sortDir === 'asc' ? filteredUsers.length - start - index : start + index + 1));

    setPlayers(paginatedPlayers);

    setMyPage(playerPage);
    setMyRank(loggedInPlayerIndex + 1);

  }, [page, sortBy, sortDir, filteredUsers, rowsPerPage, user]);


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

  const resetAdvancedFilters = () => {
    setMatchMode('AND');
    setNameQuery('');
    setIncludeFriends(true);
    setIncludeEnemies(true);
    setIncludeOthers(true);
    setIncludeAllianceMembers(true);
    setIncludeNonAllianceMembers(true);
    setSelectedAllianceIds([]);
    setMinGold(null);
    setMaxGold(null);
    setMinLevel(null);
    setMaxLevel(null);
    setOnlineOnly(false);
    setRecentDays(7);
    setAttackedMeRecently(false);
    setIBeatRecently(false);
    setTheyBeatMeRecently(false);
  };

  const toNumberOrNull = (value: number | string): number | null => {
    if (value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  return (
    <MainArea title="Attack Users">
      <Center><p>You can attack players from levels {attackRangeMin} to {attackRangeMax}</p></Center>
      <Group justify="space-between" className="mt-4 mb-2">
        <Button variant="light" onClick={() => setAdvancedOpen((v) => !v)}>
          {advancedOpen ? 'Hide Advanced Filters' : 'Show Advanced Filters'}
        </Button>
        <Text size="sm" c="dimmed">
          Showing {filteredUsers.length} / {allUsers.length}
        </Text>
      </Group>
      <Collapse in={advancedOpen}>
        <Paper p="md" withBorder mb="md">
          <Stack gap="sm">
            <Group justify="space-between" align="flex-end">
              <div>
                <Text size="sm" c="dimmed">
                  Match mode
                </Text>
                <SegmentedControl
                  value={matchMode}
                  onChange={(val) => setMatchMode(val as 'AND' | 'OR')}
                  data={[
                    { label: 'All (AND)', value: 'AND' },
                    { label: 'Any (OR)', value: 'OR' },
                  ]}
                />
              </div>
              <Button variant="default" onClick={resetAdvancedFilters}>
                Reset
              </Button>
            </Group>

            <TextInput
              label="Name contains"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.currentTarget.value)}
              placeholder="e.g. Tim"
            />

            <Divider label="Social" />
            <Group>
              <Checkbox checked={includeFriends} onChange={(e) => setIncludeFriends(e.currentTarget.checked)} label="Friends" />
              <Checkbox checked={includeEnemies} onChange={(e) => setIncludeEnemies(e.currentTarget.checked)} label="Enemies" />
              <Checkbox checked={includeOthers} onChange={(e) => setIncludeOthers(e.currentTarget.checked)} label="Others" />
            </Group>

            <Divider label="Alliance" />
            <Group>
              <Checkbox
                checked={includeAllianceMembers}
                onChange={(e) => setIncludeAllianceMembers(e.currentTarget.checked)}
                label="In an alliance"
              />
              <Checkbox
                checked={includeNonAllianceMembers}
                onChange={(e) => setIncludeNonAllianceMembers(e.currentTarget.checked)}
                label="Not in an alliance"
              />
            </Group>
            <MultiSelect
              label="Specific alliances (optional)"
              placeholder="Pick alliances"
              data={allianceOptions}
              value={selectedAllianceIds}
              onChange={setSelectedAllianceIds}
              searchable
              clearable
            />

            <Divider label="Stats" />
            <Group grow>
              <NumberInput
                label="Min gold"
                value={minGold}
                onChange={(v) => setMinGold(toNumberOrNull(v))}
                min={0}
                thousandSeparator=","
              />
              <NumberInput
                label="Max gold"
                value={maxGold}
                onChange={(v) => setMaxGold(toNumberOrNull(v))}
                min={0}
                thousandSeparator=","
              />
            </Group>
            <Group grow>
              <NumberInput label="Min level" value={minLevel} onChange={(v) => setMinLevel(toNumberOrNull(v))} min={1} />
              <NumberInput label="Max level" value={maxLevel} onChange={(v) => setMaxLevel(toNumberOrNull(v))} min={1} />
            </Group>
            <Checkbox checked={onlineOnly} onChange={(e) => setOnlineOnly(e.currentTarget.checked)} label="Online only" />

            <Divider label="Recent battles" />
            <Group grow align="flex-end">
              <NumberInput
                label="Lookback (days)"
                value={recentDays}
                onChange={(v) => setRecentDays(typeof v === 'number' ? v : 7)}
                min={1}
                max={365}
              />
              <div />
            </Group>
            <Group>
              <Checkbox
                checked={attackedMeRecently}
                onChange={(e) => setAttackedMeRecently(e.currentTarget.checked)}
                label="Attacked you recently"
              />
              <Checkbox checked={iBeatRecently} onChange={(e) => setIBeatRecently(e.currentTarget.checked)} label="You beat recently" />
              <Checkbox
                checked={theyBeatMeRecently}
                onChange={(e) => setTheyBeatMeRecently(e.currentTarget.checked)}
                label="They beat you recently"
              />
            </Group>
          </Stack>
        </Paper>
      </Collapse>
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
        <Group  className="mb-2">
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
            color={myPage === page ? 'gray' : 'brand'}
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
                <Table.Th className="px-4 py-2">Alliance</Table.Th>
                <Table.Th className="px-4 py-2"><button onClick={() => handleSort('gold')}>Gold {sortBy === 'gold' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</button></Table.Th>
                <Table.Th className="px-4 py-2"><button onClick={() => handleSort('population')}> Population {sortBy === 'population' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</button></Table.Th>
                <Table.Th className="px-4 py-2"><button onClick={() => handleSort('level')}> Level{sortBy === 'level' && (sortDir === 'asc' ? ' ↑' : ' ↓')}</button></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {players.map((nplayer, index) => {
                const player = new UserModel(nplayer, true, false);
                if (player.id === user?.id) player.is_player = true;
                const allianceName = Array.isArray((nplayer as any).alliances) && (nplayer as any).alliances[0]?.name ? (nplayer as any).alliances[0]?.name : '-';
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
                          <Text fz="med" fw={500} component="div">
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
                    <Table.Td className="px-4 py-2">{allianceName}</Table.Td>
                    <Table.Td className="px-4 py-2">{toLocale(formattedGolds[index])}</Table.Td>
                    <Table.Td className="px-4 py-2">{toLocale(nplayer.population)}</Table.Td>
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


    </MainArea>
  );
};


export const getServerSideProps = async () => {
  try {
    let allUsers = await prisma.users.findMany({
      where: {
        AND: [
          { id: { not: 0 } },
          { last_active: { not: null } },
        ],
      },
      select: {
        id: true,
        display_name: true,
        rank: true,
        last_active: true,
        avatar: true,
        UserUnit: true,
        alliance_memberships: {
          select: {
            alliance: { select: { id: true, name: true } },
          },
        },
        gold: true,
        race: true,
        class: true,
        experience: true,
        statusHistories: {
          orderBy: { created_at: 'desc' },
          take: 1, // Take only the most recent status
        },
      },
    });
    logInfo(`Fetched ${allUsers.length} users from database.`);
    const sanitizedUsers = allUsers
      .filter(user => user.statusHistories[0]?.status === 'ACTIVE')
      .map(user => {
      const nowdate = new Date();
      const lastActiveDate = new Date(user.last_active);
      const lastActiveTimestamp = lastActiveDate.getTime();
      const nowTimestamp = nowdate.getTime();
      const population = user.UserUnit?.reduce((acc, unit) => acc + (unit.quantity || 0), 0) || 0;

      // prepare safe last_active string and online flag
      let lastActiveStr: string | null = null;
      let isOnline = false;
      if (!isNaN(lastActiveTimestamp)) {
        lastActiveStr = lastActiveDate.toISOString();
        isOnline = ((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
      }

      // remove the units so there's no leakage of data
      return {
        id: user.id,
        display_name: user.display_name,
        rank: user.rank,
        last_active: lastActiveStr,
        avatar: user.avatar,
        gold: user.gold.toString(),
        race: user.race,
        class: user.class,
        experience: user.experience,
        population: population,
        isOnline: isOnline,
        alliances: (user.alliance_memberships || []).map((m) => ({
          id: m.alliance.id,
          name: m.alliance.name,
        })),
        allianceIds: (user.alliance_memberships || []).map((m) => m.alliance.id),
        
      };
    });
    logInfo(`Sanitized ${sanitizedUsers.length} users.`);
    sanitizedUsers.sort((a, b) => a.rank - b.rank);
    return { props: { allUsers: sanitizedUsers } };
  } catch (error) {
    logError('Error fetching user data:', error);
    return { props: { allUsers: [] } };
  }
};

export default Users;
