import {
  faCrosshairs,
  faFilter,
  faUsers,
} from '@fortawesome/free-solid-svg-icons';
import {
  Avatar,
  Badge,
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  Indicator,
  MultiSelect,
  NumberInput,
  Pagination,
  Pill,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
  useMantineTheme,
} from '@mantine/core';
import { usePagination } from '@mantine/hooks';
import type { InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type { SelectedPlayerAction } from '@/components/battle/PlayerActions';
import {
  PlayerActionDialogs,
  PlayerActions,
} from '@/components/battle/PlayerActions';
import actionClasses from '@/components/battle/PlayerActions.module.css';
import { GameCard } from '@/components/game/GameCard';
import { StyledTable } from '@/components/game/StyledTable';
import MainArea from '@/components/MainArea';
import { useUser } from '@/context/users';
import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { useRuntimeConfig } from '@/hooks/useRuntimeConfig';
import prisma from '@/lib/prisma';
import UserModel from '@/models/Users';
import { hasParticipatedInEra } from '@/utils/eraParticipation';
import { logError, logInfo } from '@/utils/logger';
import { getEraParticipantWhere } from '@/utils/loginPolicy';
import { toLocale } from '@/utils/numberFormatting';
import { serverSideTranslations } from '@/utils/serverTranslations';
import { getLevelFromXP } from '@/utils/utilities';
/** Shared ledger column style for the leaderboard header cells. */
const leaderboardThStyle = {
  color: 'var(--ot-heading)',
  borderBottom: '1px solid #2f3e52',
  textTransform: 'uppercase',
  fontSize: '11px',
  letterSpacing: '1px',
} as const;

const Users = ({
  allUsers,
}: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { t } = useTranslation('battle');
  const [selectedAction, setSelectedAction] =
    useState<SelectedPlayerAction | null>(null);
  const actionTrigger = useRef<HTMLElement | null>(null);
  const selectPlayerAction = (selection: SelectedPlayerAction) => {
    const active = document.activeElement;
    actionTrigger.current =
      active instanceof HTMLElement &&
      active.getAttribute('role') !== 'menuitem'
        ? active
        : ([
            ...document.querySelectorAll<HTMLElement>(
              `[data-player-actions-id="${selection.target.id}"] button`,
            ),
          ]
            .filter((button) => button.getClientRects().length)
            .at(-1) ?? null);
    setSelectedAction(selection);
  };
  const closePlayerAction = () => {
    setSelectedAction(null);
    requestAnimationFrame(() => actionTrigger.current?.focus());
  };
  const { raceName, className } = usePlayerIdentity();
  const router = useRouter();
  const getQueryParam = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const pageQuery = getQueryParam(router.query.page);
  const sortByQuery = getQueryParam(router.query.sortBy);
  const sortDirQuery = getQueryParam(router.query.sortDir);
  const emptyQuery = getQueryParam(router.query.empty);
  const { user } = useUser();
  const theme = useMantineTheme();
  const colorScheme = user?.colorScheme;
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [sortBy, setSortBy] = useState('level');
  const [sortDir, setSortDir] = useState('desc');
  const [players, setPlayers] = useState([]);
  const [formattedGolds, setFormattedGolds] = useState<string[]>([]);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const { config: runtimeConfig } = useRuntimeConfig();
  const [attackRangeMin, setAttackRangeMin] = useState(1);
  const [attackRangeMax, setAttackRangeMax] = useState(5);
  const [hasSetPageInitially, setHasSetPageInitially] = useState(false);
  const [myPage, setMyPage] = useState(1);
  const [myRank, setMyRank] = useState(1);
  const pagination = usePagination({ total: lastPage, initialPage: 1 });

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [nameQuery, setNameQuery] = useState('');

  const [includeFriends, setIncludeFriends] = useState(true);
  const [includeEnemies, setIncludeEnemies] = useState(true);
  const [includeOthers, setIncludeOthers] = useState(true);

  const [includeAllianceMembers, setIncludeAllianceMembers] = useState(true);
  const [includeNonAllianceMembers, setIncludeNonAllianceMembers] =
    useState(true);
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
  const [allianceOptions, setAllianceOptions] = useState<
    Array<{ value: string; label: string }>
  >([]);
  const [metaError, setMetaError] = useState<string | null>(null);
  const brand = theme.colors.brand ?? theme.colors.blue;
  const secondary = theme.colors.secondary ?? theme.colors.yellow;
  const accent = secondary[4] ?? '#e5c55a';
  const rowGlow = brand[6] ?? '#1d4ed8';
  const withAlpha = (hex: string, alpha: string) =>
    hex.startsWith('#') && hex.length === 7 ? `${hex}${alpha}` : hex;

  const getRankLabel = () => {
    switch (sortBy) {
      case 'gold':
        return t('users.goldRank');
      case 'level':
        return t('users.lvlRank');
      case 'population':
        return t('users.popRank');
      default:
        return t('users.rank');
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
          setFriendIds(
            new Set(
              (friends || [])
                .map((r: any) => Number(r.friend?.id))
                .filter((id: any) => Number.isFinite(id)),
            ),
          );
        }
        if (enemiesRes.ok) {
          const enemies = await enemiesRes.json();
          setEnemyIds(
            new Set(
              (enemies || [])
                .map((r: any) => Number(r.friend?.id))
                .filter((id: any) => Number.isFinite(id)),
            ),
          );
        }
      } catch {
        // non-fatal: advanced filters will just treat everyone as "other"
      }
    };

    fetchSocial();
  }, [user]);

  const fetchMeta = useCallback(async () => {
    if (!user) return;

    try {
      const res = await fetch(
        `/api/battle/users-filter-meta?days=${recentDays}`,
      );
      if (!res.ok) {
        setMetaError(t('users.unableToLoadMetadata'));
        return;
      }
      const data = await res.json();
      setMetaError(null);
      setAttackedMeIds(
        new Set(
          (data.attackedMeIds || [])
            .map((id: any) => Number(id))
            .filter((id: any) => Number.isFinite(id)),
        ),
      );
      setIBeatIds(
        new Set(
          (data.iBeatIds || [])
            .map((id: any) => Number(id))
            .filter((id: any) => Number.isFinite(id)),
        ),
      );
      setTheyBeatMeIds(
        new Set(
          (data.theyBeatMeIds || [])
            .map((id: any) => Number(id))
            .filter((id: any) => Number.isFinite(id)),
        ),
      );
    } catch {
      setMetaError(t('users.unableToLoadMetadata'));
    }
  }, [user, recentDays]);

  useEffect(() => {
    fetchMeta();
  }, [fetchMeta]);

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
      } catch {
        // non-fatal
      }
    };

    fetchAlliances();
  }, [user]);

  const filteredUsers = useMemo(() => {
    if (!user) return [];
    if (emptyQuery === '1') return [];

    const normalizedQuery = nameQuery.trim().toLowerCase();
    const selectedSet = new Set(
      selectedAllianceIds
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n)),
    );

    const relationshipIsConstrained = !(
      includeFriends &&
      includeEnemies &&
      includeOthers
    );
    const alliancePresenceIsConstrained = !(
      includeAllianceMembers && includeNonAllianceMembers
    );

    const predicates: Array<(u: any) => boolean> = [];

    if (normalizedQuery) {
      predicates.push((u) =>
        String(u.display_name || '')
          .toLowerCase()
          .includes(normalizedQuery),
      );
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
        const allianceIds: number[] = Array.isArray(u.allianceIds)
          ? u.allianceIds
          : [];
        const hasAlliance = allianceIds.length > 0;
        return hasAlliance ? includeAllianceMembers : includeNonAllianceMembers;
      });
    }

    if (selectedSet.size > 0) {
      predicates.push((u) => {
        const allianceIds: number[] = Array.isArray(u.allianceIds)
          ? u.allianceIds
          : [];
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

    return (allUsers as any[]).filter((u) => predicates.every((p) => p(u)));
  }, [
    user,
    emptyQuery,
    allUsers,
    nameQuery,
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
    if (!user) return;
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const sortedPlayers = [...filteredUsers];
    setLastPage(Math.ceil(filteredUsers.length / rowsPerPage));

    // Fallback for users where rank hasn't been calculated yet (and is therefore 0 or null)
    sortedPlayers.forEach((u) => (u.rank = u.rank || Infinity));

    // Sorting logic
    if (sortBy === 'gold') {
      sortedPlayers.sort((a, b) =>
        sortDir === 'desc'
          ? Number(b.gold) - Number(a.gold)
          : Number(a.gold) - Number(b.gold),
      );
    } else if (sortBy === 'population') {
      sortedPlayers.sort((a, b) =>
        sortDir === 'desc'
          ? Number(b.population) - Number(a.population)
          : Number(a.population) - Number(b.population),
      );
    } else if (sortBy === 'level') {
      sortedPlayers.sort((a, b) =>
        sortDir === 'desc'
          ? Number(b.experience) - Number(a.experience)
          : Number(a.experience) - Number(b.experience),
      );
    }

    // Recalculate page of logged-in player
    const loggedInPlayerIndex = sortedPlayers.findIndex(
      (player) => player.id === user?.id,
    );
    const playerPage = Math.floor(loggedInPlayerIndex / rowsPerPage) + 1;

    const paginatedPlayers = sortedPlayers.slice(start, end);
    paginatedPlayers.forEach(
      (player: any, index) =>
        (player.overallrank =
          sortDir === 'asc'
            ? filteredUsers.length - start - index
            : start + index + 1),
    );

    setPlayers(paginatedPlayers);

    setMyPage(playerPage);
    setMyRank(loggedInPlayerIndex + 1);
  }, [page, sortBy, sortDir, filteredUsers, rowsPerPage, user]);

  useEffect(() => {
    const golds = players.map((player) => toLocale(player.gold, user?.locale));
    setFormattedGolds(golds);
  }, [players, user?.locale]);

  useEffect(() => {
    const range = runtimeConfig?.attackLevelRange;
    if (!user || range === undefined) return;
    setAttackRangeMax(user.level + range);
    setAttackRangeMin(Math.max(1, user.level - range));
  }, [user?.level, runtimeConfig?.attackLevelRange]);

  const handleSort = (newSortBy) => {
    const newSortDir =
      sortBy === newSortBy && sortDir === 'desc' ? 'asc' : 'desc';
    setSortBy(newSortBy);
    setSortDir(newSortDir);
    setPage(1);
  };

  useEffect(() => {
    if (user && router.isReady) {
      if (!hasSetPageInitially) {
        const pageParam = pageQuery;
        const sortByParam = sortByQuery;
        const sortDirParam = sortDirQuery;

        if (!pageParam && !sortByParam && !sortDirParam) {
          const loggedInPlayerIndex = allUsers.findIndex(
            (player) => player.id === user?.id,
          );

          if (loggedInPlayerIndex !== -1) {
            const newPage = Math.floor(loggedInPlayerIndex / rowsPerPage) + 1;
            setPage(newPage);
          }
        } else {
          const initialPage = parseInt(pageParam || '') || 1;
          setPage(initialPage);
          setSortBy(sortByParam || 'level');
          setSortDir(sortDirParam || 'asc');
        }

        // Mark initial setting as complete
        setHasSetPageInitially(true);
      }
    }
  }, [
    user,
    allUsers,
    pageQuery,
    sortByQuery,
    sortDirQuery,
    rowsPerPage,
    hasSetPageInitially,
    router.isReady,
  ]);

  const handleRowsPerPageChange = (newRowsPerPage) => {
    setRowsPerPage(newRowsPerPage);

    setPage(1);
  };

  const resetAdvancedFilters = () => {
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
    <MainArea title={t('users.title')}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg" mb="lg">
        <GameCard
          title={t('users.targetingWindow')}
          icon={faCrosshairs}
          goldAccent={false}
        >
          <Text size="sm" c="gray.3">
            {t('users.attackRange')}{' '}
            <Text component="span" fw={700} c="gray.1">
              {attackRangeMin}
            </Text>{' '}
            {t('users.to')}{' '}
            <Text component="span" fw={700} c="gray.1">
              {attackRangeMax}
            </Text>
            .
          </Text>
          <Text size="xs" c="dimmed" mt="sm">
            {t('users.showingTargets', {
              filtered: filteredUsers.length,
              total: allUsers.length,
            })}
          </Text>
        </GameCard>

        <GameCard
          title={t('users.filters')}
          icon={faFilter}
          action={
            <Button
              size="xs"
              variant="light"
              onClick={() => setAdvancedOpen((v) => !v)}
            >
              {advancedOpen ? t('users.hideAdvanced') : t('users.showAdvanced')}
            </Button>
          }
          goldAccent={false}
        >
          <Stack gap="sm">
            <TextInput
              label={t('users.nameContains')}
              value={nameQuery}
              onChange={(e) => setNameQuery(e.currentTarget.value)}
              placeholder={t('users.placeholderName')}
            />
            <Collapse in={advancedOpen}>
              <Box
                mt="sm"
                p="sm"
                style={{
                  backgroundColor: '#0f141a',
                  borderRadius: '6px',
                  border: '1px solid #1f2b3b',
                  boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                }}
              >
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-end">
                    <Text size="sm" c="dimmed">
                      {t('users.advancedFilters')}
                    </Text>
                    <Button
                      size="xs"
                      variant="default"
                      onClick={resetAdvancedFilters}
                    >
                      {t('users.reset')}
                    </Button>
                  </Group>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.3em' }}
                  >
                    {t('users.social')}
                  </Text>
                  <Group>
                    <Checkbox
                      checked={includeFriends}
                      onChange={(e) =>
                        setIncludeFriends(e.currentTarget.checked)
                      }
                      label={t('users.friends')}
                    />
                    <Checkbox
                      checked={includeEnemies}
                      onChange={(e) =>
                        setIncludeEnemies(e.currentTarget.checked)
                      }
                      label={t('users.enemies')}
                    />
                    <Checkbox
                      checked={includeOthers}
                      onChange={(e) =>
                        setIncludeOthers(e.currentTarget.checked)
                      }
                      label={t('users.others')}
                    />
                  </Group>

                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.3em' }}
                  >
                    {t('users.alliance')}
                  </Text>
                  <Group>
                    <Checkbox
                      checked={includeAllianceMembers}
                      onChange={(e) =>
                        setIncludeAllianceMembers(e.currentTarget.checked)
                      }
                      label={t('users.inAnAlliance')}
                    />
                    <Checkbox
                      checked={includeNonAllianceMembers}
                      onChange={(e) =>
                        setIncludeNonAllianceMembers(e.currentTarget.checked)
                      }
                      label={t('users.notInAnAlliance')}
                    />
                  </Group>
                  <MultiSelect
                    label={t('users.specificAlliances')}
                    placeholder={t('users.pickAlliances')}
                    data={allianceOptions}
                    value={selectedAllianceIds}
                    onChange={setSelectedAllianceIds}
                    searchable
                    clearable
                  />

                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.3em' }}
                  >
                    {t('users.stats')}
                  </Text>
                  <Group grow>
                    <NumberInput
                      label={t('users.minGold')}
                      value={minGold}
                      onChange={(v) => setMinGold(toNumberOrNull(v))}
                      min={0}
                      thousandSeparator=","
                    />
                    <NumberInput
                      label={t('users.maxGold')}
                      value={maxGold}
                      onChange={(v) => setMaxGold(toNumberOrNull(v))}
                      min={0}
                      thousandSeparator=","
                    />
                  </Group>
                  <Group grow>
                    <NumberInput
                      label={t('users.minLevel')}
                      value={minLevel}
                      onChange={(v) => setMinLevel(toNumberOrNull(v))}
                      min={1}
                    />
                    <NumberInput
                      label={t('users.maxLevel')}
                      value={maxLevel}
                      onChange={(v) => setMaxLevel(toNumberOrNull(v))}
                      min={1}
                    />
                  </Group>
                  <Checkbox
                    checked={onlineOnly}
                    onChange={(e) => setOnlineOnly(e.currentTarget.checked)}
                    label={t('users.onlineOnly')}
                  />

                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.3em' }}
                  >
                    {t('users.recentBattles')}
                  </Text>
                  <Group grow align="flex-end">
                    <NumberInput
                      label={t('users.lookbackDays')}
                      value={recentDays}
                      onChange={(v) =>
                        setRecentDays(typeof v === 'number' ? v : 7)
                      }
                      min={1}
                      max={365}
                    />
                    <div />
                  </Group>
                  <Group>
                    <Checkbox
                      checked={attackedMeRecently}
                      onChange={(e) =>
                        setAttackedMeRecently(e.currentTarget.checked)
                      }
                      label={t('users.attackedYouRecently')}
                    />
                    <Checkbox
                      checked={iBeatRecently}
                      onChange={(e) =>
                        setIBeatRecently(e.currentTarget.checked)
                      }
                      label={t('users.youBeatRecently')}
                    />
                    <Checkbox
                      checked={theyBeatMeRecently}
                      onChange={(e) =>
                        setTheyBeatMeRecently(e.currentTarget.checked)
                      }
                      label={t('users.theyBeatYouRecently')}
                    />
                  </Group>
                </Stack>
              </Box>
            </Collapse>
          </Stack>
        </GameCard>
      </SimpleGrid>

      <GameCard
        title={t('users.title')}
        icon={faUsers}
        className={actionClasses.tableCard}
      >
        <Group justify="space-between" mb="sm" wrap="wrap">
          <Group>
            <Button
              variant="light"
              onClick={() => {
                const newPage = Math.max(page - 1, 1);
                setPage(newPage);
              }}
              disabled={page === 1}
            >
              {t('users.previous')}
            </Button>
            <Pagination
              total={lastPage}
              siblings={1}
              value={page}
              defaultValue={page}
              onChange={(xval) => {
                setPage(xval);
                pagination.setPage(xval);
              }}
            />
            <Button
              variant="light"
              onClick={() => {
                const newPage = page + 1;
                setPage(newPage);
              }}
              disabled={players.length < rowsPerPage}
            >
              {t('users.next')}
            </Button>
          </Group>
          <Group>
            <Pill size="lg">
              <Text>
                {t('users.sortedBy')}:{' '}
                {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
              </Text>
            </Pill>
            <Pill size="lg">
              <Text>
                {t('users.your')} {getRankLabel()}: {myRank}
              </Text>
            </Pill>
            <Pill
              onClick={() => setPage(myPage)}
              disabled={myPage === page}
              size="lg"
              color={myPage === page ? 'gray' : 'brand'}
              onMouseOver={(e) =>
                (e.currentTarget.style.cursor =
                  myPage !== page ? 'pointer' : 'default')
              }
            >
              {t('users.goToMyRank')}
            </Pill>
          </Group>
        </Group>

        <Group mb="sm" wrap="wrap">
          <Text size="sm">{t('users.showPerPage')}:</Text>
          {[10, 20, 50, 100].map((option) => (
            <Text
              key={option}
              size="sm"
              c={rowsPerPage === option ? 'dimmed' : 'white'}
              className="cursor-pointer"
              onClick={() => handleRowsPerPageChange(option)}
            >
              {option}
            </Text>
          ))}
        </Group>

        {metaError && (
          <Group mb="sm">
            <Text size="sm" c="red.4" data-testid="error-message">
              {metaError}
            </Text>
            <Button
              size="xs"
              variant="light"
              onClick={fetchMeta}
              data-testid="retry-button"
            >
              {t('users.retry')}
            </Button>
          </Group>
        )}

        <Group
          className={actionClasses.mobileSort}
          mb="sm"
          gap="xs"
          wrap="nowrap"
        >
          <Select
            aria-label={t('users.sortedBy')}
            value={sortBy}
            data={['gold', 'population', 'level'].map((value) => ({
              value,
              label: t(`users.${value}`),
            }))}
            onChange={(value) => {
              if (value) handleSort(value);
            }}
            allowDeselect={false}
            style={{ flex: 1 }}
          />
          <Button
            onClick={() => handleSort(sortBy)}
            aria-label={t('actions.reverseSort')}
          >
            {sortDir === 'desc' ? '↓' : '↑'}
          </Button>
        </Group>
        <StyledTable
          regionTestId="table-container"
          ariaLabel={[
            getRankLabel(),
            t('users.username'),
            t('users.alliance'),
            t('users.gold'),
            t('users.population'),
            t('users.level'),
            t('actions.title'),
          ].join(', ')}
          tableProps={{
            highlightOnHover: true,
            className: `bg-gray-900 text-left text-white ${actionClasses.ledger}`,
            'data-testid': 'warlord-table',
          }}
          theadProps={{ 'data-testid': 'table-header' }}
          headerRowProps={{ style: { background: '#0e1520' } }}
          headers={[
            <Table.Th
              key="rank"
              className="p-1"
              data-testid="header-rank"
              style={{ ...leaderboardThStyle, width: '100px' }}
            >
              {getRankLabel()}
            </Table.Th>,
            <Table.Th
              key="name"
              className="px-4 py-2"
              data-testid="header-name"
              style={leaderboardThStyle}
            >
              {t('users.username')}
            </Table.Th>,
            <Table.Th
              key="race"
              className="px-4 py-2"
              data-testid="header-race"
              style={leaderboardThStyle}
            >
              {t('users.alliance')}
            </Table.Th>,
            <Table.Th
              key="gold"
              className="px-4 py-2"
              data-testid="header-networth"
              style={leaderboardThStyle}
            >
              <UnstyledButton onClick={() => handleSort('gold')}>
                {t('users.gold')}{' '}
                {sortBy === 'gold' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </UnstyledButton>
            </Table.Th>,
            <Table.Th
              key="population"
              className="px-4 py-2"
              style={leaderboardThStyle}
            >
              <UnstyledButton onClick={() => handleSort('population')}>
                {t('users.population')}{' '}
                {sortBy === 'population' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </UnstyledButton>
            </Table.Th>,
            <Table.Th
              key="level"
              className="px-4 py-2"
              style={leaderboardThStyle}
            >
              <UnstyledButton onClick={() => handleSort('level')}>
                {t('users.level')}{' '}
                {sortBy === 'level' && (sortDir === 'asc' ? ' ↑' : ' ↓')}
              </UnstyledButton>
            </Table.Th>,
            <Table.Th
              key="actions"
              className={actionClasses.actionsCell}
              style={leaderboardThStyle}
            >
              {t('actions.title')}
            </Table.Th>,
          ]}
        >
          {players.length === 0 ? (
            <Table.Tr data-testid="table-row">
              <Table.Td
                colSpan={7}
                data-testid="empty-state"
                style={{
                  borderColor: 'var(--ot-line)',
                  textAlign: 'center',
                }}
              >
                {t('users.noPlayersFound')}
              </Table.Td>
            </Table.Tr>
          ) : (
            players.map((nplayer, index) => {
              const player = new UserModel(nplayer, true, false);
              if (player.id === user?.id) player.is_player = true;
              const allianceName =
                Array.isArray(nplayer.alliances) && nplayer.alliances[0]?.name
                  ? nplayer.alliances[0]?.name
                  : '-';
              const actionTarget = {
                id: player.id,
                name: player.displayName,
                level: player.level,
                avatar: player.avatar,
                race: player.race,
                class: player.class,
                recruitLink: nplayer.recruit_link,
                isFriend: friendIds.has(player.id),
                isEnemy: enemyIds.has(player.id),
              };
              return (
                <Table.Tr
                  key={player.id}
                  data-testid="table-row"
                  className={`${actionClasses.playerRow} ${player.is_player ? 'bg-gray-500' : ''}`}
                  style={{
                    background: player.is_player
                      ? `linear-gradient(90deg, ${withAlpha(rowGlow, '40')} 0%, transparent 100%)`
                      : undefined,
                    transition: 'background 0.2s ease',
                  }}
                >
                  <Table.Td
                    className={`p-2 ${actionClasses.rankCell}`}
                    style={{ borderColor: 'var(--ot-line)' }}
                  >
                    <Text fw={700} c="dimmed" size="sm">
                      #{nplayer.overallrank}
                    </Text>
                  </Table.Td>
                  <Table.Td className={`px-4 py-2 ${actionClasses.nameCell}`}>
                    <Group
                      gap="sm"
                      wrap="nowrap"
                      className={actionClasses.identity}
                    >
                      <Indicator
                        className={actionClasses.identityAvatar}
                        color={player.is_online ? 'teal' : 'red'}
                      >
                        <Box
                          style={{
                            border: '1px solid #444',
                            padding: '1px',
                            background: '#000',
                          }}
                        >
                          <Avatar
                            src={player?.avatar}
                            size={34}
                            radius={0}
                            data-testid="race-icon"
                          />
                        </Box>
                      </Indicator>
                      <div className={actionClasses.identityText}>
                        <Text
                          fz="med"
                          fw={500}
                          component="div"
                          className={actionClasses.nameLine}
                        >
                          <Tooltip
                            label={player.displayName}
                            position="top-start"
                            withinPortal
                            events={{ hover: true, focus: true, touch: false }}
                          >
                            <Link
                              href={`/userprofile/${player.id}`}
                              className={`${actionClasses.displayName} font-bold text-blue-500 hover:text-blue-700`}
                            >
                              {player.displayName}
                            </Link>
                          </Tooltip>
                          {player.is_player && (
                            <Badge
                              color={
                                colorScheme === 'ELF'
                                  ? 'green'
                                  : colorScheme === 'GOBLIN'
                                    ? 'red'
                                    : colorScheme === 'UNDEAD'
                                      ? 'dark'
                                      : 'blue'
                              }
                              className={actionClasses.identityBadge}
                            >
                              {t('users.you')}
                            </Badge>
                          )}
                        </Text>
                        <Text
                          fz="xs"
                          c="dimmed"
                          className={actionClasses.identitySubline}
                        >
                          {raceName(player.race)} {className(player.class)}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td
                    className={`px-4 py-2 ${actionClasses.allianceCell}`}
                    style={{
                      borderColor: 'var(--ot-line)',
                      color: 'var(--ot-heading)',
                    }}
                  >
                    <Text
                      component="span"
                      className={actionClasses.mobileLabel}
                    >
                      {t('users.alliance')}
                    </Text>
                    {allianceName}
                  </Table.Td>
                  <Table.Td
                    className={`px-4 py-2 ${actionClasses.statCell}`}
                    style={{ borderColor: 'var(--ot-line)' }}
                  >
                    <Text className={actionClasses.mobileLabel}>
                      {t('users.gold')}
                    </Text>
                    <Text style={{ color: accent }} fw={600} size="sm">
                      {toLocale(formattedGolds[index])}
                    </Text>
                  </Table.Td>
                  <Table.Td
                    className={`px-4 py-2 ${actionClasses.statCell}`}
                    style={{ borderColor: 'var(--ot-line)' }}
                  >
                    <Text c="white" fw={700} size="sm">
                      <span className={actionClasses.mobileLabel}>
                        {t('users.population')}
                      </span>
                      {toLocale(nplayer.population)}
                    </Text>
                  </Table.Td>
                  <Table.Td
                    className={`px-4 py-2 ${actionClasses.statCell}`}
                    style={{ borderColor: 'var(--ot-line)' }}
                  >
                    <Text c="white" fw={700} size="sm">
                      <span className={actionClasses.mobileLabel}>
                        {t('users.level')}
                      </span>
                      {player.level}
                    </Text>
                  </Table.Td>
                  <Table.Td className={actionClasses.actionsCell}>
                    <PlayerActions
                      target={actionTarget}
                      onSelect={selectPlayerAction}
                    />
                  </Table.Td>
                </Table.Tr>
              );
            })
          )}
        </StyledTable>
      </GameCard>
      {selectedAction && (
        <PlayerActionDialogs
          key={`${selectedAction.action}-${selectedAction.target.id}`}
          selection={selectedAction}
          onClose={closePlayerAction}
          onSocialChange={(target, action) => {
            const update = action === 'friend' ? setFriendIds : setEnemyIds;
            update((current) => {
              const next = new Set(current);
              if (action === 'enemy' && target.isEnemy) next.delete(target.id);
              else next.add(target.id);
              return next;
            });
          }}
        />
      )}
    </MainArea>
  );
};

/** Returns server side props for callers that need normalized game data. */
export const getServerSideProps = async (_context: any) => {
  const translations = await serverSideTranslations(_context.locale ?? 'en', [
    'common',
    'navigation',
    'battle',
    'messaging',
  ]);
  try {
    const activeEra = await prisma.era.findFirst({
      where: { endDate: null },
      orderBy: { startDate: 'desc' },
      select: { id: true, startDate: true },
    });
    if (!activeEra) return { props: { ...translations, allUsers: [] } };
    const allUsers = await prisma.users.findMany({
      where: {
        ...(await getEraParticipantWhere(activeEra)),
      },
      select: {
        id: true,
        display_name: true,
        recruit_link: true,
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
          take: 1, // Take only most recent status
        },
      },
    });
    logInfo(`Fetched ${allUsers.length} users from database.`);
    const sanitizedUsers = allUsers
      .filter(
        (user) =>
          ['ACTIVE', 'IDLE'].includes(user.statusHistories[0]?.status) &&
          hasParticipatedInEra(user.last_active, activeEra.startDate),
      )
      .map((user) => {
        const nowdate = new Date();
        const lastActiveDate = new Date(user.last_active);
        const lastActiveTimestamp = lastActiveDate.getTime();
        const nowTimestamp = nowdate.getTime();
        const population =
          user.UserUnit?.reduce((acc, unit) => acc + (unit.quantity || 0), 0) ||
          0;

        // prepare safe last_active string and online flag
        let lastActiveStr: string | null = null;
        let isOnline = false;
        if (!isNaN(lastActiveTimestamp)) {
          lastActiveStr = lastActiveDate.toISOString();
          isOnline = (nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15;
        }

        // remove units so there's no leakage of data
        return {
          id: user.id,
          display_name: user.display_name,
          recruit_link: user.recruit_link,
          rank: user.rank,
          last_active: lastActiveStr,
          avatar: user.avatar,
          gold: user.gold.toString(),
          race: user.race,
          class: user.class,
          experience: user.experience,
          population,
          isOnline,
          alliances: (user.alliance_memberships || []).map((m) => ({
            id: m.alliance.id,
            name: m.alliance.name,
          })),
          allianceIds: (user.alliance_memberships || []).map(
            (m) => m.alliance.id,
          ),
        };
      });
    logInfo(`Sanitized ${sanitizedUsers.length} users.`);
    sanitizedUsers.sort((a, b) => a.rank - b.rank);
    return {
      props: {
        ...translations,
        allUsers: sanitizedUsers,
      },
    };
  } catch (error) {
    logError('Error fetching user data:', error);
    return { props: { ...translations, allUsers: [] } };
  }
};

export default Users;
