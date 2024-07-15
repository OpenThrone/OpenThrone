import Alert from "@/components/alert";
import { InferGetServerSidePropsType } from "next";
import prisma from "@/lib/prisma";
import { Text, Title, Image } from "@mantine/core";

const Index = ({ alliance }: InferGetServerSidePropsType<typeof getServerSideProps>) => {
  return (
    <div className = "mainArea pb-10" >
      <h2 className="page-title">Alliance Profile</h2>

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
        <div className="my-4 flex justify-around">
          <p className="mb-0">Leader: {alliance.leader.display_name}</p>
          <p className="mb-0">Members: {alliance._count.members}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="col-span-1">
          <div className="card-dark">
            <div className="flex items-center justify-center">
              <Image
                src={alliance.avatar}
                style={{ width: '100%', height: 'auto', marginLeft: 2 }}
                alt='avatar'
                width={484}
                height={484}
              />

            </div>
          </div>
        </div>
      </div>
    </div>
  );

}

export const getServerSideProps = async ({ query }) => {

  const { id } = query;
  const alliance = await prisma.alliances.findFirst({
    where: { id: parseInt(id) }, include: {
      leader: {
        select: {
          display_name: true,
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
            },
          },
          role: {
            select: {
              name: true,
            },
          },
        },
      },
    }, });
  if (!alliance) {
    return { notFound: true };
  }
  return { props: { alliance } };
}

export default Index;