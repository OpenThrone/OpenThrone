import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log("🚀 Starting Migration...");

  // 1. Create Era 1 (Legacy)
  const era1 = await prisma.era.create({
    data: {
      name: "Era 1: Ancient History",
      startDate: new Date('2023-01-01'), 
      endDate: new Date(), // Ending it now
    }
  });

  // 2. Create Era 2 (Current)
  const era2 = await prisma.era.create({
    data: {
      name: "Era 2: A New Age",
      startDate: new Date(),
    }
  });

  const users = await prisma.users.findMany();

  for (const user of users) {
    console.log(`Processing user: ${user.display_name}`);

    // 3. Snapshot Era 1 data into UserEra table (Novelty/Legacy)
    await prisma.userEra.create({
      data: {
        userId: user.id,
        eraId: era1.id,
        levelAtStart: 1,
        goldAtEnd: user.gold,
        offenseAtEnd: user.offense ?? 0,
        defenseAtEnd: user.defense ?? 0,
        spyAtEnd: user.spy ?? 0,
        sentryAtEnd: user.sentry ?? 0,
        fortLevelAtEnd: user.fort_level,
        economyLevelAtEnd: user.economy_level,
        // Save their old JSON blobs as a "snapshot" for history
        unitsAtStart: user.units || [], 
        achievements: user.achievements || {},
      }
    });

    // 4. Move JSON Units to normalized UserUnit table
    // Adjust logic based on your JSON structure
    const oldUnits = user.units as any[];
    if (Array.isArray(oldUnits)) {
      for (const u of oldUnits) {
        await prisma.userUnit.create({
          data: {
            userId: user.id,
            type: u.type, // CITIZEN, WORKER, etc.
            level: u.level || 1,
            quantity: u.quantity || 0,
            isMercenary: false
          }
        });
      }
    }

    // 5. Repeat for Items, Battle Upgrades, etc.
    // (Follow the same pattern as above)

    // 6. Point User to Era 2 and Reset Stats
    await prisma.users.update({
      where: { id: user.id },
      data: {
        currentEraId: era2.id,
        gold: 25000, // Starting gold for Era 2
        experience: 0,
        fort_level: 1,
        // Note: We leave display_name, email, and password alone
      }
    });
  }

  console.log("✅ Migration Successful. Era 1 archived, Era 2 started.");
}

main().catch(console.error);
