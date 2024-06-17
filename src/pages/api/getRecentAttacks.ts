// pages/api/social/getTop.ts
import prisma from "@/lib/prisma";
import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth } from '@/middleware/auth';

const getRecentAttacks = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).end();
  }

  const session = req.session;
  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const playerId = session.user.id;
  const { type } = req.query;


  try {
    const relations = await prisma.attack_log.findMany({
      where: {
        timestamp: {
          gt: new Date(Date.now() - 24 * 60 * 60 * 1000 * 7)
        
        }
      }
    });
    const badAttacks = relations.filter((attack) => {
      if (!attack.stats.attacker_units || !attack.stats.defender_units) {
        return false;
      }
      const attackerPop = attack.stats.attacker_units.filter((unit)=>unit.type === 'OFFENSE').reduce((total, unit) => total + unit.quantity, 0);
      const defenderPop = attack.stats.defender_units.filter((unit)=>unit.type === 'DEFENSE' || unit.type === 'WORKER' || unit.type === 'CITIZEN').reduce((total, unit) => total + unit.quantity, 0);
      
      const attackerLosses = Number(attack.stats.attacker_losses?.total || 0);
      const defenderLosses = Number(attack.stats.defender_losses?.total || 0);

      const attackerLossPercent = attackerLosses / attackerPop;
      const defenderLossPercent = defenderLosses / defenderPop;
      return (
        attackerLossPercent > 0.2 && defenderLossPercent < 0.7 ||
        attackerLosses > defenderLosses || 
        defenderLossPercent > .5
      );
    });

    res.status(200).json(badAttacks.map((attack) => (
      { id: attack.id, timestamp: attack.timestamp, attacker_id: attack.attacker_id, defender_id: attack.defender_id, attackerLosses: attack.stats.attacker_losses?.total, defenderLosses: attack.stats.defender_losses?.total, 'fortHPAtEnd': attack.stats.forthpAtEnd }
    )));

  } catch (error) {

    console.error('Error fetching recent attacks:', error);
    res.status(500).json({ error  });
  }
};

export default withAuth(getRecentAttacks);
