import { PrismaClient } from '@prisma/client';

import { logError, logInfo } from '../src/utils/logger';

const prisma = new PrismaClient();

async function main() {
  const users = await prisma.users.findMany();

  for (const user of users) {
    logInfo(`Migrating data for user: ${user.display_name}`);

    // Migrate units
    if (typeof user.units_json === 'string' && user.units_json.trim() !== '') {
      try {
        const units = JSON.parse(user.units_json);
        for (const unit of units) {
          await prisma.userUnit.create({
            data: {
              userId: user.id,
              type: unit.type,
              level: unit.level,
              quantity: unit.quantity,
            },
          });
        }
      } catch (error) {
        logError(
          `Error parsing units_json for user ${user.display_name}:`,
          error,
        );
      }
    }

    // Migrate mercenaries
    if (
      typeof user.mercenaries_json === 'string' &&
      user.mercenaries_json.trim() !== ''
    ) {
      try {
        const mercenaries = JSON.parse(user.mercenaries_json);
        for (const merc of mercenaries) {
          await prisma.userUnit.create({
            data: {
              userId: user.id,
              type: merc.type,
              level: merc.level,
              quantity: merc.quantity,
              isMercenary: true,
            },
          });
        }
      } catch (error) {
        logError(
          `Error parsing mercenaries_json for user ${user.display_name}:`,
          error,
        );
      }
    }

    // Migrate items
    if (typeof user.items_json === 'string' && user.items_json.trim() !== '') {
      try {
        const items = JSON.parse(user.items_json);
        for (const item of items) {
          await prisma.userItem.create({
            data: {
              userId: user.id,
              type: item.type,
              level: item.level,
              usage: item.usage,
              quantity: item.quantity,
            },
          });
        }
      } catch (error) {
        logError(
          `Error parsing items_json for user ${user.display_name}:`,
          error,
        );
      }
    }

    // Migrate battle upgrades
    if (
      typeof user.battle_upgrades_json === 'string' &&
      user.battle_upgrades_json.trim() !== ''
    ) {
      try {
        const battleUpgrades = JSON.parse(user.battle_upgrades_json);
        for (const upgrade of battleUpgrades) {
          await prisma.userBattleUpgrade.create({
            data: {
              userId: user.id,
              type: upgrade.type,
              level: upgrade.level,
              quantity: upgrade.quantity,
            },
          });
        }
      } catch (error) {
        logError(
          `Error parsing battle_upgrades_json for user ${user.display_name}:`,
          error,
        );
      }
    }

    // Migrate structure upgrades
    if (
      typeof user.structure_upgrades_json === 'string' &&
      user.structure_upgrades_json.trim() !== ''
    ) {
      try {
        const structureUpgrades = JSON.parse(user.structure_upgrades_json);
        for (const upgrade of structureUpgrades) {
          await prisma.userStructureUpgrade.create({
            data: {
              userId: user.id,
              type: upgrade.type,
              level: upgrade.level,
            },
          });
        }
      } catch (error) {
        logError(
          `Error parsing structure_upgrades_json for user ${user.display_name}:`,
          error,
        );
      }
    }

    // Migrate bonus points
    if (
      typeof user.bonus_points_json === 'string' &&
      user.bonus_points_json.trim() !== ''
    ) {
      try {
        const bonusPoints = JSON.parse(user.bonus_points_json);
        for (const bonus of bonusPoints) {
          await prisma.userBonusPoints.create({
            data: {
              userId: user.id,
              type: bonus.type,
              level: bonus.level,
            },
          });
        }
      } catch (error) {
        logError(
          `Error parsing bonus_points_json for user ${user.display_name}:`,
          error,
        );
      }
    }

    // Nullify old JSON columns
    await prisma.users.update({
      where: { id: user.id },
      data: {
        units_json: null,
        mercenaries_json: null,
        items_json: null,
        battle_upgrades_json: null,
        structure_upgrades_json: null,
        bonus_points_json: null,
      },
    });

    logInfo(`Finished migrating data for user: ${user.display_name}`);
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
