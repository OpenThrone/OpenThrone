import { getSession } from 'next-auth/react';
import { Container, Title, Text, Card, Group, Divider, Badge, Button, Space } from '@mantine/core';
import prisma from '@/lib/prisma'; // Ensure your Prisma client is properly imported
import { useUser } from '@/context/users';
import { InferGetServerSidePropsType } from "next";

const Index = ({ alliances }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { user } = useUser();  // Assuming useUser returns the current user object
  return (
    <Container size="lg" mt={40}>
      <Title order={1}>My Alliances</Title>
      <Group position="right" mb="md">
        <Button variant="outline">Create Alliance</Button>
      </Group>

      {alliances.map(alliance => (
        <>
        <Card shadow="sm" p="lg" radius="md" key={alliance?.id}>
          <Group position="apart">
            <Text fw={'bold'} size='lg'>{alliance.name}</Text>
            <Badge color='brand' variant='outline'>
              <Text size='sm' c='dimmed'>{user?.id === alliance?.leader?.id ? 'LEADER' : 'Led by: ' + alliance.leader.display_name}</Text>
            </Badge>
          </Group>
          <Divider my="sm" />
          <Text size="sm">Members: {alliance._count.members}</Text>
          <Group mt="md">
            {user?.id === alliance?.leader?.id && (
              <>
                <Button variant="subtle">Modify Profile</Button>
                <Button color="red" variant="subtle">Disband</Button>
                <Button variant="subtle">Change Leader</Button>
              </>
            )}
            <Button variant="subtle">Allies</Button>
            <Button variant="subtle">Enemies</Button>
            <Button variant="subtle">Members List</Button>
            <Button variant="subtle">Access</Button>
            <Button variant="subtle">Invite</Button>
            <Button variant="subtle">Ranks</Button>
            <Button variant="subtle">Lists</Button>
            <Button variant="subtle">Message Center</Button>
          </Group>
        </Card>
        
          <Space h='md' />
        </>
      ))}
    </Container>
  );
};

export const getServerSideProps = async (context) => {
  const session = await getSession(context);
  const userId = parseInt(session?.user?.id.toString());
  const alliances = await prisma.alliances.findMany({
    where: {
      members: {
        some: {
          user_id: userId
        }
      }
    },
    include: {
      leader: {
        select: {
          display_name: true,
          race: true,
          id: true
        },
      },
      members: true,
      _count: {
        select: {
          members: true,
        },
      },
    },
  });

  if (!alliances) {
    return { notFound: true };
  }

  return { props: { alliances } };
};

export default Index;
