import NewsAccordion from '@/components/newsAccordion';
import { useUser } from '@/context/users';
import { toLocale } from '@/utils/numberFormatting';
import { useEffect, useState } from 'react';
import { Text, Card, Space, Table, Group, Center, Flex, ThemeIcon, Paper, Popover } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faShieldAlt, faUserShield, faCoins, faLevelUpAlt, faSyncAlt, faStar, faPiggyBank, faTrophy, faMedal, faUserSecret, faCrown, faEye, faShieldVirus, faMoneyBills } from '@fortawesome/free-solid-svg-icons';
import MainArea from '@/components/MainArea';
import RpgAwesomeIcon from '@/components/RpgAwesomeIcon';
import ContentCard from '@/components/ContentCard';
import { logError } from '@/utils/logger';

const Overview = (props) => {
  const [getNews, setNews] = useState(['no news']);

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

  const { user } = useUser();

  return (
    <MainArea
      title="Overview">
      <Center>
        <ContentCard className="my-4" titlePosition='center' w={{ sm: '100%', md: '80%' }} variant='highlight'>
          <Center>
            <div className='hidden md:block'>
              <Text size="lg" ta="center">
                <span className="text-white">{user?.displayName}</span> is a{user?.race === 'ELF' || user?.race === 'UNDEAD' ? 'n ' : ' '}
                {user?.race} {user?.class}
              </Text>
            </div>
            <div className='block md:hidden'>
              <Text size="lg" ta="center">
                <span className="text-white">{user?.displayName}</span></Text>
              <Text size='md' ta='center'>
                {user?.race === 'ELF' || user?.race === 'UNDEAD' ? 'n ' : ' '}
                {user?.race} {user?.class}
              </Text>
            </div>
          </Center>
          <Space h="md" />
          <Center>
            <Text size="lg" ta="center">
              Share this link to gain up to 25 citizens per day: {' '}
              <a
                href={`${process.env.NEXT_PUBLIC_URL_ROOT}/recruit/${user?.recruitingLink}`}
                style={{ color: '#1E90FF' }}
              >
                {user?.recruitingLink}
              </a>
            </Text>
          </Center>
        </ContentCard>
      </Center>
      <Space h="md" />
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="md"
        className="my-4"
      >
        <ContentCard className="w-full" title="Kingdom Stats" titleSize="lg" titlePosition='center'>
          <Table striped highlightOnHover verticalSpacing="sm" className="text-white">

            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faUsers} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Population</Text>
                      <Text>{toLocale(user?.population, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faShieldAlt} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Fort Health</Text>
                      <Text>{user?.fortHealth.current}/{user?.fortHealth.max}({user?.fortHealth.percentage}%)</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faUserShield} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Army Size</Text>
                      <Text>{toLocale(user?.armySize, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faCoins} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Gold</Text>
                      <Text>{toLocale(user?.gold, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faLevelUpAlt} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Level</Text>
                      <Text>{toLocale(user?.level, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faSyncAlt} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Gold Per Turn</Text>
                      <Text>{toLocale(user?.goldPerTurn, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faStar} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">XP to Next Level</Text>
                      <Text>{toLocale(user?.xpToNextLevel, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faPiggyBank} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Gold in Bank</Text>
                      <Text>{toLocale(user?.goldInBank, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faMoneyBills} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Net Worth</Text>
                      <Text>{toLocale(user?.netWorth, user?.locale)}</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </ContentCard>
        <ContentCard className="w-full" title="Military Stats" titleSize="lg" titlePosition='center'>
          <Table striped highlightOnHover verticalSpacing="sm" className="text-white">
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <RpgAwesomeIcon icon="crossed-swords" fw />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Offense</Text>
                      <Popover width={400} position="bottom" withArrow shadow="md" opened={undefined}>
                        <Popover.Target>
                          <Text style={{ cursor: 'pointer', textDecoration: 'underline dotted' }}>
                            {user ? toLocale(user.getArmyStat('OFFENSE', 2)) : '0'}
                          </Text>
                        </Popover.Target>
                        <Popover.Dropdown>
                          {user && user.getArmyStatBreakdown ? (() => {
                            const breakdown = user.getArmyStatBreakdown('OFFENSE');
                            if (!breakdown) return <Text>No breakdown available</Text>;
                            const { units = [], items = [], battleUpgrades = [], bonuses = [], total, finalTotal } = breakdown;
                            const unitsTotal = units.reduce((sum, u) => sum + (u.subtotal || 0), 0);
                            const upgradesTotal = battleUpgrades.reduce((sum, u) => sum + (u.subtotal || 0), 0);
                            const bonusesTotal = bonuses.reduce((sum, b) => sum + (b.bonusAmount || 0), 0);
                            // Group items by type
                            const itemsByType = items.reduce((acc, item) => {
                              if (!acc[item.type]) acc[item.type] = [];
                              acc[item.type].push(item);
                              return acc;
                            }, {});
                            const itemsTotal = items.reduce((sum, i) => sum + (i.subtotal || 0), 0);
                            return (
                              <div style={{ maxHeight: 350, overflowY: 'auto' }}>
                                <strong>Offense Breakdown</strong>
                                {/* Units Table */}
                                {units.length > 0 && <>
                                  <Text mt="xs" mb={2} fw={700}>Units</Text>
                                  <Table withColumnBorders striped highlightOnHover verticalSpacing="xs" mb="xs">
                                    <Table.Thead>
                                      <Table.Tr>
                                        <Table.Th>Name</Table.Th>
                                        <Table.Th>Quantity</Table.Th>
                                        <Table.Th>Bonus/ea</Table.Th>
                                        <Table.Th>Subtotal</Table.Th>
                                      </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                      {units.map((u, i) => (
                                        <Table.Tr key={`unit-${i}`}>
                                          <Table.Td>{u.name}</Table.Td>
                                          <Table.Td>{u.quantity}</Table.Td>
                                          <Table.Td>{u.bonus}</Table.Td>
                                          <Table.Td>{toLocale(u.subtotal)}</Table.Td>
                                        </Table.Tr>
                                      ))}
                                    </Table.Tbody>
                                  </Table>
                                </>}
                                {/* Items Tables by Type */}
                                {Object.keys(itemsByType).length > 0 && <>
                                  <Text mt="xs" mb={2} fw={700}>Items</Text>
                                  {Object.entries(itemsByType).map(([type, itemsArr]) => (
                                    <div key={type} style={{ marginBottom: 8 }}>
                                      <Text size="sm" fw={600} mb={2}>{type}</Text>
                                      <Table withColumnBorders striped highlightOnHover verticalSpacing="xs" mb="xs">
                                        <Table.Thead>
                                          <Table.Tr>
                                            <Table.Th>Name</Table.Th>
                                            <Table.Th>Quantity</Table.Th>
                                            <Table.Th>Bonus/ea</Table.Th>
                                            <Table.Th>Subtotal</Table.Th>
                                          </Table.Tr>
                                        </Table.Thead>
                                        <Table.Tbody>
                                          {itemsArr.map((it, i) => (
                                            <Table.Tr key={`item-${type}-${i}`}>
                                              <Table.Td>{it.name}</Table.Td>
                                              <Table.Td>{it.quantity}</Table.Td>
                                              <Table.Td>{it.bonus}</Table.Td>
                                              <Table.Td>{toLocale(it.subtotal)}</Table.Td>
                                            </Table.Tr>
                                          ))}
                                        </Table.Tbody>
                                      </Table>
                                    </div>
                                  ))}
                                </>}
                                {/* Upgrades Table */}
                                {battleUpgrades.length > 0 && <>
                                  <Text mt="xs" mb={2} fw={700}>Upgrades</Text>
                                  <Table withColumnBorders striped highlightOnHover verticalSpacing="xs" mb="xs">
                                    <Table.Thead>
                                      <Table.Tr>
                                        <Table.Th>Name</Table.Th>
                                        <Table.Th>Bonus</Table.Th>
                                        <Table.Th>Subtotal</Table.Th>
                                      </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                      {battleUpgrades.map((up, i) => (
                                        <Table.Tr key={`upgrade-${i}`}>
                                          <Table.Td>{up.name}</Table.Td>
                                          <Table.Td>{up.bonus}</Table.Td>
                                          <Table.Td>{toLocale(up.subtotal)}</Table.Td>
                                        </Table.Tr>
                                      ))}
                                    </Table.Tbody>
                                  </Table>
                                </>}
                                {/* Bonuses Table */}
                                {bonuses.length > 0 && <>
                                  <Text mt="xs" mb={2} fw={700}>Bonuses</Text>
                                  <Table withColumnBorders striped highlightOnHover verticalSpacing="xs" mb="xs">
                                    <Table.Thead>
                                      <Table.Tr>
                                        <Table.Th>Name</Table.Th>
                                        <Table.Th>Percent</Table.Th>
                                        <Table.Th>Applied To</Table.Th>
                                        <Table.Th>Bonus Amount</Table.Th>
                                      </Table.Tr>
                                    </Table.Thead>
                                    <Table.Tbody>
                                      {bonuses.map((b, i) => (
                                        <Table.Tr key={`bonus-${i}`}>
                                          <Table.Td>{b.name}</Table.Td>
                                          <Table.Td>{b.percent ? `+${b.percent}%` : ''}</Table.Td>
                                          <Table.Td>{b.appliedTo ? toLocale(b.appliedTo) : ''}</Table.Td>
                                          <Table.Td>{toLocale(b.bonusAmount)}</Table.Td>
                                        </Table.Tr>
                                      ))}
                                    </Table.Tbody>
                                  </Table>
                                </>}
                                {/* Equation */}
                                <div style={{ fontSize: 13, marginTop: 8 }}>
                                  <strong>Equation:</strong><br />
                                  ({toLocale(unitsTotal)} units
                                  {itemsTotal ? ` + ${toLocale(itemsTotal)} items` : ''}
                                  {upgradesTotal ? ` + ${toLocale(upgradesTotal)} upgrades` : ''}
                                  )
                                  {bonusesTotal ? ` + ${toLocale(bonusesTotal)} bonuses` : ''}
                                  = <strong>{toLocale(finalTotal)}</strong>
                                </div>
                              </div>
                            );
                          })() : (
                            <Text>No breakdown available</Text>
                          )}
                        </Popover.Dropdown>
                      </Popover>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faTrophy} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Attacks Won</Text>
                      
                        <Text>{user ? toLocale(user?.statistics('OFFENSE', 'WON')) : '0'}
                        {' '}/ {user ? user?.statistics('OFFENSE', 'WON') + user?.statistics('OFFENSE', 'LOST') : '0'}
                        </Text>
                      
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faShieldAlt} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Defense</Text>
                      <Text>{toLocale(user?.defense)}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faMedal} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Defends Won</Text>
                      <Text>{toLocale(user?.statistics('DEFENSE', 'WON'))}</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faUserSecret} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Spy Offense</Text>
                      <Text>{toLocale(user?.spy)}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faCrown} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Spy Victories</Text>
                      <Text>{toLocale(user?.statistics('SPY', 'WON'))}{' '}/ {user ? user.statistics('SPY', 'WON') + user.statistics('SPY', 'LOST') : '0'}</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faEye} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Spy Defense</Text>
                      <Text>{toLocale(user?.sentry)}</Text>
                    </div>
                  </Group>
                </Table.Td>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <FontAwesomeIcon icon={faShieldVirus} />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Sentry Victories</Text>
                      <Text>{toLocale(user?.statistics('SENTRY', 'WON'))}</Text>
                    </div>
                  </Group>
                </Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </ContentCard>
      </Flex>
      <ContentCard className="my-4" title="Kingdom News" titleSize="lg" titlePosition='center'>
        <NewsAccordion news={getNews} />
      </ContentCard>
    </MainArea>
  );
};

export default Overview;
