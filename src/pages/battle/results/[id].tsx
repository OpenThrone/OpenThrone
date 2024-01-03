import { AnimatePresence, motion } from 'framer-motion';

import prisma from '@/lib/prisma';

const results = ({ battle }) => {
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isPlayerWinner = winner === attackerPlayer.id;
  console.log('Battle: ', battle);
  const lines = [];
  console.log(defenderPlayer)
  const defenderRace = defenderPlayer?.race ?? 'ELF'; // assuming you have access to the race of the player.
  console.log(defenderRace);
  const scenarios = {
    ELF: {
      setting: "in the tranquil and ancient forests, home to the Elves",
      environment: "The leaves rustled, whispering secrets of old, as the air was filled with the melody of nature",
    },
    UNDEAD: {
      setting: "in the forsaken and haunted lands of the Undead",
      environment: "The air was thick with the stench of decay, and the silence was broken by distant, eerie howls",
    },
    GOBLIN: {
      setting: "in the chaotic and cluttered warrens of the Goblins",
      environment: "The tunnels echoed with mischievous cackles, and the cluttered terrain was a labyrinth of traps and treasures",
    },
    HUMAN: {
      setting: "in the bustling and fortified kingdoms of Humans",
      environment: "The banners fluttered in the breeze, and the sound of steel and horses filled the air with anticipation",
    },
  };

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

  lines.push(`In a world of mystique and wonder, ${attackerPlayer.display_name} embarked on a journey to ${scenarios[defenderRace].setting}.`);
  lines.push(`With valor in their heart, ${attackerPlayer.display_name} sought to challenge the might of ${defenderPlayer.display_name}.`);
  lines.push(scenarios[defenderRace].environment);
  lines.push(`The battle ensued, a dance of fate and steel, with ${attackerPlayer.display_name} dealing a total fort damage of ${stats.fortDamage}.`);
  lines.push(`The forces clashed with unparalleled fervor. ${attackerPlayer.display_name} suffered total losses of ${attackerTotalLosses} units, while ${defenderPlayer.display_name} suffered losses of ${defenderTotalLosses} units.`);
  lines.push(`Despite the losses, the spirits of the warriors remained unbroken, each side determined to claim victory.`);
  lines.push(`When the echoes of battle faded, ${isPlayerWinner ? attackerPlayer.display_name : defenderPlayer.display_name} emerged victorious, a symbol of power and resilience in this epic confrontation!`);
  lines.push(`${attackerPlayer.display_name} garnered ${stats.xpEarned} experience points and ${isPlayerWinner ? `pillaged ${stats.pillagedGold} gold` : `safeguarded their treasures`} from the ravages of war.`);
  lines.push(`This saga will traverse through time, a beacon of the valor and spirit of the warriors, a tale sung by bards in the candlelit nights.`);

  const summaryLines = []

  summaryLines.push(`Battle ID: ${battle.id}`);
  summaryLines.push(`Attacker: ${attackerPlayer.display_name}`);
  summaryLines.push(`Defender: ${defenderPlayer.display_name}`);
  summaryLines.push(`Winner: ${isPlayerWinner ? attackerPlayer.display_name : defenderPlayer.display_name}`);
  summaryLines.push(`XP Earned by Attacker: ${stats.xpEarned}`);
  summaryLines.push(`Gold Pillaged: ${isPlayerWinner ? stats.pillagedGold.toLocaleString() : 0}`);
  summaryLines.push(`Fort Damage Dealt by Attacker: ${stats.forthpAtStart - stats.forthpAtEnd}`);
  summaryLines.push(`Attack Turns Used: ${stats.turns}`);
  summaryLines.push(`Total Units Lost by Attacker: ${attackerTotalLosses}`);
  summaryLines.push(`Total Units Lost by Defender: ${defenderTotalLosses}`);

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
            key={`${i}-firstanimate` }
          >
            {line.split('').map((char, index) => (
              <motion.span key={`${char}-${index}-1`} variants={letter}>
                {char}
              </motion.span>
            ))}
          </motion.h3>
        ))}
        <br />
        <h2>Battle Summary</h2>
        {summaryLines.map((line, i) => (
          <motion.h3
            className="load-screen--message"
            variants={sentence}
            initial="hidden"
            animate="visible"
            exit="exit"
            key={`${i}-secondanimate`}
          >
            {line.split('').map((char, index) => (
              <motion.span key={`${char}-${index}-2`} variants={letter}>
                {char}
              </motion.span>
            ))}
          </motion.h3>
        ))}
      </AnimatePresence>
    </div>
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
          race:true
        },
      },
      defenderPlayer: {
        select: {
          id: true,
          display_name: true,
          race: true
        },
      },
    },
  });

  return { props: { battle: results } };
};

export default results;
