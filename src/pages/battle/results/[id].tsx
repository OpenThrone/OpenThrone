import { AnimatePresence, motion } from 'framer-motion';

import Layout from '@/components/Layout';
import { Meta } from '@/layouts/Meta';
import prisma from '@/lib/prisma';

const results = ({ battle }) => {
  const lines = [];

  lines.push(`Battle ID: ${battle.id}`);
  lines.push(`Winner ID: ${battle.winner}`);
  lines.push(
    `You attacked ${battle.defenderPlayer.display_name} and ${
      battle.winner === battle.attacker_id ? 'won!' : 'lost!'
    }`
  );

  const sentence = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 1,
        staggerChildren: 0.03,
        staggerDirection: -1,
      },
    },
    exit: { opacity: 0 },
  };

  const letter = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        duration: 0.3,
      },
    },
  };

  return (
    <Layout meta={<Meta title="MetaTitle2" description="Meta Description" />}>
      <div className="mainArea pb-10">
        <h2>Battle Results</h2>
        <AnimatePresence>
          {lines.map((line, i) => (
            <motion.h3
              className="load-screen--message"
              variants={sentence}
              initial="hidden"
              animate="visible"
              exit="exit"
              key={i}
            >
              {line.split('').map((char, index) => (
                <motion.span key={`${char}-${index}`} variants={letter}>
                  {char}
                </motion.span>
              ))}
            </motion.h3>
          ))}
        </AnimatePresence>
      </div>
    </Layout>
  );
};

export const getServerSideProps = async ({ query }) => {
  const id = parseInt(query.id, 10);

  const results = await prisma.attack_log.findFirst({
    where: { id },
    include: {
      attackerPlayer: {
        select: {
          id: true,
          display_name: true,
        },
      },
      defenderPlayer: {
        select: {
          id: true,
          display_name: true,
        },
      },
    },
  });

  return { props: { battle: results } };
};

export default results;
