import { AnimatePresence, motion } from 'framer-motion';
import { getSession, useSession } from 'next-auth/react';
import prisma from '@/lib/prisma';
import AttackResult from '@/components/attackResult';
import IntelResult from '@/components/IntelResult';
import AssassinateResult from '@/components/AssassinateResult';
import { InferGetStaticPropsType } from "next";
import { useRouter } from 'next/router';
import PageTemplate from '@/components/PageTemplate';

const ResultsPage = ({ battle, lastGenerated }: InferGetStaticPropsType<typeof getStaticProps>) => {
  const { data: session, status } = useSession();
  const router = useRouter();

  if (status === 'loading') {
    return <p>Loading...</p>;
  }

  if (session) {
    console.log('session', session)
  }

  if (status === 'unauthenticated') {
    router.replace('/auth/signin');
    return null;
  }

  return (
    <PageTemplate title="Battle Results">
      {battle.type === 'attack' ? (
        <AttackResult battle={battle} viewerID={session.user.id} />
      ) : battle.type === 'ASSASSINATE' ? (
        <AssassinateResult battle={battle} viewerID={session.user.id} />
      ) : (
            <IntelResult battle={battle} viewerID={session.user.id} lastGenerated={lastGenerated} />
      )}
    </PageTemplate>
  );
};

export const getStaticProps = async (context) => {
  const { params } = context;
  const id = parseInt(params.id, 10);

  const results = await prisma.attack_log.findFirst({
    where: { id },
    include: {
      attackerPlayer: {
        select: {
          id: true,
          display_name: true,
          race: true,
        },
      },
      defenderPlayer: {
        select: {
          id: true,
          display_name: true,
          race: true,
        },
      },
    },
  });

  return {
    props: { battle: results, lastGenerated: new Date().toISOString() },
    revalidate: 60, // Revalidate the page every 60 seconds
  };
};

export const getStaticPaths = async () => {
  const battles = await prisma.attack_log.findMany({
    select: { id: true },
  });

  const paths = battles.map((battle) => ({
    params: { id: battle.id.toString() },
  }));

  return {
    paths,
    fallback: 'blocking', // Use 'blocking' to generate paths on-demand if not pre-rendered
  };
};

export default ResultsPage;
