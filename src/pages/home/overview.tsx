import Alert from '@/components/alert';
import NewsAccordion from '@/components/newsAccordion';
import { useUser } from '@/context/users';
import { toLocale } from '@/utils/numberFormatting';
import { useEffect, useState } from 'react';
import { Text, Card, Space, Table, Group, Center, Flex, ThemeIcon, Paper } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faShieldAlt, faUserShield, faCoins, faLevelUpAlt, faSyncAlt, faStar, faPiggyBank, faTrophy, faMedal, faUserSecret, faCrown, faEye, faShieldVirus } from '@fortawesome/free-solid-svg-icons';
import PageTemplate from '@/components/PageTemplate';

const Overview = (props) => {
  const [getNews, setNews] = useState(['no news']);

  useEffect(() => {
    const fetchNews = async () => {
      try {
        const response = await fetch('/api/blog/getRecentPosts');
        console.log('response: ', response);
        if (!response.ok) {
          throw new Error('Network response was not ok');
        }
        const data = await response.json();
        setNews(data);
      } catch (error) {
        console.error('Failed to fetch news:', error);
      }
    };

    fetchNews();
  }, []);

  const { user } = useUser();

  return (
    <PageTemplate title="Overview">
      <Space h="md" />
      <Center>
        <Paper w={{ sm: '100%', md: '80%' }} shadow="sm" ps="sm" pb='md' radius="md">
          <Group position="apart" grow>
            <Alert />
          </Group>
          <Space h="md" />
          <Center>
            <div className='hidden md:block'>
              <Text size="lg" align="center">
                <span className="text-white">{user?.displayName}</span> is a{user?.race === 'ELF' || user?.race === 'UNDEAD' ? 'n ' : ' '}
                {user?.race} {user?.class}
              </Text>
            </div>
            <div className='block md:hidden'>
              <Text size="lg" align="center">
                <span className="text-white">{user?.displayName}</span></Text>
              <Text size='md' align='center'>
                {user?.race === 'ELF' || user?.race === 'UNDEAD' ? 'n ' : ' '}
                {user?.race} {user?.class}
              </Text>
            </div>
          </Center>
          <Space h="md" />
          <Center>
            <Text size="lg" align="center">
              Share this link to gain up to 25 citizens per day: {' '}
              <a
                href={`https://OpenThrone.dev/recruit/${user?.recruitingLink}`}
                style={{ color: '#1E90FF' }}
              >
                {user?.recruitingLink}
              </a>
            </Text>
          </Center>
        </Paper>
      </Center>
      <Space h="md" />
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="md"
        className="my-4"
      >
        <Card shadow="sm" ps="xs" pb='md' radius="md" className="w-full">
          <Table striped highlightOnHover verticalSpacing="md" className="text-white">
            <Table.Thead>
              <Table.Tr>
                <Table.Th colSpan={2}>
                  <Center>
                    <Text size='md' fw={'bolder'} className='font-medieval'>Statistics</Text>
                  </Center>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
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
            </Table.Tbody>
          </Table>
        </Card>
        <Card shadow="sm" ps="md" pb='md' radius="md" className="w-full">
          <Table striped highlightOnHover verticalSpacing="md" className="text-white">
            <Table.Thead>
              <Table.Tr>
                <Table.Th colSpan={2}><Center><Text size='md' fw={'bolder'} className='font-medieval'>War Statistics</Text></Center></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>
                  <Group wrap='nowrap'>
                    <ThemeIcon c='white'>
                      <i className="ra ra-crossed-swords ra-fw" />
                    </ThemeIcon>
                    <div>
                      <Text size="md" fw={700} color="dimmed">Offense</Text>
                      <Text>{user ? toLocale(user.offense) : '0'}</Text>
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
        </Card>
      </Flex>
      <Text size="xl" fw={700} align="center">Recent News</Text>
      <Space h="md" />
      <NewsAccordion news={getNews} />
    </PageTemplate>
  );
};

export default Overview;
