'use server';
import prisma from "@/lib/prisma";
import { attackHandler } from '@/app/actions';
import { withAuth } from '@/middleware/auth';
import { simulateBattle } from "@/utils/attackFunctions";
import UserModel from "@/models/Users";
import { stringifyObj } from "@/utils/numberFormatting";

const handler = async (req, res) => {
  const session = req.session;
  if (session) {

    let myUser = await prisma?.users.findUnique({
      where: { id: parseInt(session.user.id) },
    });

    if ((myUser.id === 1 || myUser.id === 2) && req.query.aId !== undefined) {
      myUser = await prisma?.users.findUnique({
        where: { id: parseInt(req.query.aId) },
      });
    }
      

    if (!myUser) {
      return res.status(400).json({ status: 'failed', msg: 'Attacker not found' });
    }

    if (req.query.dId === undefined) {
      return res.status(400).json({ status: 'failed', msg: 'Defender ID "dId" not set' });
    }

    const dUser = await prisma?.users.findUnique({
      where: { id: parseInt(req.query.dId) },
    });

    /*if (req.body.turns > myUser.attack_turns) {
      return res.status(400).json({ status: 'failed' });
    }*/

    const attacker = new UserModel(JSON.parse(JSON.stringify(stringifyObj(myUser))));
    const defender = new UserModel(JSON.parse(JSON.stringify(stringifyObj(dUser))));

    const results = await simulateBattle(
      attacker,
      defender,
      10
    );

    return res.status(200).json({
      'Attacker': results.attacker.displayName, 
      'Defender': results.defender.displayName,
      'AttackerResult': results.experienceResult.Result,
      'AttackerLosses': results.Losses.Attacker.total,
      'DefenderLosses': results.Losses.Defender.total,
      'PillagedGold': results.pillagedGold.toString(),
      'XPEarned': results.experienceResult.Experience,
      'FortDmg': defender.fortHitpoints - results.fortHitpoints,
    });
  }
}
 export default withAuth(handler);