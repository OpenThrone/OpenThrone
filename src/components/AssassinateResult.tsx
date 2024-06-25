import { ItemTypes } from "@/constants";
import { getLevelFromXP } from "@/utils/utilities";
import { AnimatePresence, motion } from "framer-motion";
import Image from "next/image";

const AssassinateResult = ({ battle, viewerID }) => {
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isViewerAttacker = viewerID === attackerPlayer.id
  const isViewerDefender = viewerID === defenderPlayer.id;
  const isPlayerWinner = winner === viewerID;
  const isAttackerWinner = winner === attackerPlayer.id;
  console.log(stats);
  const lines = [];
  const defenderRace = defenderPlayer?.race ?? 'ELF';

  const describeLosses = (losses) => {
    return Object.entries(losses).map(([key, value]) => {
      const [unitType, unitLevel] = key.split('-');
      return `${value} ${unitType} level ${unitLevel}`;
    }).join(', ');
  };

  const totalLosses = (losses) => {
    if (losses)
      return Object.values(losses).reduce((acc, curr) => acc + curr, 0);
    else return 0;
  };

  const attackerTotalLosses = totalLosses(stats.attacker_losses);
  const defenderTotalLosses = totalLosses(stats.defender_losses);

  const summaryLines = []

  const countUnitsOfType = (units, type) => {
    return units.filter(unit => unit.type === type)
      .reduce((acc, curr) => acc + curr.quantity, 0);
  }

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
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
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
        </div>
        <div className="text-center">
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
        </div>
      </div>
      <div style={{
        backgroundImage: `url(${process.env.NEXT_PUBLIC_AWS_S3_ENDPOINT}/images/background/advisor-scroll.webp)`,
        paddingLeft: '34%',
        paddingRight: '34%',
        backgroundSize: 'contain',
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