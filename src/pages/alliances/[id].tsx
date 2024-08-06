import Alert from "@/components/alert";
import { InferGetServerSidePropsType } from "next";
import prisma from "@/lib/prisma";
import { Text, Title, Image, Flex, Paper, SimpleGrid, Grid, Group, BackgroundImage, Container, Table, Button, Anchor, Breadcrumbs } from "@mantine/core";
import { useUser } from "@/context/users";
import { useBreadcrumbs } from "@/context/BreadcrumbContext";
import PageTemplate from "@/components/PageTemplate";

const Index = ({ alliance }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  const { user } = useUser();
  const {breadcrumbs} = useBreadcrumbs();
  return (
    <PageTemplate title={'Alliance Profile'}>
      <div className="my-2 flex justify-between">
        <Alert />
      </div>
      <div className="container mx-auto text-center">
        <Title order={2} fw={'bold'}>
          {alliance.name}
        </Title>
        <Text fw='bold' size='xl' c='dimmed'>
          {alliance.motto}
        </Text>
        <Flex justify='space-between' my='4'>
          <p className="mb-0">Leader: {alliance.leader.display_name}</p>
          <p className="mb-0">Members: {alliance._count.members}</p>
        </Flex>
      </div>
      <Grid>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Paper radius={'md'}>
            <BackgroundImage
              src={alliance.bannerimg}
              radius="sm"
            >
              <Flex justify='center'>
                <Image
                  src={alliance.avatar}
                  style={{ width: '100%', height: 'auto', marginLeft: 2 }}
                  alt='avatar'
                  width={484}
                  height={484}
                />
              </Flex>
            </BackgroundImage>
          </Paper>
        </Grid.Col>
        <Grid.Col span={{ base: 12, sm: 6 }}>
          <Paper radius={'xs'}>
            <Group grow>  
              <Text>
                  Right side panel - use for actions/navigation like userprofile
              </Text>

            </Group>
          </Paper>
        </Grid.Col>
        <Grid.Col span={12}>
          <Paper>
              <Text>
                Bottom panel - Show Members List if enabled - Refactor this out to its own component
              </Text>
              <Text>
                Members
              </Text>
              <Table>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Member</Table.Th>
                  <Table.Th>Role</Table.Th>
                  <Table.Th>Gold</Table.Th>
                  <Table.Th>Experience</Table.Th>
                  <Table.Th>Actions</Table.Th>
                  </Table.Tr>
                </Table.Thead>
              <Table.Tbody>
                {alliance.members.map((member) => (
                  <Table.Tr key={'Member_'+ member.id}>
                    <Table.Td>{member.user.display_name}</Table.Td>
                    <Table.Td>{member.role.name}</Table.Td>
                    <Table.Td>{member.user.gold}</Table.Td>
                    <Table.Td>{member.user.experience}</Table.Td>
                    <Table.Td>
                      <Group grow>
                        <Button size="sm" variant="light" disabled>View</Button>
                        {alliance.leader.id === user?.id && (
                          <Button size="sm" variant="default" disabled>Kick</Button>
                        )}
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                ))}
                </Table.Tbody>
              </Table>
          </Paper>
        </Grid.Col>
      </Grid>      
    </PageTemplate>
  );

}

export const getServerSideProps = async ({ query }) => {
  const { id } = query;

  let whereCondition;

  if (isNaN(parseInt(id))) {
    // If `id` is not a number, treat it as a slug
    whereCondition = { slug: id };
  } else {
    // If `id` is a number, treat it as an ID
    whereCondition = { id: parseInt(id) };
  }

  const alliance = await prisma.alliances.findFirst({
    where: whereCondition,
    include: {
      leader: {
        select: {
          display_name: true,
          id: true,
        },
      },
      _count: {
        select: {
          members: true,
        },
      },
      members: {
        include: {
          user: {
            select: {
              display_name: true,
              id: true,
              race: true,
              experience: true,
              gold: true,
              class: true,
            },
          },
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    },
  });

  if (!alliance) {
    return { notFound: true };
  }

  return { props: { alliance } };
};

export default Index;