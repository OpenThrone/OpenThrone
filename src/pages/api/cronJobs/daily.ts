import UserModel from "@/models/Users";
import md5 from "md5";
import { NextApiRequest, NextApiResponse } from "next";

/**
 * Update a single user for a new day.
 *
 * @param {Object} currentUser
 * @return {Promise}
 */
const updateUserPerDay = (currentUser) => {
  try {
    // Find the CITIZEN unit
    let citizenUnit = currentUser.units.find(unit => unit.type === 'CITIZEN');
    const originalCitizens = currentUser.citizens;
    if (citizenUnit) {
      if (!citizenUnit.quantity) {
        // Catch if something caused the quantity to be null at some point
        citizenUnit.quantity = 0;
      }
      // If CITIZEN unit is found, increment its quantity
      citizenUnit.quantity += currentUser.recruitingBonus;
    } else {
      // If CITIZEN unit is not found, create one and set its quantity
      citizenUnit = {
        type: 'CITIZEN',
        level: 1,
        quantity: currentUser.recruitingBonus
      };
      currentUser.units.push(citizenUnit);
    }

    prisma.bank_history.create({
      data: {
        from_user_id: 0,
        to_user_id: currentUser.id,
        to_user_account_type: 'HAND',
        from_user_account_type: 'BANK',
        date_time: new Date(),
        gold_amount: 0,
        history_type: 'DAILY_RECRUIT',
        stats: {
          currentCitizens: originalCitizens,
          newCitizens: citizenUnit.quantity,
          recruitingBonus: currentUser.recruitingBonus,
        },
      },
    });

    return prisma.users.update({
      where: { id: currentUser.id },
      data: {
        units: currentUser.units,
        ...(!currentUser.recruitingLink && { recruit_link: md5(currentUser.id.toString()) }),
      },
    });
  } catch (error) {
    console.log(`Error updating user ${currentUser.id}: ${error.message}`);
  }
};

/**
 * Execute some cleanup tasks on a daily basis.
 *
 * @return {Promise[]}
 */
const doDailyCleanup = () => {
  const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
  const tablesToClean = [
    { name: 'attack_log', dateField: 'timestamp' },
    { name: 'bank_history', dateField: 'date_time' },
    { name: 'recruit_history', dateField: 'timestamp' },
  ];

  return tablesToClean.map((table) => prisma[table.name].deleteMany({
    where: {
      [table.dateField]: {
        lt: twentyDaysAgo,
      },
    },
  }));
};

const dailyCron = async (req: NextApiRequest, res: NextApiResponse) => {
  const { TASK_SECRET } = process.env;
  if (process.env.DO_DAILY_UPDATES === 'true' && req.headers['authorization'] !== `Bearer ${TASK_SECRET}`) {
    const allUsers = await prisma.users.findMany({ where: { id: 1 } });

    const updatePromises = allUsers.map((singleUser) => updateUserPerDay(new UserModel(singleUser)));
    Promise.all(updatePromises).then(() => console.log('Updated users for day change.'));

    const cleanupPromises = doDailyCleanup();
    Promise.all(cleanupPromises).then(() => console.log('Cleaned up database for day change.'));
    return res.status(200).json({ message: 'Daily cron job executed successfully.' });
  }else
  {
    res.status(401).json({ message: 'Unauthorized', headers: req.headers['authorization'], secret: TASK_SECRET });
  }
};

export default dailyCron;