import { getSession } from 'next-auth/react';
import { Container, Title, Text, Card, Group, Divider, Badge, Button, Space, Anchor, Breadcrumbs } from '@mantine/core';
import prisma from '@/lib/prisma'; // Ensure your Prisma client is properly imported
import { useUser } from '@/context/users';
import { InferGetServerSidePropsType } from "next";
import { useBreadcrumbs } from '@/context/BreadcrumbContext';
import PageTemplate from '@/components/PageTemplate';
import { useRouter } from 'next/router';

const Index = ({ alliances }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { user } = useUser();  // Assuming useUser returns the current user object
  const router = useRouter();  // Initialize the router

  const handleCreateButtonClick = () => {
    router.push('/alliances/create'); // Navigate to the /create page
  };

  const handleMembersClick = (id) => {
    router.push(`/alliances/${id}/members`); // Navigate to the /members page
  }
  return (
    <PageTemplate title="My Alliances">
      <Container size="lg">
        <Group position="right" mb="md" mt={'md'}>
          <Button variant="outline" onClick={handleCreateButtonClick}>Create Alliance</Button>
        </Group>

        {alliances.map(alliance => (
          <>
          <Card shadow="sm" p="lg" radius="md" key={alliance?.id}>
            <Group position="apart">
              <Text fw={'bold'} size='lg'>{alliance.name}</Text>
              <Badge color='brand' variant='outline'>
                <Text size='sm' c='dimmed' mt={'1px'}>{user?.id === alliance?.leader?.id ? 'LEADER' : 'Led by: ' + alliance.leader.display_name}</Text>
              </Badge>
            </Group>
            <Divider my="sm" />
            <Text size="sm">Members: {alliance._count.members}</Text>
            <Group mt="md">
              {user?.id === alliance?.leader?.id && (
                <>
                  <Button variant="subtle">Modify Profile</Button>
                  <Button color="red" variant="subtle" onClick={()=>alert("Not implemented yet")}>Disband</Button>
                  <Button variant="subtle">Change Leader</Button>
                </>
              )}
                <Button variant="subtle" disabled>Allies</Button>
                <Button variant="subtle" disabled>Enemies</Button>
              <Button variant="subtle" onClick={() => handleMembersClick(alliance.id)}>Members List</Button>
              <Button variant="subtle" disabled>Access</Button>
                <Button variant="subtle" disabled>Invite</Button>
              <Button variant="subtle">Ranks</Button>
              <Button variant="subtle" disabled>Lists</Button>
              <Button variant="subtle" disabled>Message Center</Button>
            </Group>
          </Card>
          
            <Space h='md' />
          </>
        ))}
      </Container>
    </PageTemplate>
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
