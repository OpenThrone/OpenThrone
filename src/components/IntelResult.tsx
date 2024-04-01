import { ItemTypes } from "@/constants";
import { getLevelFromXP } from "@/utils/utilities";
import { AnimatePresence, motion } from "framer-motion";

const IntelResult = ({ battle, viewerID }) => {
  const { attackerPlayer, defenderPlayer, winner, stats } = battle;
  const isViewerAttacker = viewerID === attackerPlayer.id
  const isViewerDefender = viewerID === defenderPlayer.id;
  const isPlayerWinner = winner === viewerID;
  const isAttackerWinner = winner === attackerPlayer.id;
  console.log(stats);

  const summaryLines = []

  summaryLines.push({ text: `Battle ID: ${battle.id}`, className:"text-xl text-black font-medieval font-bold" });
  if (isViewerAttacker)
    summaryLines.push({ text: `You sent ${stats.spyResults.spiesSent} ${stats.spyResults.spiesSent > 1 ? 'spies' : 'spy'} to ${defenderPlayer.display_name}`, className:"text-lg text-black font-semibold" });

  summaryLines.push({ text: `${isViewerAttacker ? 'You were' : attackerPlayer.display_name + ' was'} ${isAttackerWinner ? 'successful' : 'unsuccessful.'}`, className: `text-2xl ${isAttackerWinner ? 'text-green-900' : 'text-red-600'}` });
  if (isAttackerWinner) {
    if (stats.spyResults.intelligenceGathered.units && stats.spyResults.intelligenceGathered.units.length > 0) {
      summaryLines.push({ text: 'Units Found', className:"text-xl text-black font-bold underline"});
      stats.spyResults.intelligenceGathered.units.forEach(unit => {

        const uType = unit.type[0] + unit.type.slice(1).toLowerCase();
        summaryLines.push({ text: `${unit.quantity}x Level ${unit.level} ${uType} Units found`, className: "text-lg mb-2 text-black font-semibold" });
      });
    }
    if (stats.spyResults.intelligenceGathered.items && stats.spyResults.intelligenceGathered.items.length > 0) {
      summaryLines.push({ text: 'Items Found', className: "text-xl text-black font-bold underline" });
      stats.spyResults.intelligenceGathered.items.forEach(item => {
        const iName = ItemTypes.find(i => i.usage === item.usage && i.level === item.level && i.type === item.type).name;
        summaryLines.push({ text: `${item.quantity}x ${item.usage} ${iName} found`, className: "text-lg mb-2 text-black font-semibold" });
      });
    }
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
            <img
              src={`/assets/shields/${attackerPlayer?.race}_150x150.webp`}
              className="ml-2"
            />
          </center>
        </div>
        <div className="text-center">
          <h2 className="text-center mt-2">{defenderPlayer?.display_name}</h2>
          <center>
            <img
              src={`/assets/shields/${defenderPlayer?.race}_150x150.webp`}
              className="ml-2"
            />
          </center>
        </div>
      </div>
      <div style={{
        backgroundImage: 'url(/assets/images/scroll.webp)',
        paddingLeft: '70px',
        paddingRight: '70px',
        backgroundSize: 'contain',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        paddingTop: '60px',
        paddingBottom: '90px',
      }}
        className='text-center min-h-96'>
        <p className="text-2xl text-black font-medieval font-bold">Intelligence Report</p>
        <AnimatePresence>
          {summaryLines.map((line, i) => (
            <motion.p
              className={`load-screen--message font-medieval ${line.className}`}
              variants={sentence}
              initial="hidden"
              animate="visible"
              exit="exit"
              key={`${i}-secondanimate`}
            >
              {line.text.split('').map((char, index) => (
                <motion.span key={`${char}-${index}-2`} variants={letter}>
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

export default IntelResult;