import { PrismaClient } from '@prisma/client';

import { logError, logInfo } from '../src/utils/logger';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.users.findMany();

  for (const user of users) {
    logInfo(`Populating default data for user: ${user.display_name}`);

    // Default units
    const defaultUnits = [
      { type: 'CITIZEN', level: 1, quantity: 50 },
      { type: 'WORKER', level: 1, quantity: 0 },
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 0 },
      { type: 'SPY', level: 1, quantity: 0 },
      { type: 'SENTRY', level: 1, quantity: 0 },
    ];

    for (const unit of defaultUnits) {
      await prisma.userUnit.upsert({
        where: {
          userId_type_isMercenary: {
            userId: user.id,
            type: unit.type as any,
            isMercenary: false,
          },
        },
        update: {},
        create: {
          userId: user.id,
          type: unit.type as any,
          level: unit.level,
          quantity: unit.quantity,
          isMercenary: false,
        },
      });
    }

    // Default structure upgrades
    const defaultStructureUpgrades = [
      { type: 'OFFENSE', level: 1 },
      { type: 'SPY', level: 1 },
      { type: 'SENTRY', level: 1 },
      { type: 'ARMORY', level: 1 },
    ];

    for (const upgrade of defaultStructureUpgrades) {
      await prisma.userStructureUpgrade.upsert({
        where: {
          userId_type: {
            userId: user.id,
            type: upgrade.type as any,
          },
        },
        update: {},
        create: {
          userId: user.id,
          type: upgrade.type as any,
          level: upgrade.level,
        },
      });
    }

    // Default battle upgrades
    const defaultBattleUpgrades = [
      { type: 'OFFENSE', level: 1, quantity: 0 },
      { type: 'SPY', level: 1, quantity: 0 },
      { type: 'SENTRY', level: 1, quantity: 0 },
      { type: 'DEFENSE', level: 1, quantity: 0 },
    ];

    for (const upgrade of defaultBattleUpgrades) {
      await prisma.userBattleUpgrade.upsert({
        where: {
          userId_type: {
            userId: user.id,
            type: upgrade.type as any,
          },
        },
        update: {},
        create: {
          userId: user.id,
          type: upgrade.type as any,
          level: upgrade.level,
          quantity: upgrade.quantity,
        },
      });
    }

    // Default bonus points
    const defaultBonusPoints = [
      { type: 'OFFENSE', level: 0 },
      { type: 'DEFENSE', level: 0 },
      { type: 'INCOME', level: 0 },
      { type: 'INTEL', level: 0 },
      { type: 'PRICES', level: 0 },
    ];

    for (const bonus of defaultBonusPoints) {
      await prisma.userBonusPoints.upsert({
        where: {
          userId_type: {
            userId: user.id,
            type: bonus.type as any,
          },
        },
        update: {},
        create: {
          userId: user.id,
          type: bonus.type as any,
          level: bonus.level,
        },
      });
    }

    logInfo(`Finished populating data for user: ${user.display_name}`);
  }
}

main()
  .catch((e) => {
    logError(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
