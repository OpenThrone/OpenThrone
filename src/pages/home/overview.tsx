import {
  faCoins,
  faCrown,
  faEye,
  faLevelUpAlt,
  faMedal,
  faMoneyBills,
  faPiggyBank,
  faShieldAlt,
  faShieldVirus,
  faStar,
  faSyncAlt,
  faTrophy,
  faUsers,
  faUserSecret,
  faUserShield,
} from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  Anchor,
  Center,
  Group,
  Loader,
  Popover,
  SimpleGrid,
  Space,
  Table,
  Text,
  ThemeIcon,
} from '@mantine/core';
import { useMediaQuery } from '@mantine/hooks';
import Link from 'next/link';
import { useTranslation } from 'next-i18next';
import { useEffect, useMemo, useState } from 'react';

import { GameCard } from '@/components/game/GameCard';
import { StyledNews } from '@/components/game/StyledNews';
import { StyledTable } from '@/components/game/StyledTable';
import HeroBanner from '@/components/HeroBanner';
import MainArea from '@/components/MainArea';
import { FortHealthStatSlot } from '@/components/overview/FortHealthStatSlot';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import StatCard from '@/components/StatCard';
import { useUser } from '@/context/users';
import { usePlayerIdentity } from '@/hooks/usePlayerIdentity';
import { logError } from '@/utils/logger';
import { toLocale } from '@/utils/numberFormatting';

const EMPTY_UNITS: readonly unknown[] = [];
const EMPTY_ITEMS: readonly unknown[] = [];
const EMPTY_BATTLE_UPGRADES: readonly unknown[] = [];
const EMPTY_BONUSES: readonly unknown[] = [];

