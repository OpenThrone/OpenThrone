import Alert from '@/components/alert';
import NewsAccordion from '@/components/newsAccordion';
import { useUser } from '@/context/users';
import { toLocale } from '@/utils/numberFormatting';
import { useEffect, useState } from 'react';
import { Text, Card, Space, Table, Group, Center, Flex } from '@mantine/core';

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
    <div className="mainArea pb-10">
      <Text
        style={{
          background: 'linear-gradient(360deg, orange, darkorange)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          fontSize: '1.5rem',
          fontWeight: 'bold',
        }}
      >
        Overview
      </Text>
      <Space h="md" />
      <Center>
        <Text size="lg" align="center">
          <span className="text-white">{user?.displayName}</span> is a{user?.race === 'ELF' || user?.race === 'UNDEAD' ? 'n ' : ' '}
          {user?.race} {user?.class}
        </Text>
      </Center>
      <Space h="md" />
      <Group position="apart" grow>
        <Alert />
      </Group>
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
      <Space h="md" />
      <Flex
        direction={{ base: 'column', sm: 'row' }}
        gap="md"
        className="my-4"
      >
        <Card shadow="sm" ps="md" pb='md' radius="md" className="w-full">
          <Table striped highlightOnHover verticalSpacing="md" className="text-white">
            <Table.Thead>
              <Table.Tr>
                <Table.Th colSpan={4}>
                  <Center>
                    <Text size='md' fw={'bolder'} className='font-medieval'>Statistics</Text>
                  </Center>
                </Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>Population</Table.Td>
                <Table.Td>{toLocale(user?.population, user?.locale)}</Table.Td>
                <Table.Td>Fort Health</Table.Td>
                <Table.Td>
                  {user?.fortHealth.current}/{user?.fortHealth.max}({user?.fortHealth.percentage}%)
                </Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Army Size</Table.Td>
                <Table.Td>{toLocale(user?.armySize, user?.locale)}</Table.Td>
                <Table.Td>Gold</Table.Td>
                <Table.Td>{toLocale(user?.gold, user?.locale)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Level</Table.Td>
                <Table.Td>{toLocale(user?.level, user?.locale)}</Table.Td>
                <Table.Td>Gold Per Turn</Table.Td>
                <Table.Td>{toLocale(user?.goldPerTurn, user?.locale)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>XP to Next Level</Table.Td>
                <Table.Td>{toLocale(user?.xpToNextLevel, user?.locale)}</Table.Td>
                <Table.Td>Gold in Bank</Table.Td>
                <Table.Td>{toLocale(user?.goldInBank, user?.locale)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Card>
        <Card shadow="sm" ps="md" pb='md' radius="md" className="w-full">
          <Table striped highlightOnHover verticalSpacing="md" className="text-white">
            <Table.Thead>
              <Table.Tr>
                <Table.Th colSpan={4}><Center><Text size='md' fw={'bolder'} className='font-medieval'>War Statistics</Text></Center></Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              <Table.Tr>
                <Table.Td>Offense</Table.Td>
                <Table.Td>{user ? toLocale(user.offense) : '0'}</Table.Td>
                <Table.Td>Attacks Won</Table.Td>
                <Table.Td>{user ? toLocale(user.attacksWon) : '0'}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Defense</Table.Td>
                <Table.Td>{toLocale(user?.defense)}</Table.Td>
                <Table.Td>Defends Won</Table.Td>
                <Table.Td>{toLocale(user?.defendsWon)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Spy Offense</Table.Td>
                <Table.Td>{toLocale(user?.spy)}</Table.Td>
                <Table.Td>Spy Victories</Table.Td>
                <Table.Td>{toLocale(user?.spyVictories)}</Table.Td>
              </Table.Tr>
              <Table.Tr>
                <Table.Td>Spy Defense</Table.Td>
                <Table.Td>{toLocale(user?.sentry)}</Table.Td>
                <Table.Td>Sentry Victories</Table.Td>
                <Table.Td>{toLocale(user?.sentryVictories)}</Table.Td>
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Card>
      </Flex>
      <Text size="xl" weight={700} align="center">Recent News</Text>
      <Space h="md" />
      <NewsAccordion news={getNews} />
    </div>
  );
};

export default Overview;
