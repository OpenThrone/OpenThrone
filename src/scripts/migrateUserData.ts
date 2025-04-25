import prisma from '../lib/prisma';

async function migrateUserData() {
  const users = await prisma.users.findMany();

  for (const user of users) {
    // --- Units ---
    if (Array.isArray(user.units)) {
      for (const unit of user.units) {
        if (!unit.type || unit.level === undefined) continue;
        await prisma.user_units.upsert({
          where: {
            userId_type_level: {
              userId: user.id,
              type: unit.type,
              level: unit.level,
            },
          },
          update: { quantity: unit.quantity },
          create: {
            userId: user.id,
            type: unit.type,
            level: unit.level,
            quantity: unit.quantity,
          },
        });
      }
    }

    // --- Items ---
    if (Array.isArray(user.items)) {
      for (const item of user.items) {
        if (!item.type || !item.usage || item.level === undefined) continue;
        await prisma.user_items.upsert({
          where: {
            userId_type_usage_level: {
              userId: user.id,
              type: item.type,
              usage: item.usage,
              level: item.level,
            },
          },
          update: { quantity: item.quantity },
          create: {
            userId: user.id,
            type: item.type,
            usage: item.usage,
            level: item.level,
            quantity: item.quantity,
          },
        });
      }
    }

    // --- Battle Upgrades ---
    if (Array.isArray(user.battle_upgrades)) {
      for (const upgrade of user.battle_upgrades) {
        if (!upgrade.type || upgrade.level === undefined) continue;
        await prisma.user_battle_upgrades.upsert({
          where: {
            userId_type_level: {
              userId: user.id,
              type: upgrade.type,
              level: upgrade.level,
            },
          },
          update: { quantity: upgrade.quantity },
          create: {
            userId: user.id,
            type: upgrade.type,
            level: upgrade.level,
            quantity: upgrade.quantity,
          },
        });
      }
    }

    // --- Structure Upgrades ---
    if (Array.isArray(user.structure_upgrades)) {
      for (const upgrade of user.structure_upgrades) {
        if (!upgrade.type || upgrade.level === undefined) continue;
        await prisma.user_structure_upgrades.upsert({
          where: {
            userId_type: {
              userId: user.id,
              type: upgrade.type,
            },
          },
          update: { level: upgrade.level },
          create: {
            userId: user.id,
            type: upgrade.type,
            level: upgrade.level,
          },
        });
      }
    }
  }

  console.log('Migration complete!');
  await prisma.$disconnect();
}

migrateUserData().catch((e) => {
  console.error(e);
  process.exit(1);
});
