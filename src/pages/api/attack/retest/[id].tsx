'use server';
import prisma from "@/lib/prisma";
import { attackHandler, simulateBattle } from '@/app/actions';
import { withAuth } from '@/middleware/auth';
import UserModel from "@/models/Users";
import { stringifyObj } from "@/utils/numberFormatting";

const handler = async (req, res) => {
  const session = req.session;
  if (session) {
    
    if (!req.query.id){
      return res.status(400).json({ status: 'failed' });
    }

    const attack = await prisma?.attack_log.findUnique({
      where: { id: parseInt(req.query.id) },
    });

    if (!attack) {
      return res.status(400).json({ status: 'failed, attack not found' });
    }

    const attacker = new UserModel(JSON.parse(JSON.stringify(stringifyObj(attack.stats.startOfAttack.Attacker))));
    const defender = new UserModel(JSON.parse(JSON.stringify(stringifyObj(attack.stats.startOfAttack.Defender))));

    const results = await simulateBattle(attacker, defender, attack.stats.turns);

    return res
      .status(200)
      .json(
        {
          originalAttackerArmy: attack.stats.startOfAttack.Attacker.units.filter((units) => units.type === 'OFFENSE').reduce((total, unit) => total + unit.quantity, 0),
          originalDefenderArmy: attack.stats.startOfAttack.Defender.units.filter((units) => units.type === 'DEFENSE' || units.type === 'WORKER' || units.type === 'CITIZEN').reduce((total, unit) => total + unit.quantity, 0),
          originalAttackerLosses: attack.stats.attacker_losses.total,
          originalDefenderLosses: attack.stats.defender_losses.total,
          newAttackerArmy: results.attacker.units.filter((units) => units.type === 'OFFENSE').reduce((total, unit) => total + unit.quantity, 0),
          newDefenderArmy: results.defender.units.filter((units) => units.type === 'DEFENSE' || units.type === 'WORKER' || units.type === 'CITIZEN').reduce((total, unit) => total + unit.quantity, 0),
          newAttackerLosses: results.Losses.Attacker.total,
          newDefenderLosses: results.Losses.Defender.total,
        }
      );
  }
  // console.log('failed: ', session);
  return res.status(401).json({ status: 'failed' });
}

export default withAuth(handler);