const Overview = () => {
  const { t } = useTranslation('home');
  const { raceName, className } = usePlayerIdentity();
  const [getNews, setNews] = useState([]);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/blog/getRecentPosts');
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setNews(data);
      } catch (error) {
        logError('Failed to fetch news:', error);
      }
    };

    fetchNews();
  }, []);

  const { user, forceUpdate } = useUser();
  const isMobile = useMediaQuery('(max-width: 768px)');

  const newsItems = useMemo(
    () =>
      Array.isArray(getNews)
        ? getNews.map((item: any) => ({
            id: item.id,
            title: item.title,
            content: item.content,
            created_timestamp: item.created_timestamp,
            read: Boolean(item.isRead),
            kind: item.kind ?? undefined,
            isPinned: item.isPinned ?? false,
          }))
        : [],
    [getNews],
  );

  if (!user) {
    return (
      <MainArea title={t('overview.title')}>
        <Center style={{ height: '50vh' }}>
          <Loader data-testid="loading-spinner" />
        </Center>
      </MainArea>
    );
  }

  const recruitLink = user.recruitingLink
    ? `${process.env.NEXT_PUBLIC_URL_ROOT}/recruit/${user.recruitingLink}`
    : '';

  const kingdomStats = [
    {
      icon: faUsers,
      label: t('overview.population'),
      value: toLocale(user.population, user.locale),
      href: '/battle/training',
    },
    {
      key: 'fortHealth',
      icon: faShieldAlt,
      label: t('overview.fortHealth'),
      value: user.fortHealth
        ? `${user.fortHealth.current}/${user.fortHealth.max} (${user.fortHealth.percentage}%)`
        : 'N/A',
      href: '/structures/repair',
    },
    {
      icon: faUserShield,
      label: t('overview.armySize'),
      value: toLocale(user.armySize, user.locale),
      href: '/battle/training',
    },
    {
      icon: faCoins,
      label: t('overview.gold'),
      value: toLocale(user.gold, user.locale),
      href: '/structures/bank',
    },
    {
      icon: faLevelUpAlt,
      label: t('overview.level'),
      value: toLocale(user.level, user.locale),
      href: '/community/stats',
    },
    {
      icon: faSyncAlt,
      label: t('overview.goldPerTurn'),
      value: toLocale(user.goldPerTurn, user.locale),
      href: '/structures/bank',
    },
    {
      icon: faStar,
      label: t('overview.xpToNextLevel'),
      value: toLocale(user.xpToNextLevel, user.locale),
    },
    {
      icon: faPiggyBank,
      label: t('overview.goldInBank'),
      value: toLocale(user.goldInBank, user.locale),
      href: '/structures/bank',
    },
    {
      icon: faMoneyBills,
      label: t('overview.netWorth'),
      value: toLocale(user.netWorth, user.locale),
      href: '/community/stats',
    },
  ];
  return (
    <MainArea title={t('overview.title')}>
      <Center display={isMobile ? 'none' : 'block'}>
        <HeroBanner
          race={user.race}
          maxWidth={isMobile ? '100%' : '80%'}
          height={isMobile ? 120 : 140}
          leftPadding={isMobile ? 130 : 170}
          title={
            <>
              <span className="text-white">{user.displayName}</span>{' '}
              {t(
                user.race === 'ELF' || user.race === 'UNDEAD'
                  ? 'overview.isAn'
                  : 'overview.isA',
              )}{' '}
              <span style={{ color: 'var(--ot-heading)' }}>
                {raceName(user.race)} {className(user.class)}
              </span>
            </>
          }
          subtitle={
            recruitLink ? (
              <>
                {t('overview.shareRecruitLink')}{' '}
                <Anchor href={recruitLink} inherit underline="hover">
                  {user.recruitingLink}
                </Anchor>
              </>
            ) : undefined
          }
        />
      </Center>
      <Text
        size="sm"
        c="var(--ot-muted)"
        ta="center"
        data-testid="content-text"
      >
        {t('overview.kingdomOverview')}
      </Text>
      <Space h="md" />
      {isMobile && (
        <>
          <GameCard
            title={t('overview.commanderBriefing')}
            icon={faCrown}
            goldAccent={false}
          >
            <Text size="md" c="var(--ot-body)" fw={700}>
              {user.displayName}
            </Text>
            <Text size="sm" c="var(--ot-muted)">
              {t(
                user.race === 'ELF' || user.race === 'UNDEAD'
                  ? 'overview.an'
                  : 'overview.a',
              )}{' '}
              {raceName(user.race)} {className(user.class)}
            </Text>
            {recruitLink ? (
              <Text size="sm" c="var(--ot-muted)" mt="sm">
                {t('overview.shareRecruitLink')}{' '}
                <Anchor href={recruitLink} inherit underline="hover">
                  {user.recruitingLink}
                </Anchor>
              </Text>
            ) : null}
          </GameCard>
          <Space h="md" />
        </>
      )}
      <SimpleGrid
        cols={{ base: 1, sm: 3 }}
        spacing="md"
        mb="lg"
        data-tour-id="overview-stats"
      >
        <StatCard
          title={t('overview.gold')}
          value={toLocale(user.gold, user.locale)}
          icon={<FontAwesomeIcon icon={faCoins} />}
          variant="highlight"
          href="/structures/bank"
        />
        <StatCard
          title={t('overview.armySize')}
          value={toLocale(user.armySize, user.locale)}
          icon={<FontAwesomeIcon icon={faUsers} />}
          href="/battle/training"
        />
        <StatCard
          title={t('overview.level')}
          value={toLocale(user.level, user.locale)}
          icon={<FontAwesomeIcon icon={faLevelUpAlt} />}
          subtext={`${t('overview.xpToNextLevel')}: ${toLocale(user.xpToNextLevel, user.locale)}`}
          href="/community/stats"
        />
      </SimpleGrid>
      <GameCard title={t('overview.kingdomStats')} icon={faCrown}>
        <SimpleGrid
          cols={{ base: 1, md: 2 }}
          spacing="sm"
          data-testid="stat-grid"
        >
          {kingdomStats.map((stat) => {
            if (stat.key === 'fortHealth') {
              return (
                <FortHealthStatSlot
                  key="fortHealth"
                  user={user}
                  onRepaired={forceUpdate}
                />
              );
            }
            const cardSlot = (
              <Group
                key={stat.label}
                gap="sm"
                wrap="nowrap"
                data-testid="stat-slot"
                style={{
                  backgroundColor: 'var(--ot-inset)',
                  borderRadius: '6px',
                  border: '1px solid var(--ot-line)',
                  boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                  padding: '12px',
                  alignItems: 'center',
                  cursor: stat.href ? 'pointer' : 'default',
                  transition: stat.href ? 'border-color 0.15s ease' : undefined,
                }}
              >
                <ThemeIcon c="white" variant="light">
                  <FontAwesomeIcon icon={stat.icon} />
                </ThemeIcon>
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.1em' }}
                    data-testid="stat-label"
                  >
                    {stat.label}
                  </Text>
                  <Text
                    size="sm"
                    fw={700}
                    style={{ color: 'var(--ot-accent)' }}
                    data-testid="stat-value"
                  >
                    {stat.value}
                  </Text>
                </div>
              </Group>
            );

            return stat.href ? (
              <Link
                key={stat.label}
                href={stat.href}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                }}
              >
                {cardSlot}
              </Link>
            ) : (
              cardSlot
            );
          })}
        </SimpleGrid>
      </GameCard>

      <Space h="md" />

      <GameCard title={t('overview.militaryStats')} icon={faShieldAlt}>
        <SimpleGrid
          cols={{ base: 1, md: 2 }}
          spacing="sm"
          data-testid="stat-grid"
        >
          {[
            {
              icon: <RpgAwesomeIcon icon="crossed-swords" fw />,
              label: t('overview.offense'),
              value: toLocale(user.getArmyStat('OFFENSE')),
              detail: t('overview.viewBreakdown'),
              withPopover: true,
            },
            {
              icon: <FontAwesomeIcon icon={faTrophy} />,
              label: t('overview.attacksWon'),
              value: `${toLocale(user.statistics('OFFENSE', 'WON'))} / ${toLocale(user.statistics('OFFENSE', 'WON') + user.statistics('OFFENSE', 'LOST'))}`,
              href: '/battle/history',
            },
            {
              icon: <FontAwesomeIcon icon={faShieldAlt} />,
              label: t('overview.defense'),
              value: toLocale(user.defense),
            },
            {
              icon: <FontAwesomeIcon icon={faMedal} />,
              label: t('overview.defendsWon'),
              value: toLocale(user.statistics('DEFENSE', 'WON')),
              href: '/battle/history',
            },
            {
              icon: <FontAwesomeIcon icon={faUserSecret} />,
              label: t('overview.spyOffense'),
              value: toLocale(user.spy),
            },
            {
              icon: <FontAwesomeIcon icon={faCrown} />,
              label: t('overview.spyVictories'),
              value: `${toLocale(user.statistics('SPY', 'WON'))} / ${toLocale(user.statistics('SPY', 'WON') + user.statistics('SPY', 'LOST'))}`,
              href: '/battle/history',
            },
            {
              icon: <FontAwesomeIcon icon={faEye} />,
              label: t('overview.spyDefense'),
              value: toLocale(user.sentry),
            },
            {
              icon: <FontAwesomeIcon icon={faShieldVirus} />,
              label: t('overview.sentryVictories'),
              value: toLocale(user.statistics('SENTRY', 'WON')),
              href: '/battle/history',
            },
          ].map((stat) => {
            const cardSlot = (
              <Group
                key={stat.label}
                gap="sm"
                wrap="nowrap"
                data-testid="stat-slot"
                style={{
                  backgroundColor: 'var(--ot-inset)',
                  borderRadius: '6px',
                  border: '1px solid var(--ot-line)',
                  boxShadow: 'inset 0 3px 6px rgba(0,0,0,0.6)',
                  padding: '12px',
                  alignItems: 'center',
                  cursor: (stat as any).href ? 'pointer' : 'default',
                  transition: (stat as any).href
                    ? 'border-color 0.15s ease'
                    : undefined,
                }}
              >
                <ThemeIcon c="white" variant="light">
                  {stat.icon}
                </ThemeIcon>
                <div>
                  <Text
                    size="xs"
                    fw={700}
                    c="dimmed"
                    tt="uppercase"
                    style={{ letterSpacing: '0.1em' }}
                    data-testid="stat-label"
                  >
                    {stat.label}
                  </Text>
                  {stat.withPopover ? (
                    <Popover
                      width={400}
                      position="bottom"
                      withArrow
                      shadow="md"
                      opened={undefined}
                    >
                      <Popover.Target>
                        <Text
                          size="sm"
                          fw={700}
                          style={{
                            color: 'var(--ot-accent)',
                            cursor: 'pointer',
                            textDecoration: 'underline dotted',
                          }}
                          data-testid="stat-value"
                        >
                          {stat.value}
                        </Text>
                      </Popover.Target>
                      <Popover.Dropdown>
                        {user.getArmyStatBreakdown ? (
                          (() => {
                            const breakdown =
                              user.getArmyStatBreakdown('OFFENSE');
                            if (!breakdown)
                              return (
                                <Text>
                                  {t('overview.noBreakdownAvailable')}
                                </Text>
                              );
                            const {
                              units = EMPTY_UNITS,
                              items = EMPTY_ITEMS,
                              battleUpgrades = EMPTY_BATTLE_UPGRADES,
                              bonuses = EMPTY_BONUSES,
                              finalTotal,
                            } = breakdown;
                            const unitsTotal = units.reduce(
                              (sum, u) => sum + (u.subtotal || 0),
                              0,
                            );
                            const upgradesTotal = battleUpgrades.reduce(
                              (sum, u) => sum + (u.subtotal || 0),
                              0,
                            );
                            const bonusesTotal = bonuses.reduce(
                              (sum, b) => sum + (b.bonusAmount || 0),
                              0,
                            );
                            const itemsByType = items.reduce(
                              (acc, item) => {
                                const type = item.type || 'Unknown';
                                if (!acc[type]) acc[type] = [];
                                acc[type].push(item);
                                return acc;
                              },
                              {} as Record<string, typeof items>,
                            );
                            const itemsTotal = items.reduce(
                              (sum, i) => sum + (i.subtotal || 0),
                              0,
                            );
                            return (
                              <div
                                style={{ maxHeight: 350, overflowY: 'auto' }}
                              >
                                <strong>
                                  {t('overview.offenseBreakdown')}
                                </strong>
                                {units.length > 0 && (
                                  <>
                                    <Text mt="xs" mb={2} fw={700}>
                                      {t('overview.units')}
                                    </Text>
                                    <StyledTable
                                      headers={[
                                        t('overview.name'),
                                        t('overview.quantity'),
                                        t('overview.bonusPerItem'),
                                        t('overview.subtotal'),
                                      ]}
                                    >
                                      {units.map((u, i) => (
                                        <Table.Tr key={`unit-${i}`}>
                                          <Table.Td>{u.name}</Table.Td>
                                          <Table.Td>{u.quantity}</Table.Td>
                                          <Table.Td>{u.bonus}</Table.Td>
                                          <Table.Td>
                                            {toLocale(u.subtotal)}
                                          </Table.Td>
                                        </Table.Tr>
                                      ))}
                                    </StyledTable>
                                  </>
                                )}
                                {Object.keys(itemsByType).length > 0 && (
                                  <>
                                    <Text mt="xs" mb={2} fw={700}>
                                      {t('overview.items')}
                                    </Text>
                                    {Object.entries(itemsByType).map(
                                      ([type, itemsArr]) => (
                                        <div
                                          key={type}
                                          style={{ marginBottom: 8 }}
                                        >
                                          <Text size="sm" fw={600} mb={2}>
                                            {type}
                                          </Text>
                                          <StyledTable
                                            headers={[
                                              t('overview.name'),
                                              t('overview.quantity'),
                                              t('overview.bonusPerItem'),
                                              t('overview.subtotal'),
                                            ]}
                                          >
                                            {(itemsArr as any[]).map(
                                              (it, i) => (
                                                <Table.Tr
                                                  key={`item-${type}-${i}`}
                                                >
                                                  <Table.Td>{it.name}</Table.Td>
                                                  <Table.Td>
                                                    {it.quantity}
                                                  </Table.Td>
                                                  <Table.Td>
                                                    {it.bonus}
                                                  </Table.Td>
                                                  <Table.Td>
                                                    {toLocale(it.subtotal)}
                                                  </Table.Td>
                                                </Table.Tr>
                                              ),
                                            )}
                                          </StyledTable>
                                        </div>
                                      ),
                                    )}
                                  </>
                                )}
                                {battleUpgrades.length > 0 && (
                                  <>
                                    <Text mt="xs" mb={2} fw={700}>
                                      {t('overview.upgrades')}
                                    </Text>
                                    <StyledTable
                                      headers={[
                                        t('overview.name'),
                                        t('overview.bonus'),
                                        t('overview.subtotal'),
                                      ]}
                                    >
                                      {battleUpgrades.map((up, i) => (
                                        <Table.Tr key={`upgrade-${i}`}>
                                          <Table.Td>{up.name}</Table.Td>
                                          <Table.Td>{up.bonus}</Table.Td>
                                          <Table.Td>
                                            {toLocale(up.subtotal)}
                                          </Table.Td>
                                        </Table.Tr>
                                      ))}
                                    </StyledTable>
                                  </>
                                )}
                                {bonuses.length > 0 && (
                                  <>
                                    <Text mt="xs" mb={2} fw={700}>
                                      {t('overview.bonuses')}
                                    </Text>
                                    <StyledTable
                                      headers={[
                                        t('overview.name'),
                                        t('overview.percent'),
                                        t('overview.appliedTo'),
                                        t('overview.bonusAmount'),
                                      ]}
                                    >
                                      {bonuses.map((b, i) => (
                                        <Table.Tr key={`bonus-${i}`}>
                                          <Table.Td>{b.name}</Table.Td>
                                          <Table.Td>
                                            {b.percent ? `+${b.percent}%` : ''}
                                          </Table.Td>
                                          <Table.Td>
                                            {b.appliedTo
                                              ? toLocale(b.appliedTo)
                                              : ''}
                                          </Table.Td>
                                          <Table.Td>
                                            {toLocale(b.bonusAmount)}
                                          </Table.Td>
                                        </Table.Tr>
                                      ))}
                                    </StyledTable>
                                  </>
                                )}
                                <div style={{ fontSize: 13, marginTop: 8 }}>
                                  <strong>{t('overview.equation')}:</strong>
                                  <br />({toLocale(unitsTotal)}{' '}
                                  {t('overview.units')}
                                  {itemsTotal
                                    ? ` + ${toLocale(itemsTotal)} ${t('overview.items')}`
                                    : ''}
                                  {upgradesTotal
                                    ? ` + ${toLocale(upgradesTotal)} ${t('overview.upgrades')}`
                                    : ''}
                                  )
                                  {bonusesTotal
                                    ? ` + ${toLocale(bonusesTotal)} ${t('overview.bonuses')}`
                                    : ''}
                                  = <strong>{toLocale(finalTotal)}</strong>
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <Text>{t('overview.noBreakdownAvailable')}</Text>
                        )}
                      </Popover.Dropdown>
                    </Popover>
                  ) : (
                    <Text
                      size="sm"
                      fw={700}
                      style={{ color: 'var(--ot-accent)' }}
                      data-testid="stat-value"
                    >
                      {stat.value}
                    </Text>
                  )}
                  {stat.detail ? (
                    <Text size="xs" c="dimmed">
                      {stat.detail}
                    </Text>
                  ) : null}
                </div>
              </Group>
            );

            return (stat as any).href ? (
              <Link
                key={stat.label}
                href={(stat as any).href}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                }}
              >
                {cardSlot}
              </Link>
            ) : (
              cardSlot
            );
          })}
        </SimpleGrid>
      </GameCard>

      <Space h="md" />

      <StyledNews news={newsItems} />
    </MainArea>
  );
};

export default Overview;
