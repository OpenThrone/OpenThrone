import { Card, Avatar, Text, Group, Button, SimpleGrid, Image, Flex, Stack, Space, Paper, Pagination, Table, Modal } from '@mantine/core';
import classes from './browse.module.css';
import toLocale from '@/utils/numberFormatting';
import { useEffect, useState } from 'react';

import Alert from '@/components/alert';
import { getSession } from 'next-auth/react';
import { InferGetServerSidePropsType } from "next";
import { useDisclosure } from '@mantine/hooks';
import { useRouter } from 'next/router';
import { useUser } from '@/context/users';
import user from '../messaging/compose/[user]';

export const UserCardImage = ({ name, members, description, gold, joinText, imgsrc, bannerimgsrc, leader, isMember,id }) => {

  const [opened, { open, close }] = useDisclosure(false); // modal for join not implemented
  const router = useRouter();
  const { user } = useUser();
  const handleView = () => {
    router.push(`/alliances/${id}`);
  }
  return (
    <Card withBorder padding="lg" radius="md" className={classes.card}>
      <Card.Section>
        <Image src={bannerimgsrc} alt={name} fit='none' style={{ height: '140px' }} width={'100%'} />
      </Card.Section>
      <Avatar
        src={imgsrc}
        size={120}
        radius={120}
        mx="auto"
        mt={-30}
        className={classes.avatar}
        
      />
      <Text ta="center" fz="lg" fw={500} mt="sm">
        {name}
      </Text>
      <Text ta="center" fz="sm" c="dimmed">
        {description}
      </Text>
      <Space h="md" />
      <Paper bg='dark' p='sm' radius={'md'} shadow='lg'>
      <Flex justify='space-between'>
        <Stack justify='center'>
        <Text ta="center" fz="sm" c="dimmed" lh={1}>
          Leader
        </Text>
        <Text ta="center" fz="lg" fw={500}>
          {leader.display_name}
          </Text>
        </Stack>
        <Stack>
        <Text ta="center" fz="sm" c="dimmed" lh={1}>
          Members
        </Text>
        <Text ta="center" fz="lg" fw={500}>
          {toLocale(members)}
          </Text>
        </Stack>
        </Flex>
      </Paper>
      <Space h="md" />
      {!isMember && (
        <Button fullWidth radius="md" mt="sm" size="md" variant="default" onClick={open}>
          {joinText || 'Join'}
        </Button>
      )}
      {leader.id === user?.id && (
       <Button fullWidth radius="md" mt="sm" size="md" variant="default" onClick={open}>
          Manage
        </Button>  
      )}
      <Button fullWidth radius="md" mt="sm" size="md" variant="light" onClick={handleView}>
        View
      </Button>
      <Modal opened={opened} onClose={close} title="Not Implemeted">
        <Text>Feature is not implemented yet.</Text>
      </Modal>
    </Card>
  );
};

const Browse = ({ processedAlliances, totalCount, page, pageSize }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const [viewMode, setViewMode] = useState('cards');  // 'cards' or 'table'
  const [opened, { open, close }] = useDisclosure(false); // modal for join not implemented

  const handlePageChange = (page) => {
    window.location.href = `/browse?page=${page}`;  // Update to use your routing logic
  };

  const { user } = useUser();

  return (
    <div className="mainArea pb-10">
      <h2 className="page-title">Alliances</h2>
      <div className="my-5 flex justify-between">
        <Button onClick={() => setViewMode('cards')}>Card View</Button>
        <Button onClick={() => setViewMode('table')}>Table View</Button>
        <Alert />
      </div>

      <Modal opened={opened} onClose={close} title="Not Implemeted">
        <Text>Joining an alliance is not implemented yet.</Text>
      </Modal>
      {viewMode === 'cards' ? (
        <SimpleGrid cols={{ base: 1, sm: 2, md: 3, lg: 3 }}>
          {processedAlliances.map((alliance) => (
            <UserCardImage
              key={alliance.id}
              name={alliance.name}
              description={alliance.motto}
              members={alliance.members.length}
              gold={0}
              joinText="Join"
              imgsrc={alliance.avatar || '/path/to/default/avatar.png'}
              bannerimgsrc={alliance.bannerimg || '/path/to/default/banner.png'}
              leader={alliance.leader}
              isMember={alliance.isMember}
              id={alliance.id}
            />
          ))}
        </SimpleGrid>
      ) : (
          <Paper>
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
                <Table.Th>Name</Table.Th>
                <Table.Th>Members</Table.Th>
                  <Table.Th>Leader</Table.Th>
                  <Table.Th>Actions</Table.Th>
              </Table.Tr>
            </Table.Thead>
          <Table.Tbody>
            {processedAlliances.map((alliance) => (
              <Table.Tr key={alliance.id}>
                <Table.Td>{alliance.name}</Table.Td>
                <Table.Td>{toLocale(alliance.members.length)}</Table.Td>
                <Table.Td>{alliance.leader.display_name}</Table.Td>
                <Table.Td>
                  <Group grow>
                    <Button size="sm" variant="light">View</Button>
                    {!alliance.isMember && <Button size="sm" variant="default" onClick={open}>Join</Button>}
                    {alliance.leader.id === user?.id && (
                      <Button size="sm" variant="default" onClick={open}>Manage</Button>
                    )}
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
            </Table>
          </Paper>
      )}
      <Space h="lg" />
      <Pagination total={Math.ceil(totalCount / pageSize)} page={page} onChange={handlePageChange} withControls withEdges />
    </div>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);
  const page = parseInt(context.query.page) || 1;
  const pageSize = 12;

  if (!session) {
    return { redirect: { destination: '/login', permanent: false } };
  }

  let alliances = await prisma.alliances.findMany({
    take: pageSize,
    skip: (page - 1) * pageSize,
    include: {
      leader: {
        select: {
          display_name: true,
          id: true,
        },
      },
      members: {
        select: {
          user_id: true,
        },
      },
    },
  });

  const totalCount = await prisma.alliances.count();

  // Compute members count and sort
  alliances = alliances.map(alliance => ({
    ...alliance,
    isMember: alliance.members.some(member => member.user_id === parseInt(session.user.id)),
    membersCount: alliance.members.length,  // Add members count for sorting
  }));

  alliances.sort((a, b) => b.membersCount - a.membersCount);  // Sort by members count

  return {
    props: {
      processedAlliances: alliances,
      totalCount,
      page,
      pageSize
    }
  };
};



export default Browse;
