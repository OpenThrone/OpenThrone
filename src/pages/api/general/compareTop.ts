'use server';
import { UnitTypes } from "@/constants";
import prisma from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
import UserModel from "@/models/Users";
import { calculateStrength } from "@/utils/attackFunctions";
import { stringifyObj } from '@/utils/numberFormatting';
import { getLevelFromXP } from "@/utils/utilities";

const calculateUserScore = (user, xp = .7, fort = .2, house = .1, unit = .004, item = .003) => {
  const unitScore = user.units
    ? user.units.map((unit) => unit.quantity).reduce((a, b) => a + b, 0)
    : 0;
  const itemScore = user.items
    ? user.items.map((item) => item.quantity * (item.level * 0.1)).reduce((a, b) => a + b, 0)
    : 0;

  return {total: xp * user.experience +
    fort * user.fort_level +
    house * user.house_level +
    unit * unitScore +
    item * itemScore, itemScore, unitScore};
};

const handler = async (req, res) => {
  const luk = await prisma?.users.findUnique({
    where: { id: Number(20) },
  });
  const rev = await prisma?.users.findUnique({
    where: { id: Number(27) },
  });
  const johnny = await prisma?.users.findUnique({
    where: { id: Number(76) },
  });
  let allUsers = await prisma.users.findMany({ where: { AND: [{ id: { not: 0 } }, { last_active: { not: null } }] } });
  allUsers.forEach(user => {
    const uModel = new UserModel(user);
    const population = uModel.population;
    user.population = population;
    user.ks = calculateStrength(uModel, 'OFFENSE');
    user.ds = calculateStrength(uModel, 'DEFENSE');
    user.networth = uModel.networth;
  });

  const originalAllUsers = JSON.parse(JSON.stringify(stringifyObj(allUsers)));
  originalAllUsers.forEach(user => user.score = calculateUserScore(user));
  originalAllUsers.sort((a, b) => b.score.total - a.score.total);
  return res.status(200).json(
    
      originalAllUsers.map(user => (
            {
              id: user.id,
              level: getLevelFromXP(user.experience),
              xp: user.experience,
              displayName: user.display_name,
              score: user.score.total,
              unitScore: user.score.unitScore,
              itemScore: user.score.itemScore,
              ks: user.ks,
              ds: user.ds,
              netWorth: user.networth,
              fortLevel: user.fort_level,
              houseLevel: user.house_level,
              population: user.population,
            })).slice(0, 30)
        
    );
}

export default withAuth(handler);