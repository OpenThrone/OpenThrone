'use server';
import prisma from "@/lib/prisma";
import { withAuth } from "@/middleware/auth";
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
  const lukScore = calculateUserScore(luk);
  const revScore = calculateUserScore(rev);
  const johnnyScore = calculateUserScore(johnny);
  const lukScore2 = calculateUserScore(luk, .7, .2, .1, .05, .03);
  const revScore2 = calculateUserScore(rev, .7, .2, .1, .05, .03);
  const johnnyScore2 = calculateUserScore(johnny, .7, .2, .1, .05, .03);
  let allUsers = await prisma.users.findMany({ where: { AND: [{ id: { not: 0 } }, { last_active: { not: null } }] } });
  allUsers.forEach(user => {
    const nowdate = new Date();
    const lastActiveTimestamp = new Date(user.last_active).getTime();
    const nowTimestamp = nowdate.getTime();
    const population = user.units.reduce((acc, unit) => acc + unit.quantity, 0);
    user.population = population;
    user.isOnline = ((nowTimestamp - lastActiveTimestamp) / (1000 * 60) <= 15);
  });

  const originalAllUsers = JSON.parse(JSON.stringify(stringifyObj(allUsers)));
  originalAllUsers.forEach(user => user.score = calculateUserScore(user));
  originalAllUsers.sort((a, b) => b.score.total - a.score.total);

  const modifiedAllUsers = JSON.parse(JSON.stringify(stringifyObj(allUsers)));
  modifiedAllUsers.forEach(user => user.score = calculateUserScore(user, .7, .2, .1, .4, .3));
  modifiedAllUsers.sort((a, b) => b.score.total - a.score.total);

  const modifiedAllUsers2 = JSON.parse(JSON.stringify(stringifyObj(allUsers)));
  modifiedAllUsers2.forEach(user => user.score = calculateUserScore(user, .00001, .2, .1, .6, .5));
  modifiedAllUsers2.sort((a, b) => b.score.total - a.score.total);
  return res.status(200).json(
    {
      status: 'success',
      results: [
        { original: originalAllUsers.map(user => ({ id: user.id, level: getLevelFromXP(user.experience), displayName: user.display_name, score: user.score.total, unitScore: user.score.unitScore, itemScore: user.score.itemScore })).slice(0, 10) },
        { modified: modifiedAllUsers.map(user => ({ id: user.id, level: getLevelFromXP(user.experience), displayName: user.display_name, score: user.score.total, unitScore: user.score.unitScore, itemScore: user.score.itemScore })).slice(0, 10) },
        { modified2: modifiedAllUsers2.map(user => ({ id: user.id, level: getLevelFromXP(user.experience), displayName: user.display_name, score: user.score.total, unitScore: user.score.unitScore, itemScore: user.score.itemScore })).slice(0, 10) },

      ],
    }
    );
}

export default withAuth(handler);