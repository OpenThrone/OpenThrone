
import { Grid, Space, Group, Button, Text } from "@mantine/core";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";
import Modal from "./modal";
import SpyMissionsModal from "./spyMissionsModal";
import { useState } from "react";

const AssassinateResult = ({ battle, viewerID }) => {
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const [isSpyModalOpen, setIsSpyModalOpen] = useState(false);
  const [isAttackModalOpen, setIsAttackModalOpen] = useState(false);
  const isViewerAttacker = viewerID === attackerPlayer.id
  const isAttackerWinner = winner === attackerPlayer.id;

  const toggleSpyModal = () => {
    setIsSpyModalOpen(!isSpyModalOpen);
  };

  const toggleAttackModal = () => {
    setIsAttackModalOpen(!isAttackModalOpen);
  }

  const summaryLines = []

  summaryLines.push(`Battle ID: ${battle.id}`);
  if (isViewerAttacker)
    summaryLines.push(`You sent ${stats.spyResults.spiesSent} ${stats.spyResults.spiesSent > 1 ? 'spies' : 'spy'} to ${defenderPlayer.display_name}`);

  summaryLines.push(`${isViewerAttacker ? 'You were' : attackerPlayer.display_name + ' was'} ${isAttackerWinner && stats.spyResults.unitsKilled > 0 ? 'successful' : 'unsuccessful.'}`);
  let unitToAttack = () => {
    switch (stats.spyResults.unit) {
      case 'CITIZEN/WORKERS':
        return 'Citizens and Workers'
      case 'OFFENSE':
        return 'Offensive Units'
      case 'DEFENSE':
        return 'Defensive Units'
  }
  }
  summaryLines.push(`Your spies were tasked with killing as many ${unitToAttack()} as possible.`);
  if (isAttackerWinner && stats.spyResults.unitsKilled > 0) {
      summaryLines.push(`You successfully killed ${stats.spyResults.unitsKilled} ${unitToAttack()}`);
  } else {
    summaryLines.push('No units were killed');
  }
  if (stats.spyResults.spiesLost > 0) {
    
  }
  
  const sentence = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        delayChildren: 1,
        staggerChildren: 0.06,
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
    <div>
      <Grid grow className="gap-5">
        <Grid.Col span={3} md={4} className="text-center">
          <h2 className="text-center mt-2">{attackerPlayer?.display_name}</h2>
          <center>
            <Image
              src={`${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/shields/${attackerPlayer?.race}_150x150.webp`}
              className="ml-2"
              alt="attacker avatar"
              width={150}
              height={150}
            />
          </center>
        </Grid.Col>
        <Grid.Col span={6} md={4} className="text-center">
          <Space h='10' />
          <div className="text-container inline-block align-middle">
            <Text color="white" fw="bolder" size='xl' className="font-medieval">
              Battle Report
            </Text>

            <Text size='lg' fw='bold' className={`text-2xl ${isAttackerWinner ? 'text-green-400' : 'text-red-400'}`}>
              {isViewerAttacker ? 'You were' : attackerPlayer.display_name + ' was'} {isAttackerWinner ? 'successful' : 'unsuccessful.'}
            </Text>
            <Text size='md' fw='normal' className="text-2xl">
              Battle ID: {battle.id}
            </Text>
            <Space h='10' />
            <Group justify='center'>
              {(isViewerAttacker || viewerID === 1) && (
                <>
                  <Text size="lg" fw='bold'>Another Mission?</Text>
                  <Space h='10' />
                  <Group justify='center'>

                    <Button onClick={toggleSpyModal}>
                      Send More Spies
                    </Button>
                    <SpyMissionsModal
                      isOpen={isSpyModalOpen}
                      toggleModal={toggleSpyModal}
                      defenderID={defenderPlayer?.id}
                    />
                    <Button onClick={toggleSpyModal}>
                      Infiltrate
                    </Button>
                    <Button onClick={toggleSpyModal}>
                      Assassinate
                    </Button>
                    <Button onClick={toggleAttackModal}>
                      Attack
                    </Button>
                    <Modal
                      isOpen={isAttackModalOpen}
                      toggleModal={toggleAttackModal}
                      profileID={defenderPlayer.id}
                    />
                  </Group>
                </>
              )}
            </Group>

          </div>
        </Grid.Col>
        <Grid.Col span={3} md={4} className="text-center">
          <h2 className="text-center mt-2">{defenderPlayer?.display_name}</h2>
          <center>
            <Image
              src={`${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/shields/${defenderPlayer?.race}_150x150.webp`}
              className="ml-2"
              alt="defender avatar"
              width={150}
              height={150}
            />
          </center>
        </Grid.Col>
      </Grid>
      <div style={{
        backgroundImage: `url(${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/background/advisor-scroll.webp)`,
        paddingLeft: '70px',
        paddingRight: '70px',
        backgroundSize: '75% 100%',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        paddingTop: '60px',
        paddingBottom: '90px',
      }}
        className='text-center min-h-96'>
        <p className="text-2xl text-black font-medieval font-bold">Assassination Report</p>
        <AnimatePresence>
          {summaryLines.map((line, i) => (
            <motion.p
              className="load-screen--message font-medieval font-semibold text-2xl"
              variants={sentence}
              initial="hidden"
              animate="visible"
              exit="exit"
              key={`${i}-secondanimate`}
            >
              {line.split('').map((char, index) => (
                <motion.span key={`${char}-${index}-2`} variants={letter} className='text-lg mb-2 text-black'>
                  {char}
                </motion.span>
              ))}

            </motion.p>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default AssassinateResult;