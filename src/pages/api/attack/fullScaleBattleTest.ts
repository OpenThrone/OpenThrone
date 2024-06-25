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

    if (session.user.id !== 1 && session.user.id !== 2) {
      return res.status(401).json({ status: 'failed', msg: 'Unauthorized', session });
    }

    let myUser
    if ((session.user.id === 1 || session.user.id === 2) && req.query.aId !== undefined) {
      myUser = await prisma?.users.findUnique({
        where: { id: parseInt(req.query.aId) },
      });
    }

    const allBattleResults = [];

    if (myUser) {

      const allUsers = await prisma?.users.findMany({
        where: { id: { notIn: [0, 1, 2] } },
      });

      for (const user of allUsers) {
        if (user.id === myUser.id) {
          allUsers.splice(allUsers.indexOf(user), 1);
        }
      }

      for (let i = 0; i < allUsers.length; i++) {
        const attacker = new UserModel(JSON.parse(JSON.stringify(stringifyObj(myUser))));
        const defender = new UserModel(JSON.parse(JSON.stringify(stringifyObj(allUsers[i]))));
        const results = await simulateBattle(
          attacker,
          defender,
          10
        );
        allBattleResults.push({
          'Attacker': results.attacker.displayName + " - ID:" + results.attacker.id,
          'AttackerArmy': attacker.unitTotals.offense,
          'Defender': results.defender.displayName + " - ID:" + results.defender.id,
          'DefenderArmy': defender.unitTotals.defense + defender.unitTotals.citizens + defender.unitTotals.workers,
          'Offense': attacker.offense,
          'Defense:': defender.defense,
          'AttackerResult': results.experienceResult.Result,
          'AttackerLosses': results.Losses.Attacker.total,
          'DefenderLosses': results.Losses.Defender.total,
          'PillagedGold': results.pillagedGold.toString(),
          'XPEarned-Attacker': results.experienceResult.Experience.Attacker,
          'XPEarned-Defender': results.experienceResult.Experience.Defender,
          'FortDmg': defender.fortHitpoints - results.fortHitpoints,
        });
      }
    } else {
      const allUsers = await prisma?.users.findMany({
        where: { id: { notIn: [0] } },
        orderBy: { id: 'asc' },
      });

      for (let i = 0; i < allUsers.length; i++) {
        const attacker = new UserModel(JSON.parse(JSON.stringify(stringifyObj(allUsers[i]))));
        if (attacker.offense === 0) {
          continue;
        }
        const allDefenderUsers = await prisma?.users.findMany({
          where: { id: { notIn: [0, attacker.id] } },
          orderBy: { id: 'asc' },
        });
        for (let j = 0; j < allDefenderUsers.length; j++) {
          const defender = new UserModel(JSON.parse(JSON.stringify(stringifyObj(allDefenderUsers[j]))));
          const results = await simulateBattle(
            attacker,
            defender,
            10
          );
          allBattleResults.push({
            'Attacker': results.attacker.displayName + " - ID:" + results.attacker.id,
            'AttackerArmy': attacker.unitTotals.offense,
            'Defender': results.defender.displayName + " - ID:" + results.defender.id,
            'DefenderArmy': defender.unitTotals.defense + defender.unitTotals.citizens + defender.unitTotals.workers,
            'Offense': attacker.offense,
            'Defense:': defender.defense,
            'AttackerResult': results.experienceResult.Result,
            'AttackerLosses': results.Losses.Attacker.total,
            'DefenderLosses': results.Losses.Defender.total,
            'PillagedGold': results.pillagedGold.toString(),
            'XPEarned-Attacker': results.experienceResult.Experience.Attacker,
            'XPEarned-Defender': results.experienceResult.Experience.Defender,
            'FortDmg': defender.fortHitpoints - results.fortHitpoints,
          });
        }
      }
    }

    const createTable = (data) => {
      let table = '<table border="1"><tr>';
      for (const key in data[0]) {
        table += `<th>${key}</th>`;
      }
      table += '</tr>';
      for (const row of data) {
        table += '<tr>';
        for (const key in row) {
          table += `<td>${row[key]}</td>`;
        }
        table += '</tr>';
      }
      table += '</table>';
      return table;
    }

    const table = createTable(allBattleResults);

    return res.status(200).send(table);
  }
}
 export default withAuth(handler);